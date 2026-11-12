import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preflightTableReplace } from "./preflight.js";
import { createStubHost } from "../executor/stubHost.js";
import type { LockedSelection } from "../host/session.js";

describe("preflightTableReplace", () => {
  it("rejects missing table style before write", async () => {
    const host = createStubHost({ tableStyles: ["Catalog-Table"] });
    const locked: LockedSelection = {
      snapshot: {
        documentName: "x",
        pageIndex: 0,
        selection: [
          {
            id: "sel_1",
            type: "group",
            bounds: { x: 0, y: 0, w: 10, h: 10, unit: "pt" },
          },
        ],
      },
      ids: ["sel_1"],
      boundsById: {
        sel_1: { x: 0, y: 0, w: 10, h: 10, unit: "pt" },
      },
      unionBounds: { x: 0, y: 0, w: 10, h: 10, unit: "pt" },
      pageIndex: 0,
      capturedAt: Date.now(),
    };
    const result = await preflightTableReplace({
      draft: {
        headerRowCount: 1,
        footerRowCount: 0,
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
      tableStyleName: "Missing-Style",
      locked,
      host,
    });
    assert.equal(result.ok, false);
  });
});
