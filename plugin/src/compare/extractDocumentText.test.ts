import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  extractDocumentText,
  MAX_UPLOAD_BYTES,
  printableRatio,
} from "./extractDocumentText.js";

function minimalXlsx(): Uint8Array {
  const shared = `<?xml version="1.0"?>
    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
      <si><t>货号</t></si><si><t>A1</t></si>
    </sst>`;
  const sheet = `<?xml version="1.0"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>数量</v></c></row>
        <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>2</v></c></row>
      </sheetData>
    </worksheet>`;
  const wb = `<?xml version="1.0"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`;
  return zipSync({
    "xl/sharedStrings.xml": strToU8(shared),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/workbook.xml": strToU8(wb),
    "[Content_Types].xml": strToU8("<Types/>"),
  });
}

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

  it("reads xlsx via OOXML (no SheetJS)", async () => {
    const r = await extractDocumentText("t.xlsx", minimalXlsx());
    assert.equal(r.format, "xlsx");
    assert.match(r.text, /货号/);
    assert.match(r.text, /A1/);
  });

  it("rejects legacy xls", async () => {
    await assert.rejects(
      () => extractDocumentText("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4])),
      /xlsx/,
    );
  });

  it("rejects oversized upload", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    await assert.rejects(
      () => extractDocumentText("big.txt", big),
      /过大/,
    );
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

  it("zip without ext tries docx then xlsx", async () => {
    const r = await extractDocumentText("mystery", minimalXlsx());
    assert.equal(r.format, "xlsx");
    assert.match(r.text, /货号/);
  });
});

describe("printableRatio", () => {
  it("scores chinese text high", () => {
    assert.ok(printableRatio("你好世界ABC") > 0.9);
  });
});
