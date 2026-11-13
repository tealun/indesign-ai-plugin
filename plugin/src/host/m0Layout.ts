/**
 * M0 layout whitelist helpers — typography / styles / frame geometry.
 * Pure mappers are unit-tested; host I/O stays in execute paths.
 */
import type { Bounds, LayoutCommand } from "../types/protocol.js";
import type { ExecuteStepResult } from "../executor/types.js";
import { geometricFromBounds } from "./geometry.js";
import { tryRequireIndesign } from "./uxpRequire.js";

export type JustificationEnums = {
  LEFT_ALIGN?: unknown;
  CENTER_ALIGN?: unknown;
  RIGHT_ALIGN?: unknown;
  FULLY_JUSTIFIED?: unknown;
  LEFT_JUSTIFIED?: unknown;
  RIGHT_JUSTIFIED?: unknown;
  CENTER_JUSTIFIED?: unknown;
};

/** Map protocol alignment tokens → InDesign Justification enum value. */
export function mapAlignment(
  alignment: string,
  enums: JustificationEnums | null | undefined,
): unknown | null {
  const key = alignment.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const J = enums || {};
  const table: Record<string, unknown | undefined> = {
    left: J.LEFT_ALIGN,
    left_align: J.LEFT_ALIGN,
    center: J.CENTER_ALIGN,
    centre: J.CENTER_ALIGN,
    center_align: J.CENTER_ALIGN,
    right: J.RIGHT_ALIGN,
    right_align: J.RIGHT_ALIGN,
    justify: J.FULLY_JUSTIFIED,
    justified: J.FULLY_JUSTIFIED,
    fully_justified: J.FULLY_JUSTIFIED,
    left_justify: J.LEFT_JUSTIFIED,
    left_justified: J.LEFT_JUSTIFIED,
    right_justify: J.RIGHT_JUSTIFIED,
    right_justified: J.RIGHT_JUSTIFIED,
    center_justify: J.CENTER_JUSTIFIED,
    centre_justify: J.CENTER_JUSTIFIED,
    center_justified: J.CENTER_JUSTIFIED,
  };
  const hit = table[key];
  return hit === undefined ? null : hit;
}

/** Safe subset of createParaStyle / createCharStyle props. */
export function applyStyleProps(
  style: Record<string, unknown>,
  props: Record<string, unknown>,
  enums: JustificationEnums | null | undefined,
): string[] {
  const applied: string[] = [];
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const size = num(props.pointSize ?? props.fontSize ?? props.size);
  if (size != null && size > 0) {
    try {
      style.pointSize = size;
      applied.push("pointSize");
    } catch {
      /* host may reject */
    }
  }

  const leading = props.leading;
  if (leading === "auto" || leading === "AUTO") {
    try {
      const id = tryRequireIndesign() as { Leading?: { AUTO?: unknown } } | null;
      if (id?.Leading?.AUTO != null) {
        style.leading = id.Leading.AUTO;
        applied.push("leading");
      }
    } catch {
      /* optional */
    }
  } else {
    const lead = num(leading);
    if (lead != null && lead > 0) {
      try {
        style.leading = lead;
        applied.push("leading");
      } catch {
        /* optional */
      }
    }
  }

  const before = num(props.spaceBefore ?? props.before);
  if (before != null) {
    try {
      style.spaceBefore = before;
      applied.push("spaceBefore");
    } catch {
      /* optional */
    }
  }
  const after = num(props.spaceAfter ?? props.after);
  if (after != null) {
    try {
      style.spaceAfter = after;
      applied.push("spaceAfter");
    } catch {
      /* optional */
    }
  }

  const alignRaw = props.alignment ?? props.justification;
  if (typeof alignRaw === "string") {
    const j = mapAlignment(alignRaw, enums);
    if (j != null) {
      try {
        style.justification = j;
        applied.push("justification");
      } catch {
        /* optional */
      }
    }
  }

  return applied;
}

export function justificationEnums(): JustificationEnums | null {
  try {
    const mod = tryRequireIndesign() as { Justification?: JustificationEnums } | null;
    return mod?.Justification ?? null;
  } catch {
    return null;
  }
}

