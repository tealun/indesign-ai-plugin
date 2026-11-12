# indesign-ai-plugin

InDesign UXP 面板：用可配置的大模型辅助书刊**内页选区**排版微调，并辅助创建/应用段落与字符样式。

## Status

规划已确认。当前优先 **M0-T**（矢量伪表→真表），见 [`docs/99_audits/99_02_m0t_planning_readiness.md`](docs/99_audits/99_02_m0t_planning_readiness.md)。基线 M0 见 [`docs/99_audits/99_01_planning_readiness.md`](docs/99_audits/99_01_planning_readiness.md)。

## Current priority (M0-T)

选中矢量伪表 → 导出选区图 → 视觉模型结构化 → 预览确认 → 真表 + 已有表样式 + 表头/表尾行 → 替换原对象。

## M0 baseline (parallel)

选区 → JSON → 直连 Claude / ChatGPT / Gemini / DeepSeek（含可配 URL 中转）→ 白名单指令落地（可 Undo）。

## Docs

从 [`docs/README.md`](docs/README.md) 进入。

## Non-goals (near term)

全书自动重排、统一后端、个人知识库顾问 —— 见路线图 [`docs/88_planning/88_01_Roadmap.md`](docs/88_planning/88_01_Roadmap.md)。
