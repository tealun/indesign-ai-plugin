/**
 * Best-effort plain text from an InDesign selection item (frame / table / cell).
 */

export function extractIndesignItemText(item: any, maxLen = 8000): string {
  if (!item) return "";
  const chunks: string[] = [];

  const push = (s: string) => {
    const t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    if (t) chunks.push(t);
  };

  try {
    if (item.contents != null && typeof item.contents !== "object") {
      push(String(item.contents));
    }
  } catch {
    /* ignore */
  }

  // Selected Table
  try {
    const rows = item.rows;
    if (rows && typeof rows.length === "number" && rows.length > 0) {
      const lines: string[] = [];
      const rowLimit = Math.min(rows.length, 300);
      for (let r = 0; r < rowLimit; r++) {
        const row = rows.item(r);
        const cells = row.cells;
        const parts: string[] = [];
        const colLimit = Math.min(Number(cells?.length ?? 0), 40);
        for (let c = 0; c < colLimit; c++) {
          try {
            parts.push(String(cells.item(c).contents ?? "").replace(/\r/g, ""));
          } catch {
            parts.push("");
          }
        }
        lines.push(parts.join("\t"));
      }
      push(lines.join("\n"));
    }
  } catch {
    /* not a table */
  }

  // Selected Cell → parent table (one cell text)
  try {
    const ctor = String(item.constructor?.name || "");
    if (/cell/i.test(ctor) && item.contents != null) {
      push(String(item.contents));
    }
  } catch {
    /* ignore */
  }

  // Nested tables in a text frame
  try {
    const tables = item.tables;
    if (tables && typeof tables.length === "number" && tables.length > 0) {
      for (let t = 0; t < Math.min(tables.length, 5); t++) {
        const nested = extractIndesignItemText(tables.item(t), maxLen);
        if (nested) push(nested);
      }
    }
  } catch {
    /* no nested tables */
  }

  return chunks.join("\n\n").slice(0, maxLen);
}
