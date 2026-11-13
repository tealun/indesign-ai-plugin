import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandBoundsForTable,
  MIN_TABLE_COL_PT,
  MIN_TABLE_ROW_PT,
} from "./expandBounds.js";

describe("expandBoundsForTable", () => {
  it("keeps top-left; grows height and width for tiny strips", () => {
    const b = expandBoundsForTable(
      { x: 10, y: 20, w: 86, h: 16, unit: "pt" },
      3,
      5,
    );
    assert.equal(b.x, 10);
    assert.equal(b.y, 20);
    assert.equal(b.w, Math.max(86, 5 * MIN_TABLE_COL_PT));
    assert.ok(b.h >= Math.max(16, 3 * MIN_TABLE_ROW_PT + 10));
  });

  it("does not shrink a larger selection", () => {
    const b = expandBoundsForTable(
      { x: 0, y: 0, w: 400, h: 120, unit: "pt" },
      3,
      4,
    );
    assert.equal(b.w, 400);
    assert.equal(b.h, 120);
  });
});