function fail(msg: string): ExecuteStepResult {
  return { ok: false, errorMessage: msg };
}

function resolveTextTarget(doc: any, targetId: string): any | null {
  const n = Number(targetId);
  if (!Number.isFinite(n)) return null;
  try {
    const tf = doc.textFrames.itemByID(n);
    if (tf && tf.isValid !== false) return tf;
  } catch {
    /* fall through */
  }
  try {
    const item = doc.pageItems.itemByID(n);
    if (item && item.isValid !== false && item.texts) return item;
  } catch {
    /* missing */
  }
  return null;
}

function everyParagraph(target: any): any | null {
  try {
    if (target.paragraphs?.everyItem) return target.paragraphs.everyItem();
  } catch {
    /* fall through */
  }
  try {
    if (target.texts?.item?.(0)?.paragraphs?.everyItem) {
      return target.texts.item(0).paragraphs.everyItem();
    }
  } catch {
    /* missing */
  }
  return null;
}

function everyText(target: any): any | null {
  try {
    if (target.texts?.everyItem) return target.texts.everyItem();
  } catch {
    /* fall through */
  }
  try {
    if (target.parentStory?.texts?.everyItem) {
      return target.parentStory.texts.everyItem();
    }
  } catch {
    /* missing */
  }
  return null;
}

function findStyle(
  collection: any,
  name: string,
): { ok: true; style: any } | { ok: false; reason: string } {
  try {
    const s = collection.itemByName(name);
    if (s && s.isValid !== false && String(s.name) === name) {
      return { ok: true, style: s };
    }
  } catch {
    /* missing */
  }
  return { ok: false, reason: `样式不存在：${name}` };
}

