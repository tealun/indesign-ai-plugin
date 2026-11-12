export type CaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
  scaled: boolean;
  warnings: string[];
};

export const CAPTURE_MAX_EDGE = 2048;
export const CAPTURE_TARGET_PPI = 144;

/**
 * Export selection raster. Scaffold stub — real UXP/ID export in M0-T slice 1.
 * Always applies longest-edge limit policy in normalizeCaptureSize helpers.
 */
export async function exportSelectionPng(): Promise<CaptureResult> {
  return {
    dataUrl: "",
    width: 0,
    height: 0,
    scaled: false,
    warnings: ["capture bridge not implemented — scaffold stub"],
  };
}

export function normalizeEdge(
  width: number,
  height: number,
  maxEdge = CAPTURE_MAX_EDGE,
): { width: number; height: number; scaled: boolean } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge || edge === 0) {
    return { width, height, scaled: false };
  }
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}
