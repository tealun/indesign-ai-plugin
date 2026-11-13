import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterActionsByAllowlist,
  shouldHarvestLiveSelection,
  shouldInjectCompareDocument,
  shouldReadClipboard,
} from "./contextGate.js";

describe("contextGate", () => {
  it("scopes compare document to compare agent only", () => {
    assert.equal(shouldInjectCompareDocument("m0.copy_compare"), true);
    assert.equal(shouldInjectCompareDocument("default"), false);
    assert.equal(shouldInjectCompareDocument("m0.grep_assist"), false);
  });

  it("does not read clipboard for default advisor", () => {
    assert.equal(shouldReadClipboard("m0.copy_compare"), true);
    assert.equal(shouldReadClipboard("default"), false);
  });

  it("limits live selection harvest", () => {
    assert.equal(shouldHarvestLiveSelection("m0.proofread"), true);
    assert.equal(shouldHarvestLiveSelection("m0.grep_assist"), false);
    assert.equal(shouldHarvestLiveSelection("default"), false);
  });

  it("filters actions by allowlist", () => {
    const { kept, dropped } = filterActionsByAllowlist(
      [
        { type: "open_config" },
        { type: "replace_table" },
        { type: "apply_table_style" },
      ],
      ["open_config", "apply_table_style"],
    );
    assert.deepEqual(
      kept.map((a) => a.type),
      ["open_config", "apply_table_style"],
    );
    assert.deepEqual(
      dropped.map((a) => a.type),
      ["replace_table"],
    );
  });

  it("drops replace_table re-injected after sanitize when agent forbids it (F17)", () => {
    // Simulates: filter → sanitize injects replace_table → must filter again
    const normalizeAllowed = [
      "lock_selection",
      "list_styles",
      "apply_table_style",
      "open_config",
    ];
    const afterSanitize = [
      { type: "apply_table_style" },
      { type: "replace_table" },
    ];
    const { kept } = filterActionsByAllowlist(afterSanitize, normalizeAllowed);
    assert.deepEqual(
      kept.map((a) => a.type),
      ["apply_table_style"],
    );
  });
});
