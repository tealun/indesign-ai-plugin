/**
 * Nested GREP Style helpers for paragraph styles (InDesign nestedGrepStyles).
 */

export type ApplyNestedGrepStyleInput = {
  paragraphStyleName: string;
  characterStyleName: string;
  grepExpression: string;
  /** If true, update existing entry with same expression; else add. Default true. */
  replaceExisting?: boolean;
};

export type ApplyNestedGrepStyleResult = {
  ok: boolean;
  message: string;
  updated?: boolean;
  added?: boolean;
};

export type NestedGrepStyleInfo = {
  index: number;
  grepExpression: string;
  characterStyleName: string;
};

function isUsableStyleName(name: string): boolean {
  if (!name) return false;
  if (/^\[/.test(name)) return false; // [Basic Paragraph] etc. still usable but noisy
  return true;
}

/** Pure: decide whether an existing nested GREP entry matches the expression. */
export function findMatchingGrepIndex(
  entries: Array<{ grepExpression: string }>,
  grepExpression: string,
): number {
  const target = grepExpression.trim();
  return entries.findIndex((e) => String(e.grepExpression || "") === target);
}

export function listParagraphStyleNamesFromDoc(doc: any): string[] {
  const names: string[] = [];
  try {
    const styles = doc.paragraphStyles;
    for (let i = 0; i < styles.length; i++) {
      try {
        const s = styles.item(i);
        const name = String(s.name || "");
        if (name && name !== "[No Paragraph Style]" && name !== "[无段落样式]") {
          names.push(name);
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* empty */
  }
  return names;
}

export function listCharacterStyleNamesFromDoc(doc: any): string[] {
  const names: string[] = [];
  try {
    const styles = doc.characterStyles;
    for (let i = 0; i < styles.length; i++) {
      try {
        const s = styles.item(i);
        const name = String(s.name || "");
        if (
          name &&
          name !== "[None]" &&
          name !== "[无]" &&
          name !== "[No Character Style]" &&
          name !== "[无字符样式]"
        ) {
          names.push(name);
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* empty */
  }
  return names;
}

export function listNestedGrepStylesFromDoc(
  doc: any,
  paragraphStyleName: string,
): NestedGrepStyleInfo[] {
  const out: NestedGrepStyleInfo[] = [];
  try {
    const para = doc.paragraphStyles.itemByName(paragraphStyleName);
    if (!para || para.isValid === false) return out;
    const nest = para.nestedGrepStyles;
    const n = Number(nest?.length ?? 0);
    for (let i = 0; i < n; i++) {
      try {
        const item = nest.item(i);
        const grepExpression = String(item.grepExpression || "");
        let characterStyleName = "";
        try {
          characterStyleName = String(item.appliedCharacterStyle?.name || "");
        } catch {
          characterStyleName = "";
        }
        out.push({ index: i, grepExpression, characterStyleName });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* missing style */
  }
  return out;
}

/**
 * Add or update a nested GREP style on a paragraph style.
 * Requires existing paragraph + character styles (does not create them).
 */
export function applyNestedGrepStyleOnDoc(
  doc: any,
  input: ApplyNestedGrepStyleInput,
): ApplyNestedGrepStyleResult {
  const paraName = String(input.paragraphStyleName || "").trim();
  const charName = String(input.characterStyleName || "").trim();
  const expr = String(input.grepExpression || "").trim();
  if (!paraName) return { ok: false, message: "缺少段落样式名。" };
  if (!charName) return { ok: false, message: "缺少字符样式名。" };
  if (!expr) return { ok: false, message: "缺少 GREP 表达式。" };

  let para: any;
  let charStyle: any;
  try {
    para = doc.paragraphStyles.itemByName(paraName);
    if (!para || para.isValid === false) {
      return { ok: false, message: `段落样式不存在：${paraName}` };
    }
  } catch {
    return { ok: false, message: `段落样式不存在：${paraName}` };
  }
  try {
    charStyle = doc.characterStyles.itemByName(charName);
    if (!charStyle || charStyle.isValid === false) {
      return { ok: false, message: `字符样式不存在：${charName}` };
    }
  } catch {
    return { ok: false, message: `字符样式不存在：${charName}` };
  }

  const replaceExisting = input.replaceExisting !== false;
  try {
    const nest = para.nestedGrepStyles;
    if (!nest) {
      return { ok: false, message: "该段落样式不支持 nestedGrepStyles。" };
    }
    const existing = listNestedGrepStylesFromDoc(doc, paraName);
    const matchIdx = findMatchingGrepIndex(existing, expr);
    if (replaceExisting && matchIdx >= 0) {
      const item = nest.item(matchIdx);
      item.grepExpression = expr;
      item.appliedCharacterStyle = charStyle;
      return {
        ok: true,
        updated: true,
        message: `已更新段落样式「${paraName}」中的 GREP 样式（表达式不变，字符样式→「${charName}」）。`,
      };
    }
    nest.add({
      grepExpression: expr,
      appliedCharacterStyle: charStyle,
    });
    return {
      ok: true,
      added: true,
      message: `已写入段落样式「${paraName}」：GREP「${expr}」→ 字符样式「${charName}」。`,
    };
  } catch (e) {
    return {
      ok: false,
      message: `写入 GREP 样式失败：${String(e)}`,
    };
  }
}

export { isUsableStyleName };
