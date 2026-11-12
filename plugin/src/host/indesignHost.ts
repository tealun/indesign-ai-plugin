import type { DocumentHost, ExecuteContext, ExecuteStepResult } from "../executor/types.js";
import type { Bounds, DocumentSnapshot, LayoutCommand, SelectionItem } from "../types/protocol.js";
import { boundsFromGeometric, geometricFromBounds } from "./geometry.js";
import { tryRequireIndesign, tryRequireUxp } from "./uxpRequire.js";
import { CAPTURE_MAX_EDGE, CAPTURE_TARGET_PPI } from "../capture/limits.js";
import { withTimeout } from "../util/timeout.js";

function getApp(): any {
  const mod = tryRequireIndesign();
  if (!mod?.app) throw new Error("InDesign app not available — 请在 InDesign UXP 面板中运行");
  return mod.app;
}

function getDoc(): any {
  const app = getApp();
  if (!app.documents || app.documents.length < 1) {
    throw new Error("没有打开的文档");
  }
  return app.activeDocument;
}

function pageIndexOfItem(doc: any, item: any): number {
  try {
    const page = item.parentPage;
    if (page && page.documentOffset != null) return Number(page.documentOffset);
  } catch {
    /* fall through */
  }
  try {
    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages.item(i);
      for (let j = 0; j < page.pageItems.length; j++) {
        if (page.pageItems.item(j).id === item.id) return i;
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function classifyItem(item: any): SelectionItem["type"] {
  const name = String(item.constructor?.name || item.reflect?.name || "");
  if (/group/i.test(name)) return "group";
  if (/textframe/i.test(name)) return "textFrame";
  return "graphic";
}

function toSelectionItem(item: any): SelectionItem {
  const bounds = boundsFromGeometric(Array.from(item.geometricBounds as number[]));
  const id = String(item.id);
  const type = classifyItem(item);
  if (type === "textFrame") {
    let storyText = "";
    try {
      storyText = String(item.contents ?? "").slice(0, 5000);
    } catch {
      storyText = "";
    }
    return { id, type, bounds, storyText };
  }
  if (type === "group") {
    let childCount = 0;
    try {
      childCount = Number(item.allPageItems?.length ?? item.pageItems?.length ?? 0);
    } catch {
      childCount = 0;
    }
    return { id, type, bounds, childCount };
  }
  return { id, type: "graphic", bounds };
}

export function unionBounds(items: SelectionItem[]): Bounds {
  if (items.length === 0) {
    return { x: 0, y: 0, w: 100, h: 100, unit: "pt" };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.bounds.x);
    minY = Math.min(minY, it.bounds.y);
    maxX = Math.max(maxX, it.bounds.x + it.bounds.w);
    maxY = Math.max(maxY, it.bounds.y + it.bounds.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, unit: "pt" };
}

export async function readLiveSelectionSnapshot(): Promise<DocumentSnapshot> {
  const doc = getDoc();
  const sel = Array.from(doc.selection as any[]);
  if (sel.length === 0) {
    return {
      documentName: String(doc.name || "document"),
      pageIndex: 0,
      selection: [],
    };
  }
  const selection = sel.map(toSelectionItem);
  const pageIndex = pageIndexOfItem(doc, sel[0]);
  return {
    documentName: String(doc.name || "document"),
    pageIndex,
    selection,
  };
}

export async function listTableStyleNames(): Promise<string[]> {
  const doc = getDoc();
  const names: string[] = [];
  const styles = doc.tableStyles;
  for (let i = 0; i < styles.length; i++) {
    try {
      const s = styles.item(i);
      const name = String(s.name);
      if (name && name !== "[No Table Style]") names.push(name);
    } catch {
      /* skip */
    }
  }
  return names;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function maybeDownscaleDataUrl(
  dataUrl: string,
  maxEdge: number,
): Promise<{ dataUrl: string; width: number; height: number; scaled: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return { dataUrl, width: 0, height: 0, scaled: false, warnings };
  }
  const img = new Image();
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("无法解码导出的 PNG"));
      img.src = dataUrl;
    }),
    15_000,
    "解码导出 PNG",
  );
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const edge = Math.max(w, h);
  if (edge <= maxEdge) {
    return { dataUrl, width: w, height: h, scaled: false, warnings };
  }
  const scale = maxEdge / edge;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    warnings.push("canvas 不可用，使用原图");
    return { dataUrl, width: w, height: h, scaled: false, warnings };
  }
  ctx.drawImage(img, 0, 0, nw, nh);
  warnings.push(`图像已缩放至最长边 ${maxEdge}px`);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: nw,
    height: nh,
    scaled: true,
    warnings,
  };
}

