import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchTableStyleName } from "./matchStyle.js";

describe("matchTableStyleName", () => {
  const styles = ["[无表样式]", "[基本表]", "[货号信息表]", "[密集型货号信息表]"];

  it("matches bare name to bracketed style", () => {
    assert.equal(matchTableStyleName("货号信息表", styles), "[货号信息表]");
  });

  it("matches exact bracketed name", () => {
    assert.equal(matchTableStyleName("[货号信息表]", styles), "[货号信息表]");
  });

  it("returns null for unknown", () => {
    assert.equal(matchTableStyleName("不存在", styles), null);
  });
});
