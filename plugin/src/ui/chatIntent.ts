export type ChatIntent =
  | { kind: "help" }
  | { kind: "lock" }
  | { kind: "recognize"; note?: string }
  | { kind: "autoTable"; styleName?: string; note?: string }
  | { kind: "replace"; styleName?: string }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "styles" }
  | { kind: "status" }
  | { kind: "config" }
  | { kind: "clear" }
  | { kind: "unknown"; text: string };

function extractStyleName(text: string): string | undefined {
  const styleMatch =
    text.match(/(?:用|套用|使用)?[「"']?([^「」"'\s]+)[」"']?(?:表)?样式/) ||
    text.match(/(?:用|套用|使用)\s*[「"']?([^「」"'\s]+)[」"']?/);
  return styleMatch?.[1];
}

export function parseChatIntent(raw: string): ChatIntent {
  const text = raw.trim();
  if (!text) return { kind: "help" };

  if (/^(帮助|help|\?|怎么用)/i.test(text)) return { kind: "help" };
  if (/^(清空|清除对话|clear)/i.test(text)) return { kind: "clear" };
  if (/^(配置|设置|settings|config)/i.test(text)) return { kind: "config" };
  if (/^(状态|status)/i.test(text)) return { kind: "status" };
  if (/^(确认|确认发送|确认替换|继续|好的|可以|yes|ok)$/i.test(text)) {
    return { kind: "confirm" };
  }
  if (/^(取消|不要|算了|no|cancel)$/i.test(text)) return { kind: "cancel" };
  if (/(表样式|样式列表|有哪些样式)/.test(text)) return { kind: "styles" };

  if (/(读取选区|锁定选区|读选区|选中了什么|看选区)/.test(text)) {
    return { kind: "lock" };
  }

  // Full pipeline: lock → recognize → replace
  if (
    /(转成(真)?表|换成真表|伪表转|矢量转表|一键(转换|替换|转表)|全自动|自动(转换|替换|转表)|帮我转成)/.test(
      text,
    )
  ) {
    const styleName = extractStyleName(text);
    return styleName
      ? { kind: "autoTable", styleName, note: text }
      : { kind: "autoTable", note: text };
  }

  // Recognize only (not full convert)
  if (/(识别|识图|导出并识别|分析表格|读表|OCR)/i.test(text)) {
    return { kind: "recognize", note: text };
  }

  const styleName = extractStyleName(text);
  if (/(替换|转成真表|生成真表|落地|应用)/.test(text) || styleName) {
    return styleName
      ? { kind: "replace", styleName }
      : { kind: "replace" };
  }

  if (/选区|表格|矢量/.test(text) && /(开始|帮我|处理)/.test(text)) {
    return { kind: "autoTable", note: text };
  }

  return { kind: "unknown", text };
}
