# 00_05 Setup Guide

> 实现阶段填充具体命令。当前仅锁定环境约束。

## Prerequisites

- Adobe InDesign **2024 或更高**
- 可加载 UXP 插件的开发者设置（具体开关以实现时 Adobe 文档为准）
- Node.js **≥ 18**（脚手架已用 22 验证）
- 至少一个可用的模型端点：
  - OpenAI 兼容中转（可配 Base URL + API Key），或
  - Claude / Gemini 可用凭证
- M0-T 另需：**支持 vision** 的模型/中转
- Adobe **UXP Developer Tool**（加载 `dist/`）

## Install & build

```bash
npm install
npm run check    # typecheck + test + build
```

产物在 `dist/`：`manifest.json`、`index.html`、`styles.css`、`main.js`。  
UDT：Add Plugin → 选择 `dist/manifest.json` → Load。

技术栈细节见 [`00_06_Tech_Stack.md`](00_06_Tech_Stack.md)。

## Local Secrets

- API Key 只存在面板本机设置（`localStorage`），不进仓库。
- 仓库可提供 `.env.example` 仅当存在非 UXP 辅助脚本时；默认优先面板内配置。

## Smoke Checklist (M0)

1. 面板加载成功。
2. 选中文本框后能预览 snapshot JSON。
3. 配置错误 Key → 可见 `PROVIDER_AUTH`（或等价）错误。
4. 配置有效中转 → 成功应用至少一条白名单指令。
5. Undo 可撤销该次应用。

## Smoke Checklist (M0-T) — v0.2 可用版

1. `npm run build` 后用 UDT 加载 `dist/`，InDesign 2024+ 打开目标画册。
2. 面板填写中转 **Base URL / API Key / 识图 Model** 并保存。
3. 选中矢量伪表 → **① 读取选区** → **② 导出并识别**（底部 chip「确认外发」或说确认；可「取消」；同会话同一 Base URL 只确认一次）→ 核对 TSV / 表头表尾行 → 选择已有表样式 → **③ 确认替换**。
4. 结果：原位置出现真表（含头/尾行），样式已套用，原矢量删除；可用 Undo。
5. 故意选错样式名或不选样式 → 预检失败且文档无写入。
6. 识别不准时可「粘贴/选择补图」后再识别。
