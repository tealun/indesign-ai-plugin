import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandBoundsForTable } from "./expandBounds.js";

describe("expandBoundsForTable", () => {
  it("expands tiny strip to fit rows/cols", () => {
    const b = expandBoundsForTable(
      { x: 10, y: 20, w: 86, h: 16, unit: "pt" },
      3,
      5,
    );
    assert.ok(b.h >= 3 * 18);
    assert.ok(b.w >= 5 * 42);
    assert.equal(b.x, 10);
    assert.equal(b.y, 20);
  });
});
