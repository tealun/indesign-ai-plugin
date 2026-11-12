# 00_05 Setup Guide

> 实现阶段填充具体命令。当前仅锁定环境约束。

## Prerequisites

- Adobe InDesign **2024 或更高**
- 可加载 UXP 插件的开发者设置（具体开关以实现时 Adobe 文档为准）
- Node.js（用于面板工程脚手架 / 打包；版本在实现 M0 脚手架时锁定并回写此处）
- 至少一个可用的模型端点：
  - OpenAI 兼容中转（可配 Base URL + API Key），或
  - Claude / Gemini 可用凭证

## Local Secrets

- API Key 只存在面板本机设置，不进仓库。
- 仓库可提供 `.env.example` 仅当存在非 UXP 辅助脚本时；默认优先面板内配置。

## Smoke Checklist (M0)

1. 面板加载成功。
2. 选中文本框后能预览 snapshot JSON。
3. 配置错误 Key → 可见 `PROVIDER_AUTH`（或等价）错误。
4. 配置有效中转 → 成功应用至少一条白名单指令。
5. Undo 可撤销该次应用。
