import type { DocumentHost, ExecuteContext, ExecuteStepResult } from "../executor/types.js";
import type { Bounds, DocumentSnapshot, LayoutCommand, SelectionItem } from "../types/protocol.js";
import { boundsFromGeometric, geometricFromBounds } from "./geometry.js";
import { tryRequireIndesign, tryRequireUxp } from "./uxpRequire.js";
import { CAPTURE_MAX_EDGE, CAPTURE_TARGET_PPI } from "../capture/limits.js";
import { readPngSize } from "../capture/pngSize.js";
import { withTimeout } from "../util/timeout.js";
import { isImageLikeItem, resolveToCropFrame, uniqueResolvedTargets } from "./resolveCropFrame.js";
import { normalizeCellText } from "../protocol/cellText.js";

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

function toSelectionItem(raw: any): SelectionItem {
  const resolved = resolveToCropFrame(raw);
  const item = resolved.target;
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
  if (resolved.liftedFromImage && resolved.imageId) {
    return {
      id,
      type: "graphic",
      bounds,
      role: "frame",
      normalizedFromImageId: resolved.imageId,
      notes: `由内嵌图#${resolved.imageId}归一到图框，按裁切可见区域识别`,
    };
  }
  if (isImageLikeItem(item)) {
    return {
      id,
      type: "graphic",
      bounds,
      role: "imageContent",
      notes: "未能找到裁切图框，将按媒体对象本身导出",
    };
  }
  return { id, type: "graphic", bounds, role: "frame" };
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
  // Normalize image content → crop frames, then dedupe
  const { targets } = uniqueResolvedTargets(sel);
  const selection = targets.map(toSelectionItem);
  // Deduplicate selection items by id (toSelectionItem already resolves)
  const seen = new Set<string>();
  const uniqueSelection = selection.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const pageIndex = pageIndexOfItem(doc, targets[0] ?? sel[0]);
  return {
    documentName: String(doc.name || "document"),
    pageIndex,
    selection: uniqueSelection,
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
      if (name && name !== "[No Table Style]" && name !== "[无表样式]") {
        names.push(name);
      }
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

/**
 * InDesign UXP: skip canvas/Image downscale — DOM Image with data: URLs frequently
 * never fires onload. Ship the exported PNG as-is (resolution already capped via PPI).
 */
async function finalizeExportedPng(
  buffer: ArrayBuffer,
): Promise<{ dataUrl: string; width: number; height: number; scaled: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const size = readPngSize(buffer);
  const dataUrl = `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
  if (!size) {
    warnings.push("无法从 PNG 头读取尺寸，仍将原图送模型");
    return { dataUrl, width: 0, height: 0, scaled: false, warnings };
  }
  const edge = Math.max(size.width, size.height);
  if (edge > CAPTURE_MAX_EDGE) {
    warnings.push(
      `导出图 ${size.width}×${size.height} 超过 ${CAPTURE_MAX_EDGE}px；UXP 无法安全缩放，已原样发送。可在文档里缩小选区或降低导出分辨率。`,
    );
  }
  return {
    dataUrl,
    width: size.width,
    height: size.height,
    scaled: false,
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

  // Resolve ids → page items → crop frames (visible area only for clipped images).
  const rawItems: any[] = [];
  for (const id of selectionIds) {
    try {
      rawItems.push(doc.pageItems.itemByID(Number(id)));
    } catch {
      /* Image may not be in pageItems — try allGraphics / skip */
      try {
        const g = doc.allGraphics;
        for (let i = 0; i < g.length; i++) {
          const it = g.item(i);
          if (String(it.id) === String(id)) {
            rawItems.push(it);
            break;
          }
        }
      } catch {
        /* skip */
      }
    }
  }
  if (rawItems.length === 0) throw new Error("锁定的选区对象已不存在，请重新选中");

  const { targets, notes } = uniqueResolvedTargets(rawItems);
  if (targets.length === 0) throw new Error("无法解析可导出的图框/对象");

  doc.selection = targets;
  const format = ExportFormat?.PNG_FORMAT ?? "PNG format";

  await withTimeout(
    Promise.resolve().then(() => {
      // Single item: export that crop frame. Multiple ungrouped items: exportFile
      // only works on one pageItem — temporarily group duplicates so the PNG
      // covers the full union without mutating locked selection ids.
      exportPageItemsToPng(doc, targets, format, file);
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
  const result = await finalizeExportedPng(buffer);
  if (notes.length) {
    result.warnings = [...result.warnings, ...notes];
  }
  return result;
}

function resolvePage(doc: any, pageIndex: number): any {
  const pages = doc.pages;
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return pages.item(0);
  }
  return pages.item(pageIndex);
}

/**
 * Export one or many page items as a single PNG.
 * Multi-select without a group previously only exported targets[0] (wrong/empty).
 */
function exportPageItemsToPng(
  doc: any,
  targets: any[],
  format: unknown,
  file: unknown,
): void {
  if (targets.length === 1) {
    targets[0].exportFile(format, file);
    return;
  }

  // Duplicate → group → export → remove duplicates (keeps original locked ids).
  const errors: string[] = [];

  try {
    const dups: any[] = [];
    for (const t of targets) {
      dups.push(t.duplicate());
    }
    let group: any;
    try {
      group = doc.groups.add(dups);
    } catch (e) {
      for (const d of dups) {
        try {
          d.remove();
        } catch {
          /* ignore */
        }
      }
      throw e;
    }
    try {
      group.exportFile(format, file);
      return;
    } finally {
      try {
        group.remove();
      } catch {
        for (const d of dups) {
          try {
            d.remove();
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (e) {
    errors.push(`duplicate-group: ${String(e)}`);
  }

  // Last resort: group the live selection, export, ungroup (ids may change —
  // caller should re-lock if needed; better than only exporting first item).
  try {
    doc.selection = targets;
    const group = doc.groups.add(doc.selection);
    try {
      group.exportFile(format, file);
    } finally {
      try {
        group.ungroup();
      } catch {
        /* leave grouped rather than lose art */
      }
    }
    return;
  } catch (e) {
    errors.push(`live-group: ${String(e)}`);
  }

  throw new Error(
    `多对象选区导出失败（未编组伪表常见）。请先编组后再识别，或减少选中对象。详情：${errors.join(" | ")}`,
  );
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
            try {
              // Keep text from pushing the frame around
              tf.textFramePreferences.verticalJustification =
                (tryRequireIndesign() as any)?.VerticalJustification?.TOP_ALIGN ??
                tf.textFramePreferences.verticalJustification;
            } catch {
              /* optional */
            }
            if (command.text) tf.contents = command.text;
            ctx.created.frameId = String(tf.id);
            ctx.created.frameBounds = { ...command.bounds };
            return { ok: true, createdId: String(tf.id) };
          }
          case "createTable": {
            const frame = resolveTextFrame(doc, command.parentFrameId);
            if (!frame) {
              return {
                ok: false,
                errorMessage: `父文本框 ${command.parentFrameId} 不存在或不是 TextFrame`,
              };
            }
            // Re-pin footprint before insert (position stability)
            pinFrameBounds(frame, ctx.created.frameBounds);
            try {
              frame.contents = "";
            } catch {
              /* ignore */
            }
            const table = addTableAtFrame(frame, command);
            try {
              if (!frame.tables || Number(frame.tables.length) < 1) {
                return {
                  ok: false,
                  errorMessage: "建表后文本框内仍无表格（请检查 UXP tables.add）",
                };
              }
            } catch {
              /* length check optional */
            }
            // Table fits inside selection footprint (in-place), not the reverse.
            fitTableToFrame(
              frame,
              table,
              command.columnCount,
              ctx.created.frameBounds,
            );
            ctx.created.tableId = String(table.id);
            return { ok: true, createdId: String(table.id) };
          }
          case "writeCellText": {
            const table = findTableById(doc, command.tableId);
            if (!table) {
              return { ok: false, errorMessage: `table ${command.tableId} not found` };
            }
            const cell = resolveTableCell(table, command.row, command.column);
            if (!cell) {
              return {
                ok: false,
                errorMessage: `单元格 (${command.row},${command.column}) 不存在`,
              };
            }
            writeCellContents(cell, command.text);
            return { ok: true };
          }
          case "applyTableStyle": {
            const table = findTableById(doc, command.tableId);
            if (!table) {
              return { ok: false, errorMessage: `table ${command.tableId} not found` };
            }
            try {
              const style = doc.tableStyles.itemByName(command.name);
              if (!style || style.isValid === false) {
                return { ok: false, errorMessage: `表样式不存在：${command.name}` };
              }
              table.appliedTableStyle = style;
              try {
                // Drop local overrides so doc table style fully owns look
                if (typeof table.clearTableStyleOverrides === "function") {
                  table.clearTableStyleOverrides(true);
                }
              } catch {
                /* optional on some versions */
              }
              // After style (esp. second pass): pin frame to selection, fit table in.
              if (ctx.created.frameId) {
                const frame = resolveTextFrame(doc, ctx.created.frameId);
                if (frame) {
                  const next = fitTableToFrame(
                    frame,
                    table,
                    Number(table.columns?.length ?? 0) || 1,
                    ctx.created.frameBounds,
                  );
                  if (next) ctx.created.frameBounds = next;
                }
              }
            } catch (e) {
              return {
                ok: false,
                errorMessage: `应用表样式失败：${String(e)}`,
              };
            }
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

/** Prefer textFrames.itemByID — pageItems often lack insertionPoints in UXP. */
function resolveTextFrame(doc: any, id: string | number): any | null {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  try {
    const tf = doc.textFrames.itemByID(n);
    if (tf && tf.isValid !== false) return tf;
  } catch {
    /* try pageItems */
  }
  try {
    const item = doc.pageItems.itemByID(n);
    if (item && item.isValid !== false && item.insertionPoints) return item;
  } catch {
    /* missing */
  }
  return null;
}

function firstInsertionPoint(frame: any): any {
  const ips = frame.insertionPoints;
  if (!ips) throw new Error("文本框没有 insertionPoints，无法插入表格");
  try {
    if (typeof ips.item === "function") return ips.item(0);
  } catch {
    /* try index */
  }
  try {
    if (ips[0]) return ips[0];
  } catch {
    /* missing */
  }
  throw new Error("无法取得 insertionPoints[0]");
}

function tableProps(command: {
  columnCount: number;
  bodyRowCount: number;
  headerRowCount: number;
  footerRowCount: number;
}): Record<string, number> {
  return {
    columnCount: command.columnCount,
    bodyRowCount: command.bodyRowCount,
    headerRowCount: command.headerRowCount,
    footerRowCount: command.footerRowCount,
  };
}

/**
 * UXP Tables.add(LocationOptions?, reference?, withProperties?)
 * Classic ExtendScript often used insertionPoints[0].tables.add({columnCount, bodyRowCount...}).
 * Never pass raw numbers as the first args — that is not the UXP signature.
 */
function addTableAtFrame(
  frame: any,
  command: {
    columnCount: number;
    bodyRowCount: number;
    headerRowCount: number;
    footerRowCount: number;
  },
): any {
  const ip = firstInsertionPoint(frame);
  const props = tableProps(command);
  const errors: string[] = [];

  const attempts: Array<() => any> = [
    () => ip.tables.add(props),
    () => {
      const idn = tryRequireIndesign() as any;
      const loc =
        idn?.LocationOptions?.UNKNOWN ??
        idn?.LocationOptions?.AT_BEGINNING ??
        idn?.LocationOptions?.AFTER;
      if (frame.tables && loc != null) {
        return frame.tables.add(loc, ip, props);
      }
      throw new Error("LocationOptions/frame.tables 不可用");
    },
    () => ip.tables.add(undefined, undefined, props),
  ];

  for (const attempt of attempts) {
    try {
      attempt();
      const tables = frame.tables;
      const len = Number(tables?.length ?? 0);
      if (len < 1) {
        errors.push("add 返回后 frame.tables 仍为空");
        continue;
      }
      const table =
        typeof tables.lastItem === "function"
          ? tables.lastItem()
          : tables.item(len - 1);
      if (!table) {
        errors.push("无法取得新建 table 引用");
        continue;
      }
      // Ensure header/footer counts stick on hosts that ignore some props
      try {
        if (command.headerRowCount) table.headerRowCount = command.headerRowCount;
        if (command.footerRowCount) table.footerRowCount = command.footerRowCount;
      } catch {
        /* optional */
      }
      return table;
    } catch (e) {
      errors.push(String(e));
    }
  }

  throw new Error(`tables.add 未能在文本框内建表：${errors.join(" | ")}`);
}

function pinFrameBounds(frame: any, bounds: import("../types/protocol.js").Bounds | undefined): void {
  if (!bounds) return;
  try {
    frame.geometricBounds = geometricFromBounds(bounds);
  } catch {
    /* ignore */
  }
}

/**
 * In-place: pin frame to selection footprint (fixed width), force table width
 * to match, equalize columns. Grow height downward only if table still taller.
 * Avoids huge frames and "empty until double-click handle" clipping.
 */
function fitTableToFrame(
  frame: any,
  table: any,
  columnCount: number,
  anchor: import("../types/protocol.js").Bounds | undefined,
): import("../types/protocol.js").Bounds | undefined {
  if (!anchor) return undefined;
  const footprint: import("../types/protocol.js").Bounds = {
    x: anchor.x,
    y: anchor.y,
    w: Math.max(anchor.w, 12),
    h: Math.max(anchor.h, 12),
    unit: "pt",
  };
  pinFrameBounds(frame, footprint);

  const cols = Math.max(1, columnCount);
  try {
    if (typeof table.width === "number" || "width" in table) {
      table.width = footprint.w;
    }
  } catch {
    /* some hosts lock width until columns set */
  }

  equalizeColumnWidths(frame, table, cols, footprint.w);

  try {
    if (typeof table.width === "number" || "width" in table) {
      table.width = footprint.w;
    }
  } catch {
    /* ignore */
  }

  // Recompose so overset/clip clears before measuring height
  try {
    const story = frame.parentStory;
    if (story && typeof story.recompose === "function") story.recompose();
  } catch {
    try {
      if (typeof frame.recompose === "function") frame.recompose();
    } catch {
      /* optional */
    }
  }

  let tableH = 0;
  try {
    tableH = Number(table.height) || 0;
  } catch {
    tableH = 0;
  }
  if (tableH > footprint.h + 0.5) {
    footprint.h = tableH;
    pinFrameBounds(frame, footprint);
  }

  // Final pin width again — style/recompose must not stretch horizontally
  pinFrameBounds(frame, footprint);
  equalizeColumnWidths(frame, table, cols, footprint.w);
  return footprint;
}

/** Split width evenly across columns (explicit width preferred). */
function equalizeColumnWidths(
  frame: any,
  table: any,
  columnCount: number,
  explicitWidth?: number,
): void {
  const cols = Math.max(1, columnCount);
  try {
    let width = explicitWidth ?? 0;
    if (!(width > 0)) {
      const gb = Array.from(frame.geometricBounds as number[]);
      width = Number(gb[3]) - Number(gb[1]);
    }
    if (!(width > 0)) return;
    const colW = width / cols;
    for (let c = 0; c < cols; c++) {
      table.columns.item(c).width = colW;
    }
  } catch {
    /* style may lock column widths */
  }
}

function writeCellContents(cell: any, text: string): void {
  const value = normalizeCellText(text ?? "");
  try {
    cell.contents = value;
    return;
  } catch {
    /* try texts */
  }
  try {
    const texts = cell.texts;
    if (texts?.item) {
      texts.item(0).contents = value;
      return;
    }
  } catch {
    /* try paragraphs */
  }
  try {
    cell.paragraphs.item(0).contents = value;
  } catch (e) {
    throw new Error(`写入单元格失败：${String(e)}`);
  }
}

function resolveTableCell(table: any, row: number, column: number): any | null {
  try {
    const rows = table.rows;
    if (rows && typeof rows.item === "function") {
      const r = rows.item(row);
      if (r?.cells && typeof r.cells.item === "function") {
        return r.cells.item(column);
      }
    }
  } catch {
    /* fall through */
  }
  try {
    // Flat cells collection is 0-based left-to-right, top-to-bottom
    const cols = Number(table.columns?.length ?? 0) || 1;
    const index = row * cols + column;
    if (table.cells && typeof table.cells.item === "function") {
      return table.cells.item(index);
    }
  } catch {
    /* missing */
  }
  return null;
}

function findTableById(doc: any, tableId: string): any | null {
  // Tables live in stories, not always as pageItems
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
  // Also scan textFrames directly (some UXP builds)
  try {
    const frames = doc.textFrames;
    for (let i = 0; i < frames.length; i++) {
      const tf = frames.item(i);
      const tables = tf.tables;
      if (!tables) continue;
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
