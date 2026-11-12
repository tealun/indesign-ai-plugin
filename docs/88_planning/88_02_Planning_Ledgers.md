# 88_02 Planning Ledgers

Updated: 2026-11-12 after user confirmation of M0-T urgent spike.

## Decisions

- 主场景：书籍/杂志内页排版；样式与对象辅助创建及应用为最紧急价值。
- **紧急优先尖兵 M0-T**：画册矢量曲线伪表 → 真表；套用文档**已有** Table Style；含表头行与表尾行。
- M0-T 交互：选中矢量组 + 自动导出选区图给视觉模型；预览确认后替换；识别不准可粘贴补图。
- M0 可演示结果（基线）：选区微调（原选项 C）+ 段/字符样式创建与套用；排期上让位于 M0-T 共享脚手架之后。
- 宿主：InDesign；兼容基线 **2024+**；主测可用最新 CC。
- UI：UXP 常驻面板；主控 + 分步/折叠配置。
- 通信：M0 面板直连 API；后期统一后端；布局指令 JSON 协议稳定。
- 供应商：必须可配 Base URL / API Key / Model；内置 OpenAI 兼容（含中转、DeepSeek）、Claude、Gemini。
- M0 命令白名单已锁定（见 `00_04`）。
- 非目标：全书重排、M0 知识库、M0 印前全局校对、单风格独立 Agent。
- 产品重心：版式评估与优化（评估主能力放 M1，M0 先安全执行闭环）。

## Assumptions

- 「对象」M0 以文本框为主；`createTextFrame` / `moveResizeFrame` 覆盖几何；M0-T 另增表对象命令 — until 扩展更多对象类型。
- DeepSeek 走 OpenAI 兼容适配器；M0-T 优先选用**支持 vision** 的中转/模型 — until 实调名单确定。
- API Key 仅存本机面板设置 — until 统一后端接管鉴权。
- 批处理遇非法命令 fail-closed 整批拒绝；执行中单条失败则停止后续 — until 用户要求改成尽力执行。
- 风格切换用 `styleProfile` / 提示词，不新增多 Agent 进程 — until 产品决策变更。
- 用户文档中已存在可点名的 Table Style — confirmed 2026-11-12。

## To Verify

| Item | Evidence format | Gate owner |
| --- | --- | --- |
| UXP 选区导出位图的稳定 API（分辨率/色彩） | 导出 PNG 样张 | M0-T slice 1 |
| 中转站多模态（image+text）请求格式 | 成功 `TableDraft` | M0-T slice 2 |
| InDesign 表头/表尾行 + `applyTableStyle` 在 2024 行为 | 手测记录 | M0-T slice 4 |
| Undo 是否覆盖「建表+删矢量」整批 | 手测 | M0-T T5–T6 |
| UXP 在 ID 2024 对自定 Base URL 出站 HTTPS 的权限与限制 | 实机请求成功/失败日志 | M0 / M0-T 共享 |
| Claude / Gemini 在 UXP 直连是否需特殊头或代理 | 实调 `ExecutionReport` | M0 slice 5 |
| 段/字符样式创建 API 在 2024 与最新 CC 行为差异 | 两侧手测记录 | M0 slice 6 |
