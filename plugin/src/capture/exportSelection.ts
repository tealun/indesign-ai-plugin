import { isInDesignRuntime } from "../host/uxpRequire.js";
import { exportSelectionToPngDataUrl } from "../host/indesignHost.js";
import { getLockedSelection } from "../host/session.js";
import { CAPTURE_MAX_EDGE } from "./limits.js";

export type CaptureResult = {
  dataUrl: string;
  width: number;
  height: number;
  scaled: boolean;
  warnings: string[];
};

export { CAPTURE_MAX_EDGE, CAPTURE_TARGET_PPI } from "./limits.js";

export async function exportSelectionPng(): Promise<CaptureResult> {
  const locked = getLockedSelection();
  if (!locked || locked.ids.length === 0) {
    return {
      dataUrl: "",
      width: 0,
      height: 0,
      scaled: false,
      warnings: ["请先读取并锁定选区"],
    };
  }
  if (!isInDesignRuntime()) {
    return {
      dataUrl: "",
      width: 0,
      height: 0,
      scaled: false,
      warnings: ["非 InDesign 运行时，无法导出选区图"],
    };
  }
  return exportSelectionToPngDataUrl(locked.ids);
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
