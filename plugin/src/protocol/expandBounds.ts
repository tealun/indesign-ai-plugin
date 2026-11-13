import type { Bounds } from "../types/protocol.js";

/** Soft floor when selection strip is nearly flat (pt). */
export const MIN_TABLE_ROW_PT = 16;

/**
 * In-place footprint: keep selection top-left and **width**.
 * Only grow height downward when the fake-table strip is too short for the
 * row count. Table columns must fit inside this width (see host fitTableToFrame).
 */
export function expandBoundsForTable(
  bounds: Bounds,
  rowCount: number,
  _columnCount?: number,
): Bounds {
  const rows = Math.max(1, rowCount);
  const neededH = rows * MIN_TABLE_ROW_PT + 8;
  return {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, 12),
    h: Math.max(bounds.h, neededH),
    unit: "pt",
  };
}
