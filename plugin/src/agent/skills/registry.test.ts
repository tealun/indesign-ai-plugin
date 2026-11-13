import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skillsForAgent, skillsPromptBlock } from "./registry.js";

describe("skillsForAgent", () => {
  it("includes wildcard skills for default", () => {
    const ids = skillsForAgent("default").map((s) => s.id);
    assert.ok(ids.includes("skill.craft_advisor_sop"));
    assert.ok(ids.includes("skill.table_style_priority"));
  });

  it("scopes grep dialect to grep agent and shared SOP", () => {
    const grep = skillsForAgent("m0.grep_assist").map((s) => s.id);
    assert.ok(grep.includes("skill.grep_indesign_dialect"));
    assert.ok(grep.includes("skill.craft_advisor_sop"));
  });

  it("does not attach compare skill to grep agent", () => {
    const ids = skillsForAgent("m0.grep_assist").map((s) => s.id);
    assert.ok(!ids.includes("skill.compare_no_blind_write"));
    assert.ok(!ids.includes("skill.proof_list_format"));
    const block = skillsPromptBlock("m0.grep_assist");
    assert.match(block, /已挂载技能/);
    assert.match(block, /GREP/);
    assert.doesNotMatch(block, /比对不盲写/);
  });

  it("does not attach grep dialect to compare agent", () => {
    const ids = skillsForAgent("m0.copy_compare").map((s) => s.id);
    assert.ok(ids.includes("skill.compare_no_blind_write"));
    assert.ok(!ids.includes("skill.grep_indesign_dialect"));
  });
});
