import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterActionsByAllowlist } from "./contextGate.js";
import {
  maySanitizeReplaceForAgent,
  sanitizeActionsForReplace,
} from "./sanitizeActions.js";

describe("sanitizeActionsForReplace", () => {
  it("injects replace_table when draft + replace intent + style", () => {
    const r = sanitizeActionsForReplace({
      actions: [{ type: "recognize_table" }],
      userText: "用货号信息表替换成真表",
      hasDraft: true,
      styleName: "货号信息表",
    });
    assert.equal(r.actions.some((a) => a.type === "replace_table"), true);
    assert.equal(r.actions.some((a) => a.type === "recognize_table"), false);
    assert.equal(r.skippedVision, true);
  });

  it("does nothing without draft", () => {
    const r = sanitizeActionsForReplace({
      actions: [{ type: "recognize_table" }],
      userText: "替换成真表",
      hasDraft: false,
      styleName: "X",
    });
    assert.deepEqual(r.actions.map((a) => a.type), ["recognize_table"]);
  });

  it("normalize allowlist still drops injected replace after re-filter (F17)", () => {
    const r = sanitizeActionsForReplace({
      actions: [{ type: "apply_table_style", styleName: "A" }],
      userText: "落地替换",
      hasDraft: true,
      styleName: "A",
    });
    const { kept } = filterActionsByAllowlist(r.actions, [
      "lock_selection",
      "list_styles",
      "apply_table_style",
      "open_config",
    ]);
    assert.ok(!kept.some((a) => a.type === "replace_table"));
  });
});

describe("maySanitizeReplaceForAgent", () => {
  it("only allows table_recover", () => {
    assert.equal(maySanitizeReplaceForAgent("m0t.table_recover"), true);
    assert.equal(maySanitizeReplaceForAgent("m0.table_normalize"), false);
    assert.equal(maySanitizeReplaceForAgent("default"), false);
  });
});
