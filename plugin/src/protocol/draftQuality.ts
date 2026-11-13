import type { TableDraft } from "../types/protocol.js";

const CJK_RE = /[\u3400-\u9FFF]/;
const LATIN_WORD_RE = /[A-Za-z]{2,}/;

export type HeaderLanguageHint = {
  /** Latin headers with no CJK — common when bilingual catalog headers lost Chinese. */
  likelyDroppedCjk: boolean;
  headerText: string;
  message: string | null;
};

/** Inspect header rows only; never blocks replace — advisory for UI/Agent. */
export function assessHeaderLanguage(draft: TableDraft): HeaderLanguageHint {
  const n = Math.max(0, Math.min(draft.headerRowCount, draft.rows.length));
  const headerText = draft.rows
    .slice(0, n)
    .map((r) => r.join(" "))
    .join("\n");
  const hasCjk = CJK_RE.test(headerText);
  const hasLatin = LATIN_WORD_RE.test(headerText);
  const likelyDroppedCjk = hasLatin && !hasCjk;
  return {
    likelyDroppedCjk,
    headerText,
    message: likelyDroppedCjk
      ? "表头未见中文。若原图是中英叠字，可用「补图」或说「重新识别」。"
      : null,
  };
}
