import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAgentDecision } from "./parseDecision.js";

describe("parseAgentDecision", () => {
  it("parses reply and replace action", () => {
    const d = parseAgentDecision(
      JSON.stringify({
        reply: "用货号信息表替换",
        actions: [{ type: "replace_table", styleName: "货号信息表" }],
      }),
    );
    assert.equal(d.reply, "用货号信息表替换");
    assert.equal(d.actions[0]?.type, "replace_table");
  });

  it("drops unknown actions", () => {
    const d = parseAgentDecision(
      JSON.stringify({
        reply: "ok",
        actions: [{ type: "hack_system" }, { type: "list_styles" }],
      }),
    );
    assert.deepEqual(d.actions, [{ type: "list_styles" }]);
  });

  it("understands bare style continuation shape", () => {
    const d = parseAgentDecision(`{
      "reply": "好的，按货号信息表写入。",
      "actions": [{"type":"replace_table","styleName":"[货号信息表]"}]
    }`);
    assert.equal(d.actions[0]?.type, "replace_table");
  });

  it("parses taskId and lessons", () => {
    const d = parseAgentDecision(
      JSON.stringify({
        reply: "写入中",
        taskId: "m0t.replace_with_style",
        actions: [{ type: "replace_table", styleName: "货号信息表" }],
        lessons: [{ scope: "project", text: "本册伪表常用货号信息表", taskId: "m0t.replace_with_style" }],
      }),
    );
    assert.equal(d.taskId, "m0t.replace_with_style");
    assert.equal(d.lessons?.[0]?.scope, "project");
  });
});

