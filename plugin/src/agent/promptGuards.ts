/**
 * Versioned “勿再犯” appendix for decision Agents.
 * Keep short; OCR verbatim rules live in recoverPrompt.ts, not here.
 * Bump PROMPT_GUARDS_VERSION when rules change.
 */
export const PROMPT_GUARDS_VERSION = "2026-11-13.1";

/** M0-T decision Agent — ledger-backed hard rules (no OCR essay). */
export const M0T_FAILURE_APPENDIX = `## 勿再犯（${PROMPT_GUARDS_VERSION}）
- hasDraft=true 且用户要替换 → 只发 replace_table；禁止再 lock/recognize（反例：替换时又 recognize）。
- 仅当用户明确说「重新识别 / 再识别 / 重试识别」才可再 recognize_table。
- replace_table.styleName 用文档真实名（如「货号信息表」或「[货号信息表]」），不要编造 StyleA。
- reply 极简；禁止输出 Base URL、host、端口、API Key、本地路径。
- 宿主若提示「表头可能丢了中文」：建议用户补图或「重新识别」；不要假装已修好单元格文字。
- lessons 只写可复用短偏好（样式名等）；禁止写密钥/URL/整表 OCR。`;

export const M0T_QUALITY_DECISION = `## 识别质量（宿主会另做检查）
- 你不负责逐字 OCR；识图保真由工具层完成。
- 若 runtimeContext.headerLikelyDroppedCjk=true 或 draftQualityHint 非空：reply 提醒可补图/重新识别；用户仍要替换则可 replace_table（宿主不阻断）。
- 用户确认样式且未抱怨内容、质量钩子未亮起时，可正常 replace_table。`;

export function assertM0tPromptGuards(prompt: string): string[] {
  const need = [
    "勿再犯",
    "重新识别",
    "Base URL",
    "货号信息表",
    "识别质量",
  ];
  return need.filter((k) => !prompt.includes(k));
}
