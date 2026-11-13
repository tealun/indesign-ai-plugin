import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTableReplaceCommands } from "./buildTableReplaceCommands.js";

describe("buildTableReplaceCommands order", () => {
  it("applies table style before and after cell writes", () => {
    const built = buildTableReplaceCommands({
      pageIndex: 0,
      bounds: { x: 10, y: 20, w: 86, h: 16, unit: "pt" },
      draft: {
        headerRowCount: 1,
        footerRowCount: 0,
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
      tableStyleName: "货号信息表",
      selectionIds: ["1"],
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const types = built.commands.map((c) => c.type);
    assert.deepEqual(types.slice(0, 3), [
      "createTextFrame",
      "createTable",
      "applyTableStyle",
    ]);
    assert.equal(types[types.length - 2], "applyTableStyle");
    assert.equal(types[types.length - 1], "removeObjects");
    const frame = built.commands[0]!;
    assert.equal(frame.type, "createTextFrame");
    if (frame.type === "createTextFrame") {
      // 2 columns → at least 2×42pt; tiny 86×16 selection must grow
      assert.ok(frame.bounds.w >= 84);
      assert.equal(frame.bounds.x, 10);
      assert.equal(frame.bounds.y, 20);
      assert.ok(frame.bounds.h >= 16);
    }
  });
});
