import type { ProtocolError, TableDraft } from "../types/protocol.js";

export type TableDraftValidation =
  | { ok: true; draft: TableDraft; bodyRowCount: number; columnCount: number }
  | { ok: false; error: ProtocolError };

/**
 * Vision models often mark every row as header/footer on tiny tables
 * (e.g. 2 rows → header=2). Clamp so at least one body row remains when
 * the matrix has enough rows.
 */
export function normalizeHeaderFooterCounts(
  rowCount: number,
  headerRowCount: number,
  footerRowCount: number,
): { headerRowCount: number; footerRowCount: number; repaired: boolean } {
  let h = Number.isFinite(headerRowCount) ? Math.trunc(headerRowCount) : 1;
  let f = Number.isFinite(footerRowCount) ? Math.trunc(footerRowCount) : 0;
  if (h < 1) h = 1;
  if (f < 0) f = 0;

  if (rowCount < 2) {
    return { headerRowCount: h, footerRowCount: f, repaired: false };
  }

  const beforeH = h;
  const beforeF = f;
  // Need rows.length - h - f >= 1  ⇒  h + f <= rowCount - 1
  const maxHF = rowCount - 1;
  if (h + f > maxHF) {
    // Prefer keeping one header; drop footer first, then shrink header.
    f = Math.min(f, Math.max(0, maxHF - 1));
    h = Math.min(h, maxHF - f);
    if (h < 1) h = 1;
    if (h + f > maxHF) {
      h = 1;
      f = 0;
    }
  }

  return {
    headerRowCount: h,
    footerRowCount: f,
    repaired: h !== beforeH || f !== beforeF,
  };
}

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

  if (rows.length < 2) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "识别结果至少需要表头+正文共 2 行，请补图后重试",
        details: { rows: rows.length },
        retryable: true,
      },
    };
  }

  const normalized = normalizeHeaderFooterCounts(
    rows.length,
    Number(raw.headerRowCount),
    Number(raw.footerRowCount),
  );
  const headerRowCount = normalized.headerRowCount;
  const footerRowCount = normalized.footerRowCount;

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
  void normalized.repaired;

  return { ok: true, draft, bodyRowCount, columnCount };
}
