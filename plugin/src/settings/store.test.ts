import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  normalizeConnectionMode,
  resolveReadySettings,
} from "./store.js";

describe("normalizeConnectionMode", () => {
  it("defaults unknown to byok", () => {
    assert.equal(normalizeConnectionMode(undefined), "byok");
    assert.equal(normalizeConnectionMode("byok"), "byok");
  });

  it("coerces reserved plugin_default to byok until hosted path ships", () => {
    assert.equal(normalizeConnectionMode("plugin_default"), "byok");
  });
});

describe("resolveReadySettings", () => {
  it("accepts complete byok settings", () => {
    const ready = resolveReadySettings({
      ...DEFAULT_SETTINGS,
      connectionMode: "byok",
      baseUrl: "https://relay.example/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    assert.equal(ready.ok, true);
  });

  it("rejects incomplete byok", () => {
    const ready = resolveReadySettings({
      ...DEFAULT_SETTINGS,
      baseUrl: "https://relay.example/v1",
      apiKey: "",
      model: "gpt-4o",
    });
    assert.equal(ready.ok, false);
    if (!ready.ok) assert.match(ready.reason, /自配模型/);
  });

  it("blocks plugin_default until hosted path exists", () => {
    const ready = resolveReadySettings({
      ...DEFAULT_SETTINGS,
      connectionMode: "plugin_default",
      baseUrl: "https://relay.example/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    assert.equal(ready.ok, false);
    if (!ready.ok) assert.match(ready.reason, /尚未开放/);
  });
});
