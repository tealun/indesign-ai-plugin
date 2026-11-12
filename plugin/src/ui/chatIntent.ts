export type ChatIntent =
  | { kind: "help" }
  | { kind: "lock" }
  | { kind: "recognize"; note?: string }
  | { kind: "replace"; styleName?: string }
  | { kind: "styles" }
  | { kind: "status" }
  | { kind: "config" }
  | { kind: "clear" }
  | { kind: "unknown"; text: string };

export function parseChatIntent(raw: string): ChatIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (!text) return { kind: "help" };

  if (/^(帮助|help|\?|怎么用)/i.test(text)) return { kind: "help" };
  if (/^(清空|清除对话|clear)/i.test(text)) return { kind: "clear" };
  if (/^(配置|设置|settings|config)/i.test(text)) return { kind: "config" };
  if (/^(状态|status)/i.test(text)) return { kind: "status" };
  if (/(表样式|样式列表|有哪些样式)/.test(text)) return { kind: "styles" };

  if (/(读取选区|锁定选区|读选区|选中了什么|看选区)/.test(text)) {
    return { kind: "lock" };
  }

  if (/(识别|识图|导出并识别|分析表格|读表|OCR|转换成表)/i.test(text)) {
    return { kind: "recognize", note: text };
  }

  const styleMatch =
    text.match(/(?:用|套用|使用)?[「"']?([^「」"'\s]+)[」"']?(?:表)?样式(?:替换|转成真表|应用)?/) ||
    text.match(/替换(?:成|为|用)?\s*[「"']?([^「」"'\s]+)[」"']?/);
  if (/(替换|转成真表|生成真表|落地|应用)/.test(text) || styleMatch) {
    const styleName = styleMatch?.[1];
    return styleName
      ? { kind: "replace", styleName }
      : { kind: "replace" };
  }

  if (/选区|表格|矢量/.test(text) && /(开始|帮我|处理)/.test(text)) {
    return { kind: "lock" };
  }

  void lower;
  return { kind: "unknown", text };
}