export async function exportSelectionToPngDataUrl(selectionIds: string[]): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  scaled: boolean;
  warnings: string[];
}> {
  const app = getApp();
  const doc = getDoc();
  const uxp = tryRequireUxp();
  if (!uxp) throw new Error("uxp 模块不可用");

  const idn = tryRequireIndesign();
  const ExportFormat = idn?.ExportFormat;
  const prefs = app.pngExportPreferences;
  try {
    prefs.exportResolution = CAPTURE_TARGET_PPI;
    prefs.transparentBackground = true;
    prefs.antiAlias = true;
    if (idn?.PNGColorSpaceEnum) prefs.pngColorSpace = idn.PNGColorSpaceEnum.RGB;
  } catch {
    /* preferences may vary by version */
  }

  const folder = await uxp.storage.localFileSystem.getTemporaryFolder();
  const file = await folder.createFile(`id-ai-sel-${Date.now()}.png`, { overwrite: true });

  // Prefer exporting first selected item (group exports as one). Re-select locked ids.
  const items: any[] = [];
  for (const id of selectionIds) {
    try {
      items.push(doc.pageItems.itemByID(Number(id)));
    } catch {
      /* skip missing */
    }
  }
  if (items.length === 0) throw new Error("锁定的选区对象已不存在，请重新选中");

  doc.selection = items;
  const target = items[0];
  const format = ExportFormat?.PNG_FORMAT ?? "PNG format";

  await withTimeout(
    Promise.resolve().then(() => {
      target.exportFile(format, file);
    }),
    45_000,
    "导出选区 PNG",
  );

  const binary = await withTimeout(
    file.read({ format: uxp.storage.formats.binary }),
    20_000,
    "读取导出文件",
  );
  const buffer: ArrayBuffer =
    binary instanceof ArrayBuffer
      ? binary
      : (binary as { buffer: ArrayBuffer }).buffer ?? new Uint8Array(binary as ArrayLike<number>).buffer;
  const dataUrl = `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
  return withTimeout(maybeDownscaleDataUrl(dataUrl, CAPTURE_MAX_EDGE), 20_000, "缩放选区图");
}

function resolvePage(doc: any, pageIndex: number): any {
  const pages = doc.pages;
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return pages.item(0);
  }
  return pages.item(pageIndex);
}

export function createIndesignHost(): DocumentHost {
  return {
    async styleExists(kind, name) {
      const doc = getDoc();
      if (kind === "table") {
        try {
          const s = doc.tableStyles.itemByName(name);
          return Boolean(s && s.isValid !== false && String(s.name) === name);
        } catch {
          return false;
        }
      }
      return true;
    },
    async objectExists(id) {
      const doc = getDoc();
      try {
        const item = doc.pageItems.itemByID(Number(id));
        return Boolean(item && item.isValid !== false);
      } catch {
        return false;
      }
    },
    async getObjectBounds(id) {
      const doc = getDoc();
      try {
        const item = doc.pageItems.itemByID(Number(id));
        return boundsFromGeometric(Array.from(item.geometricBounds as number[]));
      } catch {
        return null;
      }
    },
    async execute(command: LayoutCommand, ctx: ExecuteContext): Promise<ExecuteStepResult> {
      try {
        const doc = getDoc();
        switch (command.type) {
          case "createTextFrame": {
            const page = resolvePage(doc, command.pageIndex);
            const tf = page.textFrames.add();
            tf.geometricBounds = geometricFromBounds(command.bounds);
            try {
              tf.textFramePreferences.insetSpacing = [0, 0, 0, 0];
            } catch {
              /* optional */
            }
            if (command.text) tf.contents = command.text;
            return { ok: true, createdId: String(tf.id) };
          }
          case "createTable": {
            const frame = doc.pageItems.itemByID(Number(command.parentFrameId));
            if (!frame) return { ok: false, errorMessage: "parent frame not found" };
            // Clear and insert table at first insertion point
            try {
              frame.contents = "";
            } catch {
              /* ignore */
            }
            const ip = frame.insertionPoints.item(0);
            const table = ip.tables.add({
              headerRowCount: command.headerRowCount,
              bodyRowCount: command.bodyRowCount,
              footerRowCount: command.footerRowCount,
              columnCount: command.columnCount,
            });
            // Stretch table toward frame width when possible
            try {
              const gb = Array.from(frame.geometricBounds as number[]);
              const width = Number(gb[3]) - Number(gb[1]);
              const colW = width / Math.max(1, command.columnCount);
              for (let c = 0; c < command.columnCount; c++) {
                table.columns.item(c).width = colW;
              }
            } catch {
              /* optional */
            }
            ctx.created.tableId = String(table.id);
            return { ok: true, createdId: String(table.id) };
          }
          case "writeCellText": {
            const table = findTableById(doc, command.tableId);
            if (!table) return { ok: false, errorMessage: `table ${command.tableId} not found` };
            const cell = table.rows.item(command.row).cells.item(command.column);
            cell.contents = command.text;
            return { ok: true };
          }
          case "applyTableStyle": {
            const table = findTableById(doc, command.tableId);
            if (!table) return { ok: false, errorMessage: `table ${command.tableId} not found` };
            const style = doc.tableStyles.itemByName(command.name);
            table.appliedTableStyle = style;
            return { ok: true };
          }
          case "removeObjects": {
            for (const id of command.ids) {
              try {
                const item = doc.pageItems.itemByID(Number(id));
                item.remove();
              } catch (e) {
                return {
                  ok: false,
                  errorMessage: `remove ${id} failed: ${String(e)}`,
                };
              }
            }
            return { ok: true };
          }
          case "setFontSize":
          case "setLeading":
          case "setAlignment":
          case "setSpaceBeforeAfter":
          case "createParaStyle":
          case "applyParaStyle":
          case "createCharStyle":
          case "applyCharStyle":
          case "moveResizeFrame":
            return {
              ok: false,
              errorMessage: `${command.type} 尚未在可用版启用（当前优先 M0-T 表替换）`,
            };
          default:
            return { ok: false, errorMessage: "unknown command" };
        }
      } catch (e) {
        return { ok: false, errorMessage: String(e) };
      }
    },
  };
}

function findTableById(doc: any, tableId: string): any | null {
  // Tables are not always pageItems; search stories/textFrames
  try {
    const stories = doc.stories;
    for (let s = 0; s < stories.length; s++) {
      const story = stories.item(s);
      const tables = story.tables;
      for (let t = 0; t < tables.length; t++) {
        const table = tables.item(t);
        if (String(table.id) === String(tableId)) return table;
      }
    }
  } catch {
    /* continue */
  }
  return null;
}
