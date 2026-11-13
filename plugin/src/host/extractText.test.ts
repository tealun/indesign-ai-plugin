import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractIndesignItemText } from "./extractText.js";

describe("extractIndesignItemText", () => {
  it("reads plain contents", () => {
    assert.equal(extractIndesignItemText({ contents: "你好世界" }), "你好世界");
  });

  it("reads table rows as TSV", () => {
    const table = {
      rows: {
        length: 2,
        item(r: number) {
          const data = [
            ["A", "B"],
            ["1", "2"],
          ];
          return {
            cells: {
              length: 2,
              item(c: number) {
                return { contents: data[r]![c] };
              },
            },
          };
        },
      },
    };
    assert.equal(extractIndesignItemText(table), "A\tB\n1\t2");
  });

  it("walks group children text frames", () => {
    const group = {
      constructor: { name: "Group" },
      allPageItems: {
        length: 2,
        item(i: number) {
          return i === 0
            ? { contents: "框一" }
            : { contents: "框二" };
        },
      },
    };
    const text = extractIndesignItemText(group);
    assert.match(text, /框一/);
    assert.match(text, /框二/);
  });

  it("returns empty for null", () => {
    assert.equal(extractIndesignItemText(null), "");
  });
});
