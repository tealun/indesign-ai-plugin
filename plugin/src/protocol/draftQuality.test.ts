import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessHeaderLanguage } from "./draftQuality.js";

describe("assessHeaderLanguage", () => {
  it("flags English-only headers as likely dropped CJK", () => {
    const h = assessHeaderLanguage({
      headerRowCount: 1,
      footerRowCount: 0,
      suggestedTableStyleName: "",
      rows: [
        ["Code No.", "Measuring Range mm"],
        ["141-262", "0-150"],
      ],
    });
    assert.equal(h.likelyDroppedCjk, true);
    assert.ok(h.message);
  });

  it("accepts bilingual headers with CJK", () => {
    const h = assessHeaderLanguage({
      headerRowCount: 1,
      footerRowCount: 0,
      suggestedTableStyleName: "",
      rows: [
        ["货号\nCode NO.", "测量范围\nMeasuring Range mm"],
        ["141-262", "0-150"],
      ],
    });
    assert.equal(h.likelyDroppedCjk, false);
    assert.equal(h.message, null);
  });
});
