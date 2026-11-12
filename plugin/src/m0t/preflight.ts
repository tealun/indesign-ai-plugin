import type { DocumentHost } from "../executor/types.js";
import type { ProtocolError, TableDraft } from "../types/protocol.js";
import { validateTableDraft } from "../protocol/tableDraft.js";
import { boundsCenterDrift } from "../host/geometry.js";
import type { LockedSelection } from "../host/session.js";

export const DEFAULT_DRIFT_PT = 2;

export async function preflightTableReplace(args: {
  draft: TableDraft;
  tableStyleName: string;
  locked: LockedSelection;
  host: DocumentHost;
  maxDriftPt?: number;
}): Promise<{ ok: true } | { ok: false; error: ProtocolError }> {
  const validated = validateTableDraft(args.draft);
  if (!validated.ok) return validated;

  if (!args.tableStyleName.trim()) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请选择文档中已有的表样式",
        retryable: false,
      },
    };
  }

  const styleOk = await args.host.styleExists("table", args.tableStyleName);
  if (!styleOk) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `表样式不存在: ${args.tableStyleName}`,
        retryable: false,
      },
    };
  }

  const maxDrift = args.maxDriftPt ?? DEFAULT_DRIFT_PT;
  for (const id of args.locked.ids) {
    const exists = await args.host.objectExists(id);
    if (!exists) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `选区对象已丢失: ${id}，请重新选中并识别`,
          retryable: false,
        },
      };
    }
    const live = await args.host.getObjectBounds(id);
    const lockedBounds = args.locked.boundsById[id];
    if (live && lockedBounds) {
      const drift = boundsCenterDrift(live, lockedBounds);
      if (drift > maxDrift) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `选区已移动 ${drift.toFixed(1)}pt（阈值 ${maxDrift}pt），请重新识别`,
            details: { id, drift },
            retryable: false,
          },
        };
      }
    }
  }

  return { ok: true };
}
