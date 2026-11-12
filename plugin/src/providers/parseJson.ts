import type { LayoutCommand, ProtocolError, TableDraft } from "../types/protocol.js";
import { validateTableDraft } from "../protocol/tableDraft.js";

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw Object.assign(new Error("PARSE_ERROR"), {
      protocolError: {
        code: "PARSE_ERROR",
        message: "response is not JSON",
        retryable: false,
      } satisfies ProtocolError,
    });
  }
}

export function parseCommandsFromText(text: string): LayoutCommand[] {
  const data = extractJsonObject(text) as { commands?: LayoutCommand[] };
  if (!Array.isArray(data.commands)) {
    throw new Error("missing commands array");
  }
  return data.commands;
}

export function parseTableDraftFromText(text: string): TableDraft {
  const data = extractJsonObject(text) as { tableDraft?: unknown } & Record<string, unknown>;
  const candidate = data.tableDraft ?? data;
  const validated = validateTableDraft(candidate);
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }
  return validated.draft;
}
