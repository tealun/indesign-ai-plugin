import type { Bounds } from "../types/protocol.js";

/** InDesign geometricBounds: [y1, x1, y2, x2] = [top, left, bottom, right] */
export function boundsFromGeometric(gb: number[]): Bounds {
  const top = Number(gb[0]);
  const left = Number(gb[1]);
  const bottom = Number(gb[2]);
  const right = Number(gb[3]);
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    unit: "pt",
  };
}

export function geometricFromBounds(b: Bounds): [number, number, number, number] {
  return [b.y, b.x, b.y + b.h, b.x + b.w];
}

export function boundsCenterDrift(a: Bounds, b: Bounds): number {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}
