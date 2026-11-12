import type { Bounds } from "../types/protocol.js";

/**
 * Keep selection top-left + width (same place on page).
 * Only increase height downward when the original fake-table strip is too short.
 */
export function expandBoundsForTable(
  bounds: Bounds,
  rowCount: number,
  _columnCount?: number,
): Bounds {
  const rows = Math.max(1, rowCount);
  const neededH = rows * 14 + 6;
  return {
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: Math.max(bounds.h, neededH),
    unit: "pt",
  };
}
