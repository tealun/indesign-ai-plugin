import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAgent } from "./catalog.js";
import { assertM0tPromptGuards } from "./promptGuards.js";
import {
  recoverTableSystemPrompt,
  recoverTableUserPrompt,
} from "../providers/recoverPrompt.js";

describe("prompt guards wiring", () => {
  it("m0t agent prompt includes failure appendix + quality", () => {
    const prompt = getAgent("m0t.table_recover").buildSystemPrompt();
    assert.deepEqual(assertM0tPromptGuards(prompt), []);
  });

  it("recover prompt still enforces verbatim CJK", () => {
    const user = recoverTableUserPrompt();
    assert.match(user, /货号/);
    assert.match(user, /VERBATIM/);
    assert.match(recoverTableSystemPrompt(), /CJK|Chinese/i);
  });
});
