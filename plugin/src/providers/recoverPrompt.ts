/**
 * Shared vision prompt for `recover_table`.
 * Catalog tables often stack Chinese + English in one header cell; models
 * frequently drop the CJK line unless rules + examples force verbatim copy.
 */
export function recoverTableSystemPrompt(): string {
  return [
    "You extract InDesign table structure from images.",
    "Output JSON only. Never output scripts.",
    "Copy every visible glyph faithfully — including Chinese (CJK), English, digits, and symbols.",
    "Never translate. Never drop Chinese just because English is also present.",
  ].join(" ");
}

export function recoverTableUserPrompt(userNote?: string): string {
  return [
    "Recognize the table in the image.",
    "Return ONLY JSON:",
    '{"tableDraft":{"headerRowCount":1,"footerRowCount":0,"suggestedTableStyleName":"","rows":[["货号\\nCode NO.","测量范围\\nMeasuring Range mm"],["141-262","0-150"]]}}',
    "rules:",
    "- rows = full matrix including header/footer lines",
    "- headerRowCount>=1, footerRowCount>=0",
    "- MUST leave at least one body row: header+footer < rows.length",
    "- tiny 2-row tables: headerRowCount=1, footerRowCount=0 (never header=2)",
    "- ignore merged cells",
    "- VERBATIM OCR: keep ALL languages shown in each cell (Chinese + English if both appear)",
    "- bilingual stacked headers: put Chinese and English in the SAME cell, separated by \\n (do not keep only English)",
    "- do not translate, paraphrase, title-case, or “clean up” wording",
    "- preserve symbols exactly (±, –, mm, °, …)",
    userNote ? `userNote: ${userNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Prefer near-zero temperature for OCR fidelity. */
export function recoverTableTemperature(configured: number): number {
  if (!Number.isFinite(configured)) return 0;
  return Math.min(Math.max(0, configured), 0.1);
}
