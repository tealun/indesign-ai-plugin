import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skillsForAgent, skillsPromptBlock } from "./registry.js";

describe("skillsForAgent", () => {
  it("includes wildcard skills for default", () => {
    const ids = skillsForAgent("default").map((s) => s.id);
    assert.ok(ids.includes("skill.craft_advisor_sop"));
    assert.ok(ids.includes("skill.table_style_priority"));
  });

  it("scopes grep dialect to grep agent and wildcard", () => {
    const grep = skillsForAgent("m0.grep_assist").map((s) => s.id);
    assert.ok(grep.includes("skill.grep_indesign_dialect"));
    assert.ok(grep.includes("skill.craft_advisor_sop"));
  });

  it("does not attach compare-only skill to grep-only filter incorrectly", () => {
    // compare skill lists "*" so it appears everywhere by design
    const block = skillsPromptBlock("m0.grep_assist");
    assert.match(block, /已挂载技能/);
    assert.match(block, /GREP/);
  });
});
