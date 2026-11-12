import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandBoundsForTable } from "./expandBounds.js";

describe("expandBoundsForTable", () => {
  it("keeps width and top-left; may grow height only", () => {
    const b = expandBoundsForTable(
      { x: 10, y: 20, w: 86, h: 16, unit: "pt" },
      3,
      5,
    );
    assert.equal(b.x, 10);
    assert.equal(b.y, 20);
    assert.equal(b.w, 86);
    assert.ok(b.h >= 16);
  });

  it("does not widen original bounds", () => {
    const b = expandBoundsForTable(
      { x: 0, y: 0, w: 200, h: 80, unit: "pt" },
      3,
      8,
    );
    assert.equal(b.w, 200);
    assert.equal(b.h, 80);
  });
});
