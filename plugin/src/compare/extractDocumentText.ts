/**
 * Extract plain text from uploaded compare-source documents.
 * Supported: txt/csv/tsv/md/html, docx, xls/xlsx, pdf (text layer), doc (best-effort).
 */

import { inflateSync, unzipSync, strFromU8 } from "fflate";
import * as XLSX from "xlsx";

export type DocumentExtractResult = {
  text: string;
  format: string;
  fileName: string;
  warnings: string[];
};

const MAX_CHARS = 80_000;

function extOf(name: string): string {
  const m = /\.([^.]+)$/.exec(name.trim());
  return (m?.[1] || "").toLowerCase();
}

function decodeTextBytes(bytes: Uint8Array): string {
  // Prefer UTF-8; fall back to latin1 so binary-ish files still yield something.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
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

function extractDocx(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("无法解压 .docx（文件可能已损坏）");
  }
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("无效的 .docx：缺少 word/document.xml");
  const parts: string[] = [stripXml(strFromU8(doc))];
  // Optional: footnotes / endnotes
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

function extractSpreadsheet(
  bytes: Uint8Array,
  fileName: string,
): { text: string; warnings: string[]; format: string } {
  const warnings: string[] = [];
  const wb = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    raw: false,
  });
  if (!wb.SheetNames.length) {
    return { text: "", warnings: ["工作簿没有工作表"], format: extOf(fileName) || "xlsx" };
  }
  const blocks: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n", blankrows: false });
    const body = collapseWs(csv);
    if (!body) continue;
    blocks.push(
      wb.SheetNames.length > 1 ? `【工作表：${name}】\n${body}` : body,
    );
  }
  const text = blocks.join("\n\n");
  if (!text) warnings.push("表格文件未解析出单元格文本");
  return {
    text,
    warnings,
    format: extOf(fileName) || "xlsx",
  };
}

/** Best-effort: pull literal strings from PDF content (text PDFs only). */
function extractPdf(bytes: Uint8Array): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const raw = decodeTextBytes(bytes);
  const chunks: string[] = [];

  // (Hello World) Tj  /  (line) '
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

  // Hex strings <00480065> Tj
  const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((m = hexRe.exec(raw))) {
    const hex = m[1]!.replace(/\s+/g, "");
    if (hex.length < 4 || hex.length % 2) continue;
    const chars: string[] = [];
    // Treat as UTF-16BE when even byte pairs look like it
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
  // Many PDFs store streams Flate-compressed — try inflate content streams
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
  while (i < bytes.length) {
    const start = indexOfBytes(bytes, marker, i);
    if (start < 0) break;
    let dataStart = start + marker.length;
    if (bytes[dataStart] === 0x0d) dataStart++;
    if (bytes[dataStart] === 0x0a) dataStart++;
    const end = indexOfBytes(bytes, endMarker, dataStart);
    if (end < 0) break;
    const slice = bytes.subarray(dataStart, end);
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
      /* not flate or truncated */
    }
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

/** Legacy .doc (OLE): harvest UTF-16LE runs — incomplete but better than nothing. */
function extractDocBestEffort(bytes: Uint8Array): {
  text: string;
  warnings: string[];
} {
  const warnings = [
    "旧版 .doc 为尽力抽取；建议另存为 .docx 后再上传以获得更准结果",
  ];
  const parts: string[] = [];
  // Scan UTF-16LE printable runs (length >= 4 chars)
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 4) {
      parts.push(String.fromCharCode(...run));
    }
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
  const text = collapseWs(parts.join("\n"));
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
    } else if (ext === "docx" || (ext === "" && looksLikeZip(bytes))) {
      format = "docx";
      const r = extractDocx(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "xlsb") {
      const r = extractSpreadsheet(bytes, name);
      text = r.text;
      format = r.format;
      warnings.push(...r.warnings);
    } else if (ext === "pdf" || looksLikePdf(bytes)) {
      format = "pdf";
      const r = extractPdf(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (ext === "doc" || (looksLikeOle(bytes) && ext !== "xls")) {
      // .xls is also OLE — handled above by ext
      format = "doc";
      const r = extractDocBestEffort(bytes);
      text = r.text;
      warnings.push(...r.warnings);
    } else if (looksLikeOle(bytes)) {
      // OLE without clear ext — try spreadsheet then doc
      try {
        const r = extractSpreadsheet(bytes, name.endsWith(".xls") ? name : `${name}.xls`);
        text = r.text;
        format = "xls";
        warnings.push(...r.warnings);
      } catch {
        const r = extractDocBestEffort(bytes);
        text = r.text;
        format = "doc";
        warnings.push(...r.warnings);
      }
    } else if (looksLikeZip(bytes)) {
      // Could be docx/xlsx misnamed
      try {
        const r = extractDocx(bytes);
        text = r.text;
        format = "docx";
        warnings.push(...r.warnings);
      } catch {
        const r = extractSpreadsheet(bytes, `${name}.xlsx`);
        text = r.text;
        format = "xlsx";
        warnings.push(...r.warnings);
      }
    } else {
      // Last resort: treat as text
      format = ext || "txt";
      text = collapseWs(decodeTextBytes(bytes));
      warnings.push(`按纯文本解析「.${format}」；若结果乱码请另存为 txt/docx/xlsx`);
    }
  } catch (e) {
    throw new Error(
      `无法解析「${name}」：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  text = text.slice(0, MAX_CHARS);
  if (text.length >= MAX_CHARS) {
    warnings.push(`对照稿已截断至 ${MAX_CHARS} 字`);
  }

  return { text, format, fileName: name, warnings };
}

export const COMPARE_UPLOAD_ACCEPT =
  ".txt,.csv,.tsv,.md,.html,.htm,.doc,.docx,.xls,.xlsx,.xlsm,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.ms-excel";
