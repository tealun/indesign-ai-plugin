# 00_05 Setup Guide

> 实现阶段填充具体命令。当前仅锁定环境约束。

## Prerequisites

- Adobe InDesign **2024 或更高**
- 可加载 UXP 插件的开发者设置（具体开关以实现时 Adobe 文档为准）
- Node.js（用于面板工程脚手架 / 打包；版本在实现脚手架时锁定并回写此处）
- 至少一个可用的模型端点：
  - OpenAI 兼容中转（可配 Base URL + API Key），或
  - Claude / Gemini 可用凭证
- M0-T 另需：**支持 vision** 的模型/中转

## Local Secrets

- API Key 只存在面板本机设置，不进仓库。
- 仓库可提供 `.env.example` 仅当存在非 UXP 辅助脚本时；默认优先面板内配置。

## Smoke Checklist (M0)

1. 面板加载成功。
2. 选中文本框后能预览 snapshot JSON。
3. 配置错误 Key → 可见 `PROVIDER_AUTH`（或等价）错误。
4. 配置有效中转 → 成功应用至少一条白名单指令。
5. Undo 可撤销该次应用。

## Smoke Checklist (M0-T)

1. 选中矢量组 → 面板显示选区缩略图（T1）。
2. 外发明示可取消（T9）；取消后无网络请求、无文档变更。
3. 故意选择不存在的表样式 → 预检失败，零写入（T7）。
4. 识别后预览可编辑；确认替换 → 新文本框内真表 + 已有表样式 + 头/尾行；原矢量删除（T3–T6、T10）。
5. 中途制造失败（如写格后中断）→ 不执行 `removeObjects`；Undo 可清理残留新框/表。
6. 超大选区图被缩放并出现 warning，或明确失败（T11）。
