import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  recoverTableSystemPrompt,
  recoverTableTemperature,
  recoverTableUserPrompt,
} from "./recoverPrompt.js";

describe("recoverTable prompts", () => {
  it("requires bilingual/CJK verbatim copy", () => {
    const user = recoverTableUserPrompt();
    assert.match(user, /货号/);
    assert.match(user, /VERBATIM OCR/);
    assert.match(user, /bilingual/i);
    assert.match(recoverTableSystemPrompt(), /Chinese|CJK/i);
  });

  it("clamps temperature for OCR", () => {
    assert.equal(recoverTableTemperature(0.8), 0.1);
    assert.equal(recoverTableTemperature(0), 0);
  });
});
