import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCellText } from "./cellText.js";

describe("normalizeCellText", () => {
  it("collapses soft/hard breaks to spaces", () => {
    assert.equal(normalizeCellText("货号\nCode NO."), "货号 Code NO.");
    assert.equal(normalizeCellText("a\r\nb\u2028c"), "a b c");
  });

  it("trims and squeezes spaces", () => {
    assert.equal(normalizeCellText("  0-25  \n  "), "0-25");
  });
});
