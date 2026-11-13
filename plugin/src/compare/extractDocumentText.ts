/**
 * Extract plain text from uploaded compare-source documents.
 * Supported: txt/csv/tsv/md/html, docx, xlsx (OOXML via fflate), pdf (text layer),
 * doc (best-effort). Legacy .xls rejected — save as xlsx (no SheetJS; 99_07 F3).
 */

import { inflateSync, unzipSync, strFromU8 } from "fflate";

export type DocumentExtractResult = {
  text: string;
  format: string;
  fileName: string;
  warnings: string[];
};

export const MAX_CHARS = 80_000;
/** Hard cap before parse (99_07 F2). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
const MAX_UNCOMPRESSED_TOTAL = 24 * 1024 * 1024;

function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name.trim());
  return (m?.[1] || "").toLowerCase();
}

function decodeTextBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
      return s;
    }
  }
}

function collapseWs(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Share of characters that look like readable text (99_07 F10/F16). */
export function printableRatio(s: string): number {
  if (!s.length) return 0;
  let ok = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (
      c === 9 ||
      c === 10 ||
      c === 13 ||
      (c >= 32 && c < 0xd800) ||
      (c >= 0xe000 && c !== 0xfffd)
    ) {
      ok++;
    }
  }
  return ok / s.length;
}

function stripXml(xml: string): string {
  return xml
    .replace(/<w:tab\b[^/]*\/>/gi, "\t")
    .replace(/<w:br\b[^/]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<\/w:tr>/gi, "\n")
    .replace(/<\/w:tc>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    );
}

function unzipBounded(bytes: Uint8Array): Record<string, Uint8Array> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("无法解压 ZIP（文件可能已损坏或过大）");
  }
  const keys = Object.keys(files);
  if (keys.length > MAX_ZIP_ENTRIES) {
    throw new Error(`压缩包条目过多（>${MAX_ZIP_ENTRIES}），已拒绝`);
  }
  let total = 0;
  for (const k of keys) {
    total += files[k]?.byteLength ?? 0;
    if (total > MAX_UNCOMPRESSED_TOTAL) {
      throw new Error("解压后体积过大，已拒绝（请缩小文件）");
    }
  }
  return files;
}

function extractDocx(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const files = unzipBounded(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("无效的 .docx：缺少 word/document.xml");
  const parts: string[] = [stripXml(strFromU8(doc))];
  for (const key of Object.keys(files)) {
    if (/^word\/(footnotes|endnotes)\.xml$/i.test(key)) {
      const extra = collapseWs(stripXml(strFromU8(files[key]!)));
      if (extra) parts.push(extra);
    }
  }
  const text = collapseWs(parts.join("\n\n"));
  if (!text) warnings.push("docx 未解析出可见文字（可能是纯图文档）");
  return { text, warnings };
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  // <si>…</si> blocks; prefer concatenated <t>
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const inner = m[1] || "";
    const texts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner))) {
      texts.push(
        tm[1]!
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&"),
      );
    }
    out.push(texts.join(""));
  }
  return out;
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, n - 1);
}

function sheetXmlToTsv(xml: string, shared: string[]): string {
  // Map "r" -> value; then render dense grid
  const cells = new Map<string, string>();
  let maxRow = 0;
  let maxCol = 0;
  const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
  let m: RegExpExecArray | null;
  while ((m = cRe.exec(xml))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const ref = /\br="([A-Z]+)(\d+)"/i.exec(attrs);
    if (!ref) continue;
    const col = colLettersToIndex(ref[1]!);
    const row = Number(ref[2]) - 1;
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    const t = /\bt="([^"]+)"/i.exec(attrs)?.[1] || "";
    let val = "";
    if (t === "s") {
      const v = /<v>([\s\S]*?)<\/v>/i.exec(body)?.[1];
      const idx = Number(v);
      val = Number.isFinite(idx) ? shared[idx] ?? "" : "";
    } else if (t === "inlineStr") {
      const texts: string[] = [];
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(body))) texts.push(tm[1] || "");
      val = texts.join("");
    } else {
      val = /<v>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? "";
    }
    cells.set(`${row},${col}`, val);
  }
  if (cells.size === 0) return "";
  // Cap grid
  maxRow = Math.min(maxRow, 500);
  maxCol = Math.min(maxCol, 40);
  const lines: string[] = [];
  for (let r = 0; r <= maxRow; r++) {
    const parts: string[] = [];
    let rowEmpty = true;
    for (let c = 0; c <= maxCol; c++) {
      const v = cells.get(`${r},${c}`) ?? "";
      if (v) rowEmpty = false;
      parts.push(v);
    }
    if (!rowEmpty) lines.push(parts.join("\t"));
  }
  return lines.join("\n");
}

