import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateTableDraft } from "./tableDraft.js";
import { validateCommandBatch } from "./whitelist.js";
import type { LayoutCommand } from "../types/protocol.js";

describe("validateTableDraft", () => {
  it("accepts header+body+footer matrix", () => {
    const result = validateTableDraft({
      headerRowCount: 1,
      footerRowCount: 1,
      rows: [
        ["品名", "规格", "数量"],
        ["A", "10mm", "2"],
        ["合计", "", "2"],
      ],
      merges: [{ r: 0, c: 0 }],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.bodyRowCount, 1);
      assert.equal(result.columnCount, 3);
    }
  });

  it("rejects bodyRowCount < 1", () => {
    const result = validateTableDraft({
      headerRowCount: 1,
      footerRowCount: 1,
      rows: [
        ["a", "b"],
        ["c", "d"],
      ],
    });
    assert.equal(result.ok, false);
  });
});

describe("validateCommandBatch", () => {
  it("fail-closes on unknown type", () => {
    const commands = [
      { type: "createTextFrame", pageIndex: 0, bounds: { x: 0, y: 0, w: 10, h: 10, unit: "pt" } },
      { type: "evalScript", code: "alert(1)" },
    ] as unknown as LayoutCommand[];
    const result = validateCommandBatch(commands);
    assert.equal(result.ok, false);
  });

  it("accepts M0-T createTable shape", () => {
    const commands: LayoutCommand[] = [
      {
        type: "createTextFrame",
        pageIndex: 0,
        bounds: { x: 0, y: 0, w: 100, h: 50, unit: "pt" },
      },
      {
        type: "createTable",
        parentFrameId: "$created.frameId",
        bodyRowCount: 1,
        columnCount: 3,
        headerRowCount: 1,
        footerRowCount: 1,
      },
    ];
    assert.equal(validateCommandBatch(commands).ok, true);
  });
});
