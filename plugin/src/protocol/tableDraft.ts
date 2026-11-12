import type { ProtocolError, TableDraft } from "../types/protocol.js";

export type TableDraftValidation =
  | { ok: true; draft: TableDraft; bodyRowCount: number; columnCount: number }
  | { ok: false; error: ProtocolError };

export function validateTableDraft(input: unknown): TableDraftValidation {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tableDraft must be an object",
        retryable: false,
      },
    };
  }

  const raw = input as Partial<TableDraft> & { merges?: unknown };
  const headerRowCount = Number(raw.headerRowCount);
  const footerRowCount = Number(raw.footerRowCount);
  const rows = raw.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tableDraft.rows must be a non-empty array",
        retryable: false,
      },
    };
  }

  if (
    !Number.isInteger(headerRowCount) ||
    headerRowCount < 1 ||
    !Number.isInteger(footerRowCount) ||
    footerRowCount < 0
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "invalid headerRowCount/footerRowCount",
        details: { headerRowCount, footerRowCount },
        retryable: false,
      },
    };
  }

  const bodyRowCount = rows.length - headerRowCount - footerRowCount;
  if (!Number.isInteger(bodyRowCount) || bodyRowCount < 1) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "bodyRowCount must be >= 1 (rows.length - header - footer)",
        details: {
          rows: rows.length,
          headerRowCount,
          footerRowCount,
          bodyRowCount,
        },
        retryable: false,
      },
    };
  }

  const columnCount = rows[0]?.length ?? 0;
  if (columnCount < 1) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "columnCount must be >= 1",
        retryable: false,
      },
    };
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length !== columnCount) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `row ${r} column count mismatch`,
          details: { expected: columnCount, actual: row?.length },
          retryable: false,
        },
      };
    }
  }

  const draft: TableDraft = {
    headerRowCount,
    footerRowCount,
    rows: rows.map((row) => row.map((cell) => String(cell ?? ""))),
  };
  if (typeof raw.suggestedTableStyleName === "string") {
    draft.suggestedTableStyleName = raw.suggestedTableStyleName;
  }

  // merges ignored (M0-T)
  void raw.merges;

  return { ok: true, draft, bodyRowCount, columnCount };
}
