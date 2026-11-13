# 01_03 Agent Scenes（专属场景规格）

权威目录见 [`00_08_Agent_Catalog.md`](../00_core/00_08_Agent_Catalog.md)。本文描述行为与验收。

## Shared UX

1. 「Agent」页点选 → `activateAgent` → 切回「对话」首屏。  
2. 专属场景显示场景栏「退出到默认」。  
3. 识图外发仍走全局确认（`00_03` / `00_07`），与 Agent 无关。

## m0t.table_recover（已有）

见 [`01_02_M0T_Vector_Table_Recovery.md`](01_02_M0T_Vector_Table_Recovery.md)。

## m0.table_normalize

**用户故事**：从 Excel/Word 贴进 InDesign 的表，或已有真表，要统一套文档表样式。

**允许 actions**：`lock_selection` | `list_styles` | `apply_table_style` | `open_config`

**验收**

- 用户说「用货号信息表规范化」且选区含真表 → 发射 `apply_table_style`。  
- 无样式名时引导选下拉或列出样式。  
- 不走识图假表路径（那是伪表恢复）。

## m0.copy_compare

**用户故事**：客户给了 Word/Excel/PDF/粘贴文本，要看与当前选区/锁定选区文案差异。

**允许 actions**：`lock_selection` | `open_config`

**行为**：对照稿优先级：`compareDocumentText`（面板「上传对照稿」，支持 txt/doc/docx/xls/xlsx/pdf 等）> 对话粘贴 > `clipboardText`；版面侧为 `selectionText`（锁定或 live，含表 TSV）。模型输出增删改列表。本期**不**自动写回文档（避免毁样式）。扫描件 PDF / 旧版 .doc 可能抽字不全，需在回复中说明。

**验收**：上传对照稿后可「开始比对」；有对照稿 + 选区文本时回复含结构化差异说明；不发射未实现的写文档动作。

## m0.proofread

**用户故事**：校对选区文章（错别字、数字格式、空格、术语）。

**允许 actions**：`lock_selection` | `open_config`

**行为**：基于选区文本输出问题列表与建议改法；用户确认后再人工或后续版本白名单替换。

**验收**：无选区文本时要求先选中/锁定；有文本时给出可执行的修改建议清单。

## m0.grep_assist

**用户故事**：不会写 GREP，要用 Find/Change 或准备 GREP Style。

**允许 actions**：`propose_grep` | `open_config`

**行为**：口语 → InDesign GREP；`propose_grep` 在对话中展示查找式/替换式/说明，并提供复制到系统剪贴板的芯片。样式面板写入 GREP Style = 后续里程碑。

**验收**：用户描述规则后出现可复制的 GREP（含一键复制）；不声称已写入文档样式除非宿主动作存在。

## Non-goals（本规格）

溢出巡检、缺图重链、全书翻译自动灌版、表行跨页。
