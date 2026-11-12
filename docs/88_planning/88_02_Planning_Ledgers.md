# 88_02 Planning Ledgers

Updated: 2026-11-12 after user confirmation of M0 contract.

## Decisions

- 主场景：书籍/杂志内页排版；样式与对象辅助创建及应用为最紧急价值。
- M0 可演示结果：选区微调（原选项 C）+ 段/字符样式创建与套用。
- 宿主：InDesign；兼容基线 **2024+**；主测可用最新 CC。
- UI：UXP 常驻面板；主控 + 分步/折叠配置。
- 通信：M0 面板直连 API；后期统一后端；布局指令 JSON 协议稳定。
- 供应商：必须可配 Base URL / API Key / Model；内置 OpenAI 兼容（含中转、DeepSeek）、Claude、Gemini。
- M0 命令白名单已锁定（见 `00_04`）。
- 非目标：全书重排、M0 知识库、M0 印前全局校对、单风格独立 Agent。
- 产品重心：版式评估与优化（评估主能力放 M1，M0 先安全执行闭环）。

## Assumptions

- 「对象」M0 以文本框为主；`createTextFrame` / `moveResizeFrame` 覆盖几何；复杂图形对象后置 — until M2 kickoff。
- DeepSeek 走 OpenAI 兼容适配器 — until 实调证明需要独立分支。
- API Key 仅存本机面板设置 — until 统一后端接管鉴权。
- 批处理遇非法命令 fail-closed 整批拒绝；执行中单条失败则停止后续 — until 用户要求改成尽力执行。
- 风格切换用 `styleProfile` / 提示词，不新增多 Agent 进程 — until 产品决策变更。

## To Verify

| Item | Evidence format | Gate owner |
| --- | --- | --- |
| UXP 在 ID 2024 对自定 Base URL 出站 HTTPS 的权限与限制 | 实机请求成功/失败日志 | M0 slice 4 |
| Claude / Gemini 在 UXP 直连是否需特殊头或代理 | 实调 `ExecutionReport` | M0 slice 5 |
| 样式创建 API 在 2024 与最新 CC 行为差异 | 两侧手测记录 | M0 slice 6 |
| Undo 是否覆盖整批白名单操作 | 手测步骤结果 | M0 AC2–AC4 |
| 中转站是否强制 OpenAI `/v1/chat/completions` 路径 | 用户中转文档或一次成功响应 | M0 slice 4 |
