import { validateCommandBatch } from "../protocol/whitelist.js";
import type { ExecutionReport, ProtocolError } from "../types/protocol.js";
import type { RunBatchOptions } from "./types.js";

function resolveRefs(
  value: unknown,
  created: { frameId?: string; tableId?: string },
): unknown {
  if (typeof value === "string") {
    if (value === "$created.frameId") return created.frameId ?? value;
    if (value === "$created.tableId") return created.tableId ?? value;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, created));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveRefs(v, created);
    }
    return out;
  }
  return value;
}

export async function runCommandBatch(
  options: RunBatchOptions,
): Promise<ExecutionReport> {
  const gate = validateCommandBatch(options.commands);
  if (!gate.ok) {
    return {
      requestId: options.requestId,
      ok: false,
      results: [
        {
          index: -1,
          type: "batch",
          ok: false,
          error: gate.error,
        },
      ],
      removeObjectsSkipped: true,
    };
  }

  const created: { frameId?: string; tableId?: string } = {};
  const results: ExecutionReport["results"] = [];

  for (let i = 0; i < options.commands.length; i++) {
    const original = options.commands[i]!;
    if (original.type === "removeObjects") {
      const priorFailed = results.some((r) => !r.ok);
      if (priorFailed) {
        results.push({
          index: i,
          type: original.type,
          ok: false,
          error: {
            code: "EXECUTE_ERROR",
            message: "skipped removeObjects because earlier step failed",
            retryable: false,
          },
        });
        return {
          requestId: options.requestId,
          ok: false,
          created,
          results,
          stoppedAt: i,
          removeObjectsSkipped: true,
        };
      }
    }

    const resolved = resolveRefs(original, created) as typeof original;
    if (
      (original.type === "createTable" &&
        typeof (resolved as { parentFrameId?: string }).parentFrameId ===
          "string" &&
        (resolved as { parentFrameId: string }).parentFrameId.startsWith(
          "$created.",
        )) ||
      (original.type === "writeCellText" &&
        String((resolved as { tableId?: string }).tableId).startsWith(
          "$created.",
        )) ||
      (original.type === "applyTableStyle" &&
        String((resolved as { tableId?: string }).tableId).startsWith(
          "$created.",
        ))
    ) {
      const err: ProtocolError = {
        code: "VALIDATION_ERROR",
        message: "unresolved $created.* reference",
        details: { index: i, type: original.type },
        retryable: false,
      };
      results.push({ index: i, type: original.type, ok: false, error: err });
      return {
        requestId: options.requestId,
        ok: false,
        created,
        results,
        stoppedAt: i,
        removeObjectsSkipped: true,
      };
    }

    const step = await options.host.execute(resolved, { created });
    results.push({
      index: i,
      type: original.type,
      ok: step.ok,
      ...(step.createdId ? { createdId: step.createdId } : {}),
      ...(step.ok
        ? {}
        : {
            error: {
              code: "EXECUTE_ERROR" as const,
              message: step.errorMessage || "execute failed",
              retryable: false,
            },
          }),
    });

    if (step.ok && step.createdId) {
      if (original.type === "createTextFrame") created.frameId = step.createdId;
      if (original.type === "createTable") created.tableId = step.createdId;
    }

    if (!step.ok) {
      return {
        requestId: options.requestId,
        ok: false,
        created,
        results,
        stoppedAt: i,
        removeObjectsSkipped: true,
      };
    }
  }

  return {
    requestId: options.requestId,
    ok: true,
    created,
    results,
    removeObjectsSkipped: false,
  };
}