function extractXlsx(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const files = unzipBounded(bytes);
  const ssXml = files["xl/sharedStrings.xml"];
  const shared = ssXml ? parseSharedStrings(strFromU8(ssXml)) : [];
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new Error("无效的 .xlsx：缺少 xl/workbook.xml");
  const wbXml = strFromU8(wb);
  const sheetNames: string[] = [];
  const sheetRe = /<sheet\b[^>]*name="([^"]+)"[^>]*>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(wbXml))) sheetNames.push(sm[1]!);

  const sheetFiles = Object.keys(files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = Number(/sheet(\d+)/i.exec(a)?.[1] || 0);
      const nb = Number(/sheet(\d+)/i.exec(b)?.[1] || 0);
      return na - nb;
    });

  if (!sheetFiles.length) {
    return { text: "", warnings: ["工作簿没有工作表"] };
  }

  const blocks: string[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const path = sheetFiles[i]!;
    const name = sheetNames[i] || `Sheet${i + 1}`;
    const body = collapseWs(sheetXmlToTsv(strFromU8(files[path]!), shared));
    if (!body) continue;
    blocks.push(
      sheetFiles.length > 1 ? `【工作表：${name}】\n${body}` : body,
    );
  }
  const text = blocks.join("\n\n");
  if (!text) warnings.push("表格文件未解析出单元格文本");
  return { text, warnings };
}

/** Best-effort: pull literal strings from PDF content (text PDFs only). */
function extractPdf(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const raw = decodeTextBytes(bytes);
  const chunks: string[] = [];

  const litRe = /\((?:\\.|[^\\)])*\)\s*(?:Tj|TJ|')/g;
  let m: RegExpExecArray | null;
  while ((m = litRe.exec(raw))) {
    const inner = m[0].replace(/\)\s*(?:Tj|TJ|')$/i, "").slice(1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, "\t")
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\(\d{3})/g, (_, oct) =>
        String.fromCharCode(parseInt(oct, 8)),
      );
    if (decoded.trim()) chunks.push(decoded);
  }

  const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((m = hexRe.exec(raw))) {
    const hex = m[1]!.replace(/\s+/g, "");
    if (hex.length < 4 || hex.length % 2) continue;
    const chars: string[] = [];
    if (hex.length % 4 === 0) {
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.slice(i, i + 4), 16);
        if (code) chars.push(String.fromCharCode(code));
      }
    } else {
      for (let i = 0; i < hex.length; i += 2) {
        chars.push(String.fromCharCode(parseInt(hex.slice(i, i + 2), 16)));
      }
    }
    const s = chars.join("");
    if (s.trim()) chunks.push(s);
  }

  let text = collapseWs(chunks.join(" "));
  if (text.length < 40) {
    try {
      const inflated = inflatePdfStreams(bytes);
      if (inflated.length > text.length) text = inflated;
    } catch {
      /* ignore */
    }
  }

  if (!text) {
    warnings.push(
      "PDF 未解析出文字层（扫描件或加密 PDF 需先 OCR / 另存为可搜索 PDF）",
    );
  } else if (text.length < 80) {
    warnings.push("PDF 抽取文字较少，复杂版式可能不完整");
  }
  return { text, warnings };
}

function inflatePdfStreams(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const marker = new TextEncoder().encode("stream");
  const endMarker = new TextEncoder().encode("endstream");
  let i = 0;
  let streams = 0;
  while (i < bytes.length && streams < 80) {
    const start = indexOfBytes(bytes, marker, i);
    if (start < 0) break;
    let dataStart = start + marker.length;
    if (bytes[dataStart] === 0x0d) dataStart++;
    if (bytes[dataStart] === 0x0a) dataStart++;
    const end = indexOfBytes(bytes, endMarker, dataStart);
    if (end < 0) break;
    const slice = bytes.subarray(dataStart, end);
    if (slice.byteLength <= 2_000_000) {
      try {
        const out = inflateSync(slice);
        const s = decodeTextBytes(out);
        const parts = s.match(/\((?:\\.|[^\\)])*\)/g) || [];
        for (const p of parts) {
          const inner = p
            .slice(1, -1)
            .replace(/\\n/g, "\n")
            .replace(/\\([()\\])/g, "$1");
          if (inner.trim()) chunks.push(inner);
        }
      } catch {
        /* not flate */
      }
    }
    streams++;
    i = end + endMarker.length;
  }
  return collapseWs(chunks.join(" "));
}

function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function codesToString(codes: number[]): string {
  const parts: string[] = [];
  const chunk = 4096;
  for (let i = 0; i < codes.length; i += chunk) {
    parts.push(String.fromCharCode(...codes.slice(i, i + chunk)));
  }
  return parts.join("");
}

