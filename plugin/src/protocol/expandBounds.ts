import type { Bounds } from "../types/protocol.js";

/** Grow union bounds so a multi-row table is actually visible (fake tables are often ~1-line tall). */
export function expandBoundsForTable(
  bounds: Bounds,
  rowCount: number,
  columnCount: number,
): Bounds {
  const rows = Math.max(1, rowCount);
  const cols = Math.max(1, columnCount);
  const minH = Math.max(bounds.h, rows * 18 + 10);
  const minW = Math.max(bounds.w, cols * 42);
  return {
    x: bounds.x,
    y: bounds.y,
    w: minW,
    h: minH,
    unit: "pt",
  };
}
