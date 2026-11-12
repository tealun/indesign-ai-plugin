/** Match a short utterance to a document table style name (brackets optional). */
export function matchTableStyleName(
  utterance: string,
  styles: string[],
): string | null {
  const raw = utterance.trim();
  if (!raw || styles.length === 0) return null;

  const strip = (s: string) =>
    s
      .trim()
      .replace(/^[「"'『【\[]+/, "")
      .replace(/[」"'』】\]]+$/, "");

  const candidates = [raw, strip(raw)].filter(Boolean);
  for (const c of candidates) {
    const exact = styles.find((s) => s === c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const byStrip = styles.find((s) => strip(s) === c || s === `[${c}]`);
    if (byStrip) return byStrip;
  }
  // "用货号信息表" / "货号信息表样式"
  for (const s of styles) {
    const bare = strip(s);
    if (bare && (raw === `${bare}样式` || raw === `用${bare}` || raw === `用${bare}样式`)) {
      return s;
    }
  }
  return null;
}