export function executeM0LayoutCommand(
  doc: any,
  command: LayoutCommand,
  options?: { enums?: JustificationEnums | null },
): ExecuteStepResult {
  const enums =
    options && "enums" in options ? options.enums : justificationEnums();

  switch (command.type) {
    case "setFontSize": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const size = Number(command.size);
      if (!(size > 0)) return fail("字号必须为正数");
      const paras = everyParagraph(target);
      if (!paras) return fail("无法访问段落以设置字号");
      try {
        paras.pointSize = size;
      } catch (e) {
        return fail(`设置字号失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "setLeading": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const leading = Number(command.leading);
      if (!(leading > 0)) return fail("行距必须为正数");
      const paras = everyParagraph(target);
      if (!paras) return fail("无法访问段落以设置行距");
      try {
        paras.leading = leading;
      } catch (e) {
        return fail(`设置行距失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "setAlignment": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const j = mapAlignment(command.alignment, enums);
      if (j == null) {
        return fail(
          `无法识别对齐方式「${command.alignment}」（可用 left/center/right/justify）`,
        );
      }
      const paras = everyParagraph(target);
      if (!paras) return fail("无法访问段落以设置对齐");
      try {
        paras.justification = j;
      } catch (e) {
        return fail(`设置对齐失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "setSpaceBeforeAfter": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const paras = everyParagraph(target);
      if (!paras) return fail("无法访问段落以设置段前后距");
      try {
        if (command.before != null) paras.spaceBefore = Number(command.before);
        if (command.after != null) paras.spaceAfter = Number(command.after);
      } catch (e) {
        return fail(`设置段前后距失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "createParaStyle": {
      const name = String(command.name || "").trim();
      if (!name) return fail("段落样式名不能为空");
      const existing = findStyle(doc.paragraphStyles, name);
      if (existing.ok) return fail(`段落样式已存在：${name}`);
      let style: any;
      try {
        style = doc.paragraphStyles.add({ name });
      } catch (e) {
        return fail(`创建段落样式失败：${String(e)}`);
      }
      applyStyleProps(style, command.props || {}, enums);
      return { ok: true };
    }
    case "applyParaStyle": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const found = findStyle(doc.paragraphStyles, command.name);
      if (!found.ok) return fail(found.reason);
      const paras = everyParagraph(target);
      if (!paras) return fail("无法访问段落以套用样式");
      try {
        paras.appliedParagraphStyle = found.style;
      } catch (e) {
        return fail(`套用段落样式失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "createCharStyle": {
      const name = String(command.name || "").trim();
      if (!name) return fail("字符样式名不能为空");
      const existing = findStyle(doc.characterStyles, name);
      if (existing.ok) return fail(`字符样式已存在：${name}`);
      let style: any;
      try {
        style = doc.characterStyles.add({ name });
      } catch (e) {
        return fail(`创建字符样式失败：${String(e)}`);
      }
      applyStyleProps(style, command.props || {}, enums);
      return { ok: true };
    }
    case "applyCharStyle": {
      const target = resolveTextTarget(doc, command.targetId);
      if (!target) return fail(`目标 ${command.targetId} 不是可用文本框`);
      const found = findStyle(doc.characterStyles, command.name);
      if (!found.ok) return fail(found.reason);
      const texts = everyText(target);
      if (!texts) return fail("无法访问文本以套用字符样式");
      try {
        texts.appliedCharacterStyle = found.style;
      } catch (e) {
        return fail(`套用字符样式失败：${String(e)}`);
      }
      return { ok: true };
    }
    case "moveResizeFrame": {
      const n = Number(command.targetId);
      if (!Number.isFinite(n)) return fail("targetId 无效");
      let item: any;
      try {
        item = doc.pageItems.itemByID(n);
        if (!item || item.isValid === false) {
          return fail(`对象 ${command.targetId} 不存在`);
        }
      } catch {
        return fail(`对象 ${command.targetId} 不存在`);
      }
      const b = command.bounds as Bounds;
      if (!(b.w > 0 && b.h > 0)) return fail("bounds 宽高必须为正");
      try {
        item.geometricBounds = geometricFromBounds(b);
      } catch (e) {
        return fail(`移动/缩放失败：${String(e)}`);
      }
      return { ok: true };
    }
    default:
      return fail(`非 M0 排版命令：${(command as { type: string }).type}`);
  }
}

/** Harvest typography fields from a text frame for DocumentSnapshot. */
export function harvestTextFrameStyles(item: any): {
  appliedParaStyle?: string | null;
  appliedCharStyle?: string | null;
  fontFamily?: string;
  fontSize?: number;
  leading?: number;
  alignment?: string;
  spaceBefore?: number;
  spaceAfter?: number;
} {
  const out: ReturnType<typeof harvestTextFrameStyles> = {};
  try {
    const p =
      item.paragraphs?.item?.(0) ??
      item.texts?.item?.(0)?.paragraphs?.item?.(0);
    if (!p) return out;
    try {
      const ps = p.appliedParagraphStyle;
      out.appliedParaStyle = ps ? String(ps.name) : null;
    } catch {
      out.appliedParaStyle = null;
    }
    try {
      const cs = p.appliedCharacterStyle;
      const n = cs ? String(cs.name) : "";
      out.appliedCharStyle =
        !n || /无字符样式|No Character Style/i.test(n) ? null : n;
    } catch {
      out.appliedCharStyle = null;
    }
    try {
      const font = p.appliedFont;
      if (font) out.fontFamily = String(font.fontFamily || font.name || font);
    } catch {
      /* optional */
    }
    try {
      const sz = Number(p.pointSize);
      if (Number.isFinite(sz)) out.fontSize = sz;
    } catch {
      /* optional */
    }
    try {
      const lead = Number(p.leading);
      if (Number.isFinite(lead)) out.leading = lead;
    } catch {
      /* optional */
    }
    try {
      out.alignment = String(p.justification ?? "");
    } catch {
      /* optional */
    }
    try {
      const sb = Number(p.spaceBefore);
      if (Number.isFinite(sb)) out.spaceBefore = sb;
    } catch {
      /* optional */
    }
    try {
      const sa = Number(p.spaceAfter);
      if (Number.isFinite(sa)) out.spaceAfter = sa;
    } catch {
      /* optional */
    }
  } catch {
    /* empty frame */
  }
  return out;
}
