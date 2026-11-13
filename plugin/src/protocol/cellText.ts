/**
 * OCR / vision often inserts soft line breaks inside cells. InDesign treats
 * those as forced breaks and cells balloon. Collapse to single-line cell text.
 */
export function normalizeCellText(text: string): string {
  return String(text ?? "")
    .replace(/\u0003/g, " ") // common InDesign soft-return marker in some dumps
    .replace(/\u2028/g, " ") // line separator
    .replace(/\u2029/g, " ") // paragraph separator
    .replace(/\r\n/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}
