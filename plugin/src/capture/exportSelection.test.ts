import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEdge } from "./exportSelection.js";

describe("normalizeEdge", () => {
  it("scales longest edge to 2048", () => {
    const r = normalizeEdge(4096, 2048);
    assert.equal(r.scaled, true);
    assert.equal(r.width, 2048);
    assert.equal(r.height, 1024);
  });

  it("leaves small images unchanged", () => {
    const r = normalizeEdge(800, 600);
    assert.equal(r.scaled, false);
    assert.equal(r.width, 800);
  });
});
