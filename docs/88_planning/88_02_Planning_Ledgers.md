# 88_02 Planning Ledgers

Updated: 2026-11-13 — M0 选区排版宿主落地（0.4.9）+ M0.4 稳固（0.4.8）；明确不做溢出与缺图。

## Decisions

- 主场景：书籍/杂志内页排版；样式与对象辅助创建及应用为最紧急价值。
- **紧急优先尖兵 M0-T**：画册矢量曲线伪表 → 真表；套用文档**已有** Table Style；含表头行与表尾行。
- M0-T 交互：选中矢量组 + 自动导出选区图给视觉模型；预览确认后替换；识别不准可粘贴补图。
- M0 可演示结果（基线）：选区微调（原选项 C）+ 段/字符样式创建与套用；排期上让位于 M0-T 共享脚手架之后。
- 宿主：InDesign；兼容基线 **2024+**；主测可用最新 CC。
- UI：UXP 常驻面板；主控 + 分步/折叠配置；**Agent 列表点选回对话首屏**。
- 通信：M0 面板直连 API；后期统一后端；布局指令 JSON 协议稳定。
- 供应商：必须可配 Base URL / API Key / Model；内置 OpenAI 兼容（含中转、DeepSeek）、Claude、Gemini；本期仅 BYOK。
- M0 命令白名单已锁定（见 `00_04`）；Agent 动作另见 `00_08`。
- **专属 Agent（本期）**：伪表恢复、选区排版、贴表规范化、文稿比对、文章校对、GREP 助手 — 权威表 `00_08`；实机勾选 `02_03`。
- **默认顾问**：画册/内页工艺专家（非路由壳）；Skills 共用/`agents` 专属挂载 — `00_09`；`recommendAgentId` 转交。
- **宿主消毒**：`sanitizeActionsForReplace` 仅 `m0t.table_recover`；`directAgentTurn` 二次白名单过滤；离场清 draft/对照稿/排版预览 — per EV-02/03、0.4.8–0.4.9。
- **M0 白名单宿主**：原 stub 的字号/行距/对齐/段字符样式/`moveResizeFrame` 已由 `plugin/src/host/m0Layout.ts` 落地（0.4.9）；改文档路径 = 分析预览 → `validateCommandBatch` → `runCommandBatch`。
- **明确不做**：溢出巡检 Agent、缺图/批量重链 Agent（既有软件已有提醒）。
- 非目标：全书重排、M0 知识库、全书印前全局校对、每视觉风格独立 Agent 进程。
- 产品重心：版式评估与优化（评估主能力放 M1，M0 先安全执行闭环）。
- **外发确认不回显端点**：对话/进度文案不得展示 Base URL、host、端口；确认只说明「发往当前识图通道」，端点仅在「配置」页可见。为 BYOK 中转保密与未来官方托管服务防泄密（2026-11-13）。
- **界面极简**：对话只呈现结果与需用户决策的点；禁止步骤旁白（导出中/理解中/执行链/沉淀经验等）。见 `99_06`。
- **文档隔离**：切文档必须重建 chat-log；不持久化文档绝对路径；`user` 级经验同机跨文档、托管账号体系另议。
- **合入约定（2026-11-13）**：用户确认过的改动默认 squash/merge 进 `main`，不再只停在 feature PR。

## Assumptions

- 「对象」M0 以文本框为主；`createTextFrame` / `moveResizeFrame` 覆盖几何；M0-T 另增表对象命令 — until 扩展更多对象类型。
- DeepSeek 走 OpenAI 兼容适配器；M0-T 优先选用**支持 vision** 的中转/模型 — until 实调名单确定。
- API Key 仅存本机面板设置 — until 统一后端接管鉴权。
- 批处理遇非法命令 fail-closed 整批拒绝；执行中单条失败则停止后续 — until 用户要求改成尽力执行。
- M0-T 表替换：预检零写入（含选区漂移复检）；先框后表；删原对象仅 `removeObjects`；`merges` 忽略；主路径不用 `setHeaderFooterRowCount` — per audit 99_03/99_04。
- bounds 单位 pt；批内 `$created.frameId` / `$created.tableId` — per audit 99_04。
- 风格切换用 `styleProfile` / 提示词，不新增多 Agent 进程 — until 产品决策变更。
- 用户文档中已存在可点名的 Table Style — confirmed 2026-11-12。
- `rows` 含头/体/尾；`bodyRowCount = rows.length - header - footer`；`writeCellText.row` 0-based 对整表 — per audit 99_03/99_04。
- 技术栈：TypeScript strict + esbuild + 原生 UXP HTML/CSS（暂不 React/SWC）；Node≥18；ID host minVersion 19.0.0 — confirmed scaffolding 2026-11-12。

## To Verify

| Item | Evidence format | Gate owner |
| --- | --- | --- |
| UXP 选区导出位图的稳定 API（分辨率/色彩） | 导出 PNG 样张 | M0-T slice 1 |
| 中转站多模态（image+text）请求格式 | 成功 `TableDraft` | M0-T slice 2 |
| **ID 2024：文本框内建表 + 创建时头/尾行 + applyTableStyle** | 最小可运行脚本/手测 | M0-T slice 4/6（关闭 F8） |
| Undo 是否覆盖「建框+建表+删矢量」整批 | 手测 | M0-T T5–T6 |
| 选区漂移 2pt 阈值是否过严/过松 | 手测样本 | M0-T slice 4 |
| UXP 在 ID 2024 对自定 Base URL 出站 HTTPS 的权限与限制 | 实机请求成功/失败日志 | M0 / M0-T 共享 |
| Claude / Gemini 在 UXP 直连是否需特殊头或代理 | 实调 `ExecutionReport` | M0 slice 5 |
| 段/字符样式创建 API 在 2024 与最新 CC 行为差异 | 两侧手测记录 | M0 slice 6 |
