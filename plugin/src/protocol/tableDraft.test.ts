import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeHeaderFooterCounts,
  validateTableDraft,
} from "./tableDraft.js";
import { validateCommandBatch } from "./whitelist.js";
import type { LayoutCommand } from "../types/protocol.js";

describe("normalizeHeaderFooterCounts", () => {
  it("clamps header=2 on a 2-row table to leave one body row", () => {
    const n = normalizeHeaderFooterCounts(2, 2, 0);
    assert.equal(n.headerRowCount, 1);
    assert.equal(n.footerRowCount, 0);
    assert.equal(n.repaired, true);
  });

  it("drops footer when header+footer leave no body", () => {
    const n = normalizeHeaderFooterCounts(2, 1, 1);
    assert.equal(n.headerRowCount, 1);
    assert.equal(n.footerRowCount, 0);
    assert.equal(n.repaired, true);
  });
});

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

  it("repairs header-only mislabel on 2-row tables", () => {
    const result = validateTableDraft({
      headerRowCount: 2,
      footerRowCount: 0,
      rows: [
        ["货号", "范围"],
        ["125-101", "0-25"],
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.draft.headerRowCount, 1);
      assert.equal(result.draft.footerRowCount, 0);
      assert.equal(result.bodyRowCount, 1);
    }
  });

  it("rejects single-row matrices", () => {
    const result = validateTableDraft({
      headerRowCount: 1,
      footerRowCount: 0,
      rows: [["a", "b"]],
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
