# indesign-ai-plugin

InDesign UXP 面板：**M0-T 可用版（0.2.0）** — 把画册里的矢量伪表识别并替换为真表（含表头/表尾行 + 已有表样式）。

## 马上使用

```bash
npm install
npm run build
```

1. 用 **UXP Developer Tool** 加载本仓库的 `dist/manifest.json`（InDesign 2024+ 需在运行）
2. 面板填写中转 Base URL / API Key / **识图** Model
3. 选中矢量表 → ①读取选区 → ②导出并识别 → 选表样式 → ③确认替换

完整步骤：[`docs/02_tasks/02_02_Usable_M0T_Runbook.md`](docs/02_tasks/02_02_Usable_M0T_Runbook.md)

## 技术栈

TypeScript + esbuild + 原生 UXP 面板。详见 [`docs/00_core/00_06_Tech_Stack.md`](docs/00_core/00_06_Tech_Stack.md)。

## 规划文档

[`docs/README.md`](docs/README.md)
