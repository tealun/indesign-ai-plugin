import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyNestedGrepStyleOnDoc,
  findMatchingGrepIndex,
  listCharacterStyleNamesFromDoc,
  listNestedGrepStylesFromDoc,
  listParagraphStyleNamesFromDoc,
} from "./grepStyle.js";

function mockDoc() {
  const nested: Array<{
    grepExpression: string;
    appliedCharacterStyle: { name: string };
  }> = [];
  const paraStyles = new Map<string, any>();
  const charStyles = new Map<string, any>();

  const makePara = (name: string) => {
    const style = {
      name,
      isValid: true,
      nestedGrepStyles: {
        get length() {
          return nested.length;
        },
        item(i: number) {
          return nested[i];
        },
        add(props: {
          grepExpression: string;
          appliedCharacterStyle: { name: string };
        }) {
          nested.push({ ...props });
          return nested[nested.length - 1];
        },
      },
    };
    paraStyles.set(name, style);
    return style;
  };

  makePara("Body");
  makePara("[Basic Paragraph]");
  charStyles.set("Price", { name: "Price", isValid: true });
  charStyles.set("Emph", { name: "Emph", isValid: true });

  return {
    nested,
    paragraphStyles: {
      length: paraStyles.size,
      item(i: number) {
        return [...paraStyles.values()][i];
      },
      itemByName(name: string) {
        const s = paraStyles.get(name);
        if (!s) throw new Error("missing");
        return s;
      },
    },
    characterStyles: {
      length: charStyles.size,
      item(i: number) {
        return [...charStyles.values()][i];
      },
      itemByName(name: string) {
        const s = charStyles.get(name);
        if (!s) throw new Error("missing");
        return s;
      },
    },
  };
}

describe("findMatchingGrepIndex", () => {
  it("matches exact expression", () => {
    assert.equal(
      findMatchingGrepIndex([{ grepExpression: "\\d+" }, { grepExpression: "ab" }], "\\d+"),
      0,
    );
    assert.equal(findMatchingGrepIndex([{ grepExpression: "x" }], "y"), -1);
  });
});

describe("list style names", () => {
  it("lists paragraph and character styles", () => {
    const doc = mockDoc();
    assert.deepEqual(listParagraphStyleNamesFromDoc(doc), [
      "Body",
      "[Basic Paragraph]",
    ]);
    assert.deepEqual(listCharacterStyleNamesFromDoc(doc), ["Price", "Emph"]);
  });
});

describe("applyNestedGrepStyleOnDoc", () => {
  it("adds a nested GREP style", () => {
    const doc = mockDoc();
    const r = applyNestedGrepStyleOnDoc(doc, {
      paragraphStyleName: "Body",
      characterStyleName: "Price",
      grepExpression: "\\\\d+",
    });
    assert.equal(r.ok, true);
    assert.equal(r.added, true);
    assert.equal(doc.nested.length, 1);
    assert.equal(doc.nested[0]!.grepExpression, "\\\\d+");
    assert.equal(doc.nested[0]!.appliedCharacterStyle.name, "Price");
  });

  it("updates existing same expression", () => {
    const doc = mockDoc();
    applyNestedGrepStyleOnDoc(doc, {
      paragraphStyleName: "Body",
      characterStyleName: "Price",
      grepExpression: "\\d+",
    });
    const r = applyNestedGrepStyleOnDoc(doc, {
      paragraphStyleName: "Body",
      characterStyleName: "Emph",
      grepExpression: "\\d+",
    });
    assert.equal(r.ok, true);
    assert.equal(r.updated, true);
    assert.equal(doc.nested.length, 1);
    assert.equal(doc.nested[0]!.appliedCharacterStyle.name, "Emph");
  });

  it("fails closed on missing styles", () => {
    const doc = mockDoc();
    assert.equal(
      applyNestedGrepStyleOnDoc(doc, {
        paragraphStyleName: "Nope",
        characterStyleName: "Price",
        grepExpression: "a",
      }).ok,
      false,
    );
    assert.equal(
      applyNestedGrepStyleOnDoc(doc, {
        paragraphStyleName: "Body",
        characterStyleName: "Nope",
        grepExpression: "a",
      }).ok,
      false,
    );
  });

  it("lists nested entries", () => {
    const doc = mockDoc();
    applyNestedGrepStyleOnDoc(doc, {
      paragraphStyleName: "Body",
      characterStyleName: "Price",
      grepExpression: "foo",
    });
    const list = listNestedGrepStylesFromDoc(doc, "Body");
    assert.equal(list.length, 1);
    assert.equal(list[0]!.grepExpression, "foo");
    assert.equal(list[0]!.characterStyleName, "Price");
  });
});
