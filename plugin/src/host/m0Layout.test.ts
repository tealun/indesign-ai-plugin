import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStyleProps,
  executeM0LayoutCommand,
  mapAlignment,
} from "./m0Layout.js";

const ENUMS = {
  LEFT_ALIGN: "LEFT",
  CENTER_ALIGN: "CENTER",
  RIGHT_ALIGN: "RIGHT",
  FULLY_JUSTIFIED: "JUSTIFY",
  LEFT_JUSTIFIED: "LEFT_J",
  RIGHT_JUSTIFIED: "RIGHT_J",
  CENTER_JUSTIFIED: "CENTER_J",
};

describe("mapAlignment", () => {
  it("maps common tokens", () => {
    assert.equal(mapAlignment("left", ENUMS), "LEFT");
    assert.equal(mapAlignment("CENTER", ENUMS), "CENTER");
    assert.equal(mapAlignment("right-align", ENUMS), "RIGHT");
    assert.equal(mapAlignment("justify", ENUMS), "JUSTIFY");
    assert.equal(mapAlignment("left justified", ENUMS), "LEFT_J");
  });

  it("returns null for unknown", () => {
    assert.equal(mapAlignment("diagonal", ENUMS), null);
  });
});

describe("applyStyleProps", () => {
  it("applies numeric and alignment props", () => {
    const style: Record<string, unknown> = {};
    const keys = applyStyleProps(
      style,
      { fontSize: 12, leading: 16, spaceBefore: 4, after: 2, alignment: "center" },
      ENUMS,
    );
    assert.equal(style.pointSize, 12);
    assert.equal(style.leading, 16);
    assert.equal(style.spaceBefore, 4);
    assert.equal(style.spaceAfter, 2);
    assert.equal(style.justification, "CENTER");
    assert.ok(keys.includes("pointSize"));
    assert.ok(keys.includes("justification"));
  });
});

describe("executeM0LayoutCommand (mock doc)", () => {
  function mockDoc() {
    const paras = {
      pointSize: 10,
      leading: 12,
      justification: "LEFT",
      spaceBefore: 0,
      spaceAfter: 0,
      appliedParagraphStyle: null as unknown,
      everyItem() {
        return this;
      },
    };
    const texts = {
      appliedCharacterStyle: null as unknown,
      everyItem() {
        return this;
      },
    };
    const frame = {
      id: 42,
      isValid: true,
      paragraphs: {
        everyItem: () => paras,
        item: () => paras,
      },
      texts: {
        everyItem: () => texts,
        item: () => ({ paragraphs: { item: () => paras, everyItem: () => paras } }),
      },
      geometricBounds: [0, 0, 100, 100],
    };
    const paraStyles = new Map<string, Record<string, unknown>>();
    const charStyles = new Map<string, Record<string, unknown>>();
    return {
      paras,
      texts,
      frame,
      paragraphStyles: {
        itemByName(name: string) {
          const s = paraStyles.get(name);
          if (!s) throw new Error("missing");
          return { ...s, isValid: true, name };
        },
        add({ name }: { name: string }) {
          const s: Record<string, unknown> = { name };
          paraStyles.set(name, s);
          return s;
        },
      },
      characterStyles: {
        itemByName(name: string) {
          const s = charStyles.get(name);
          if (!s) throw new Error("missing");
          return { ...s, isValid: true, name };
        },
        add({ name }: { name: string }) {
          const s: Record<string, unknown> = { name };
          charStyles.set(name, s);
          return s;
        },
      },
      textFrames: {
        itemByID(id: number) {
          if (id === 42) return frame;
          throw new Error("missing");
        },
      },
      pageItems: {
        itemByID(id: number) {
          if (id === 42) return frame;
          throw new Error("missing");
        },
      },
      _paraStyles: paraStyles,
      _charStyles: charStyles,
    };
  }

  it("setFontSize / setLeading / setAlignment / setSpaceBeforeAfter", () => {
    const doc = mockDoc();
    assert.equal(
      executeM0LayoutCommand(doc, {
        type: "setFontSize",
        targetId: "42",
        size: 14,
      }).ok,
      true,
    );
    assert.equal(doc.paras.pointSize, 14);
    assert.equal(
      executeM0LayoutCommand(doc, {
        type: "setLeading",
        targetId: "42",
        leading: 18,
      }).ok,
      true,
    );
    assert.equal(doc.paras.leading, 18);
    assert.equal(
      executeM0LayoutCommand(
        doc,
        { type: "setAlignment", targetId: "42", alignment: "left" },
        { enums: ENUMS },
      ).ok,
      true,
    );
    assert.equal(doc.paras.justification, "LEFT");
    const badAlign = executeM0LayoutCommand(
      doc,
      { type: "setAlignment", targetId: "42", alignment: "diagonal" },
      { enums: ENUMS },
    );
    assert.equal(badAlign.ok, false);
    assert.match(String(badAlign.errorMessage), /无法识别对齐/);
    assert.equal(
      executeM0LayoutCommand(doc, {
        type: "setSpaceBeforeAfter",
        targetId: "42",
        before: 3,
        after: 5,
      }).ok,
      true,
    );
    assert.equal(doc.paras.spaceBefore, 3);
    assert.equal(doc.paras.spaceAfter, 5);
  });

  it("createParaStyle + applyParaStyle", () => {
    const doc = mockDoc();
    const created = executeM0LayoutCommand(doc, {
      type: "createParaStyle",
      name: "Body-AI",
      props: { pointSize: 11, spaceBefore: 1 },
    });
    assert.equal(created.ok, true);
    assert.equal(doc._paraStyles.get("Body-AI")?.pointSize, 11);
    const dup = executeM0LayoutCommand(doc, {
      type: "createParaStyle",
      name: "Body-AI",
      props: {},
    });
    assert.equal(dup.ok, false);
    const applied = executeM0LayoutCommand(doc, {
      type: "applyParaStyle",
      targetId: "42",
      name: "Body-AI",
    });
    assert.equal(applied.ok, true);
    assert.equal((doc.paras.appliedParagraphStyle as { name: string }).name, "Body-AI");
  });

  it("createCharStyle + applyCharStyle", () => {
    const doc = mockDoc();
    assert.equal(
      executeM0LayoutCommand(doc, {
        type: "createCharStyle",
        name: "Emph",
        props: { pointSize: 10 },
      }).ok,
      true,
    );
    assert.equal(
      executeM0LayoutCommand(doc, {
        type: "applyCharStyle",
        targetId: "42",
        name: "Emph",
      }).ok,
      true,
    );
    assert.equal((doc.texts.appliedCharacterStyle as { name: string }).name, "Emph");
  });

  it("moveResizeFrame updates geometricBounds", () => {
    const doc = mockDoc();
    const r = executeM0LayoutCommand(doc, {
      type: "moveResizeFrame",
      targetId: "42",
      bounds: { x: 10, y: 20, w: 100, h: 50, unit: "pt" },
    });
    assert.equal(r.ok, true);
    assert.deepEqual(doc.frame.geometricBounds, [20, 10, 70, 110]);
  });

  it("missing target fails closed", () => {
    const doc = mockDoc();
    const r = executeM0LayoutCommand(doc, {
      type: "setFontSize",
      targetId: "999",
      size: 12,
    });
    assert.equal(r.ok, false);
  });
});
