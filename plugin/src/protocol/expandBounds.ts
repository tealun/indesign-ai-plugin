import type { Bounds } from "../types/protocol.js";

/** Minimum column width so styled cell text is actually visible (pt). */
export const MIN_TABLE_COL_PT = 42;
/** Approximate row height budget before style/content reflow (pt). */
export const MIN_TABLE_ROW_PT = 18;

/**
 * Keep selection top-left (same place on page).
 * Grow width to the right and height downward when the fake-table strip is
 * too narrow/short for a real multi-column table — otherwise InDesign clips
 * content until the user manually fits the frame.
 */
export function expandBoundsForTable(
  bounds: Bounds,
  rowCount: number,
  columnCount?: number,
): Bounds {
  const rows = Math.max(1, rowCount);
  const cols = Math.max(1, columnCount ?? 1);
  const neededH = rows * MIN_TABLE_ROW_PT + 10;
  const neededW = cols * MIN_TABLE_COL_PT;
  return {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, neededW),
    h: Math.max(bounds.h, neededH),
    unit: "pt",
  };
}
