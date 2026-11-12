# indesign-ai-plugin

InDesign UXP 面板：用可配置的大模型辅助书刊**内页选区**排版微调，并优先交付 **M0-T**（矢量伪表 → 真表）。

## Status

框架与技术栈已落地（TypeScript + esbuild + UXP panel）。宿主选区/截图桥接仍为 stub，下一步 M0-T slice 1。

规划入口：[`docs/README.md`](docs/README.md) · 技术栈：[`docs/00_core/00_06_Tech_Stack.md`](docs/00_core/00_06_Tech_Stack.md)

## Quick start

```bash
npm install
npm run check
```

用 Adobe UXP Developer Tool 加载仓库根目录下的 `dist/`（需先 `npm run build`）。

## Current priority (M0-T)

选中矢量伪表 → 导出选区图 → 视觉模型结构化 → 预览确认 → 真表 + 已有表样式 + 表头/表尾行 → 替换原对象。

## Non-goals (near term)

全书自动重排、统一后端、个人知识库顾问 —— 见 [`docs/88_planning/88_01_Roadmap.md`](docs/88_planning/88_01_Roadmap.md)。
