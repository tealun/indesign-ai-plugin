/**
 * OCR / vision often emits soft line breaks. InDesign soft returns inflate
 * cell layout oddly; map them to hard paragraph returns (`\r`) so bilingual
 * / multi-line cells stay intentional line breaks under table styles.
 */
export function normalizeCellText(text: string): string {
  return (
    String(text ?? "")
      .replace(/\u0003/g, "\r") // soft-return marker → hard return
      .replace(/\u2028/g, "\r") // line separator
      .replace(/\u2029/g, "\r") // paragraph separator
      .replace(/\r\n/g, "\r")
      .replace(/\n/g, "\r")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ *\r */g, "\r")
      .replace(/\r{2,}/g, "\r")
      .replace(/^\r+|\r+$/g, "")
      .trim()
  );
}
