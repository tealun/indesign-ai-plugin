import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { extractDocumentText } from "./extractDocumentText.js";

describe("extractDocumentText", () => {
  it("reads utf-8 txt", async () => {
    const bytes = new TextEncoder().encode("第一行\n第二行");
    const r = await extractDocumentText("a.txt", bytes);
    assert.equal(r.format, "txt");
    assert.match(r.text, /第一行/);
    assert.match(r.text, /第二行/);
  });

  it("reads docx document.xml via zip", async () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>你好DOCX</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>`;
    const zipped = zipSync({
      "word/document.xml": strToU8(xml),
      "[Content_Types].xml": strToU8("<Types/>"),
    });
    const r = await extractDocumentText("sample.docx", zipped);
    assert.equal(r.format, "docx");
    assert.match(r.text, /你好DOCX/);
    assert.match(r.text, /A/);
    assert.match(r.text, /B/);
  });

  it("reads xlsx via SheetJS", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["货号", "数量"],
      ["A1", 2],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const r = await extractDocumentText("t.xlsx", new Uint8Array(out));
    assert.equal(r.format, "xlsx");
    assert.match(r.text, /货号/);
    assert.match(r.text, /A1/);
  });

  it("reads simple uncompressed pdf literals", async () => {
    const body = `%PDF-1.1
1 0 obj<<>>endobj
BT (HelloPDF) Tj ET
trailer<<>>
%%EOF`;
    const r = await extractDocumentText(
      "x.pdf",
      new TextEncoder().encode(body),
    );
    assert.equal(r.format, "pdf");
    assert.match(r.text, /HelloPDF/);
  });

  it("strips html tags", async () => {
    const html = "<html><body><p>甲</p><br/><b>乙</b></body></html>";
    const r = await extractDocumentText(
      "a.html",
      new TextEncoder().encode(html),
    );
    assert.match(r.text, /甲/);
    assert.match(r.text, /乙/);
    assert.doesNotMatch(r.text, /<p>/);
  });
});
