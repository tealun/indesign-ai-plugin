import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChatIntent } from "./chatIntent.js";

describe("parseChatIntent", () => {
  it("parses lock / recognize / replace", () => {
    assert.equal(parseChatIntent("读取选区").kind, "lock");
    assert.equal(parseChatIntent("识别表格").kind, "recognize");
    assert.equal(parseChatIntent("用Catalog-Table样式替换").kind, "replace");
  });

  it("extracts style name", () => {
    const intent = parseChatIntent("套用「正文表」样式替换");
    assert.equal(intent.kind, "replace");
    if (intent.kind === "replace") assert.equal(intent.styleName, "正文表");
  });

  it("parses confirm / cancel", () => {
    assert.equal(parseChatIntent("确认").kind, "confirm");
    assert.equal(parseChatIntent("取消").kind, "cancel");
  });

  it("parses auto table pipeline", () => {
    assert.equal(parseChatIntent("转成表格").kind, "autoTable");
    assert.equal(parseChatIntent("帮我转成真表").kind, "autoTable");
    const withStyle = parseChatIntent("用「正文表」样式转成表格");
    assert.equal(withStyle.kind, "autoTable");
    if (withStyle.kind === "autoTable") assert.equal(withStyle.styleName, "正文表");
  });
});
