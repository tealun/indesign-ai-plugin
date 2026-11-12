# 00_03 AI Providers

## Goal

面板可配置接入主流模型与中转站；业务层不绑定单一厂商。

## Built-in Provider Types

| Type id | Covers | Protocol notes |
| --- | --- | --- |
| `openai_compatible` | ChatGPT 官方、多数中转站、DeepSeek 等 OpenAI 风格端点 | `baseUrl` + `apiKey` + `model`；Bearer 鉴权 |
| `anthropic` | Claude | Anthropic Messages API；可配 `baseUrl` 以支持兼容代理 |
| `google_gemini` | Gemini | Google generateContent（或兼容代理 URL） |
| `custom_openai_compatible` | 任意自建 / 聚合中转 | 与 `openai_compatible` 同协议；UI 上强调自定义 URL |

> DeepSeek **默认**走 `openai_compatible`，不单独发明第三套请求形状。若官方端点有差异，以适配器内分支处理并回写本文档。

## Settings Schema (local)

```json
{
  "provider": "openai_compatible",
  "baseUrl": "https://example-relay.example/v1",
  "apiKey": "<local-only>",
  "model": "gpt-4.1",
  "timeoutMs": 60000,
  "temperature": 0.2
}
```

Rules:

- `baseUrl` 与 `apiKey` **必须**可在面板配置；禁止写死进仓库。
- 保存时不把 Key 写入 git 跟踪文件。
- 错误信息中的 Key 必须脱敏（仅保留末 4 位或完全隐藏）。

## Adapter Contract

内部统一：

```ts
interface ProviderAdapter {
  id: string
  chat(request: ChatRequest, settings: ProviderSettings): Promise<ProviderRawResponse>
  parseLayoutCommands(raw: ProviderRawResponse): LayoutCommand[] // 或抛出 ProtocolError
}
```

`ChatRequest` 含：系统提示（风格参数 / 白名单说明）、`DocumentSnapshot`、用户意图（分析 / 应用）。

## M0 Provider Acceptance

必须同时满足：

1. 用户配置中转站 URL + Key，走 `openai_compatible` 完成一次选区应用。
2. 切换到 Claude **或** Gemini（原生或兼容代理）完成同路径至少一次成功调用。
3. 错误 Key / 错误 URL / 超时时面板展示分层错误，不改文档。

## Prompt / Style Switching

不使用多 Agent 进程。通过动态配置注入：

- `styleProfile`（留白、层级、正文字号范围等）
- 后期 `knowledgeRefs`（M3 知识库）

字段预留在协议文档；M0 可先用面板内简单文本「风格备注」。

## Changing Models

更新本文件 + 若响应解析字段变化则同步 [`00_04_JSON_Protocol.md`](00_04_JSON_Protocol.md)。
