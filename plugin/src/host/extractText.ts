/**
 * Best-effort plain text from an InDesign selection item (frame / table / cell / group).
 */

export function extractIndesignItemText(
  item: any,
  maxLen = 8000,
  depth = 0,
): string {
  if (!item || maxLen <= 0) return "";
  const chunks: string[] = [];
  let used = 0;

  const push = (s: string) => {
    if (used >= maxLen) return;
    const t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    if (!t) return;
    const slice = t.slice(0, maxLen - used);
    chunks.push(slice);
    used += slice.length;
  };

  const ctor = String(item.constructor?.name || "");

  // Prefer table TSV when rows exist — skip generic contents to avoid dup
  let didTable = false;
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
      didTable = true;
    }
  } catch {
    /* not a table */
  }

  if (!didTable) {
    try {
      if (item.contents != null && typeof item.contents !== "object") {
        push(String(item.contents));
      }
    } catch {
      /* ignore */
    }
  }

  // Nested tables in a text frame (when not already harvested as table)
  if (!didTable) {
    try {
      const tables = item.tables;
      if (tables && typeof tables.length === "number" && tables.length > 0) {
        for (let t = 0; t < Math.min(tables.length, 5); t++) {
          if (used >= maxLen) break;
          const nested = extractIndesignItemText(
            tables.item(t),
            maxLen - used,
            depth + 1,
          );
          if (nested) push(nested);
        }
      }
    } catch {
      /* no nested tables */
    }
  }

  // Group / container: walk children (bounded)
  if (depth < 4 && used < maxLen) {
    try {
      const kids =
        item.allPageItems ||
        item.pageItems ||
        item.textFrames ||
        null;
      const n = Number(kids?.length ?? 0);
      const limit = Math.min(n, 40);
      for (let i = 0; i < limit; i++) {
        if (used >= maxLen) break;
        const child = typeof kids.item === "function" ? kids.item(i) : kids[i];
        if (!child || child === item) continue;
        const nested = extractIndesignItemText(child, maxLen - used, depth + 1);
        if (nested) push(nested);
      }
    } catch {
      /* no children */
    }
  }

  void ctor;
  return chunks.join("\n\n").slice(0, maxLen);
}
