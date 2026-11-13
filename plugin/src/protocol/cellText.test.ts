import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCellText } from "./cellText.js";

describe("normalizeCellText", () => {
  it("maps soft/line breaks to hard returns", () => {
    assert.equal(normalizeCellText("货号\nCode NO."), "货号\rCode NO.");
    assert.equal(normalizeCellText("a\r\nb\u2028c"), "a\rb\rc");
  });

  it("trims edges and squeezes spaces without dropping returns", () => {
    assert.equal(normalizeCellText("  0-25  \n  "), "0-25");
    assert.equal(normalizeCellText("  货号  \n  Code  "), "货号\rCode");
  });
});