/** Legacy .doc (OLE): harvest UTF-16LE runs — incomplete but better than nothing. */
function extractDocBestEffort(bytes: Uint8Array): {
  text: string;
  warnings: string[];
} {
  const warnings = [
    "旧版 .doc 为尽力抽取；建议另存为 .docx 后再上传以获得更准结果",
  ];
  const parts: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 4) parts.push(codesToString(run));
    run = [];
  };
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    const ok =
      code === 0x0a ||
      code === 0x0d ||
      code === 0x09 ||
      (code >= 0x20 && code <= 0xff) ||
      (code >= 0x4e00 && code <= 0x9fff);
    if (ok) run.push(code);
    else flush();
  }
  flush();
  let text = collapseWs(parts.join("\n"));
  if (text && printableRatio(text) < 0.72) {
    warnings.push("抽字疑似乱码，已丢弃；请另存为 .docx / .txt");
    text = "";
  }
  if (!text) {
    warnings.push("未能从 .doc 抽出文字，请另存为 .docx / .txt");
  }
  return { text, warnings };
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function looksLikeOle(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

function tryZipAsDocxOrXlsx(bytes: Uint8Array): {
  text: string;
  format: string;
  warnings: string[];
} {
  try {
    const r = extractDocx(bytes);
    return { text: r.text, format: "docx", warnings: r.warnings };
  } catch (docxErr) {
    try {
      const r = extractXlsx(bytes);
      return { text: r.text, format: "xlsx", warnings: r.warnings };
    } catch {
      throw docxErr instanceof Error
        ? docxErr
        : new Error(String(docxErr));
    }
  }
}

/**
 * @param fileName original file name (used for extension)
 * @param bytes file contents
 */
export async function extractDocumentText(
  fileName: string,
  bytes: Uint8Array,
): Promise<DocumentExtractResult> {
  const warnings: string[] = [];
  const ext = extOf(fileName);
  const name = fileName || "document";

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `文件过大（${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB），请压缩到 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB 以内`,
    );
  }

  let format = ext || "unknown";
  let text = "";

  try {
    if (
      ext === "txt" ||
      ext === "csv" ||
      ext === "tsv" ||
      ext === "md" ||
      ext === "markdown" ||
      ext === "html" ||
      ext === "htm" ||
      ext === "json"
    ) {
      format = ext === "markdown" ? "md" : ext;
      text = collapseWs(decodeTextBytes(bytes));
      if (ext === "html" || ext === "htm") {
        text = collapseWs(
          text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]+>/g, " "),
        );
      }
    } else if (ext === "docx") {
      format = "docx";
      const r = extractDocx(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (ext === "xlsx" || ext === "xlsm") {
      format = ext;
      const r = extractXlsx(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (ext === "xls" || ext === "xlsb") {
      throw new Error(
        `暂不支持旧版「.${ext}」（安全原因已移除第三方解析）。请在 Excel 中另存为 .xlsx 后再上传。`,
      );
    } else if (ext === "pdf" || (ext === "" && looksLikePdf(bytes))) {
      format = "pdf";
      const r = extractPdf(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (ext === "doc") {
      format = "doc";
      const r = extractDocBestEffort(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (looksLikeOle(bytes)) {
      throw new Error(
        "检测到旧版 Office 二进制格式。请另存为 .docx 或 .xlsx 后再上传。",
      );
    } else if (looksLikeZip(bytes) || ext === "") {
      const r = tryZipAsDocxOrXlsx(bytes);
      text = r.text;
      format = r.format;
      warnings.push(...r.warnings);
      if (ext && ext !== r.format) {
        warnings.push(`扩展名 .${ext} 与内容（${r.format}）不一致，已按内容解析`);
      }
    } else {
      format = ext || "txt";
      text = collapseWs(decodeTextBytes(bytes));
      if (text.length > 40 && printableRatio(text) < 0.72) {
        throw new Error(
          `「.${format}」不像可读文本（疑似二进制）。请另存为 txt/docx/xlsx`,
        );
      }
      warnings.push(
        `按纯文本解析「.${format}」；若结果乱码请另存为 txt/docx/xlsx`,
      );
    }
  } catch (e) {
    throw new Error(
      `无法解析「${name}」：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const originalLen = text.length;
  text = text.slice(0, MAX_CHARS);
  if (originalLen > MAX_CHARS) {
    warnings.push(`对照稿已截断至 ${MAX_CHARS} 字`);
  }

  return { text, format, fileName: name, warnings };
}

export const COMPARE_UPLOAD_ACCEPT =
  ".txt,.csv,.tsv,.md,.html,.htm,.doc,.docx,.xlsx,.xlsm,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword";
