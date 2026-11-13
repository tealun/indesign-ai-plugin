import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectionSummary } from "./session.js";
import type { SelectionItem } from "../types/protocol.js";

function item(
  partial: Pick<SelectionItem, "id" | "type"> & Partial<SelectionItem>,
): SelectionItem {
  return {
    bounds: { x: 0, y: 0, w: 1, h: 1, unit: "pt" },
    ...partial,
  } as SelectionItem;
}

describe("selectionSummary", () => {
  it("summarizes many objects without listing every id", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({ id: String(i), type: "graphic" }),
    );
    const s = selectionSummary(items);
    assert.equal(s, "20 个对象");
    assert.doesNotMatch(s, /graphic#/);
  });

  it("describes a single text frame", () => {
    assert.equal(
      selectionSummary([item({ id: "1", type: "textFrame" })]),
      "1 个文本框",
    );
  });
});
