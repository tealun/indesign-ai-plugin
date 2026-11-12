# 00_03 AI Providers

## Goal

面板可配置接入主流模型与中转站；业务层不绑定单一厂商。

**连接方式（本期）**：只跑通 **自配模型（BYOK）**——用户自填 Base URL / API Key / Model，与日常中转配置相同。插件默认模型通道预留，见 [`00_07_AI_Connection.md`](00_07_AI_Connection.md)。

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
  "connectionMode": "byok",
  "provider": "openai_compatible",
  "baseUrl": "https://example-relay.example/v1",
  "apiKey": "<local-only>",
  "model": "gpt-4.1",
  "timeoutMs": 60000,
  "temperature": 0.2,
  "wireApi": "chat_completions"
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
  supportsVision: boolean
  chat(request: ChatRequest, settings: ProviderSettings): Promise<ProviderRawResponse>
  parseLayoutCommands(raw: ProviderRawResponse): LayoutCommand[] // M0；或抛出 ProtocolError
  parseTableDraft(raw: ProviderRawResponse): TableDraft // M0-T；或抛出 ProtocolError
}
```

`ChatRequest` 含：系统提示（风格参数 / 白名单说明）、`DocumentSnapshot`、可选图像部件、用户意图（分析 / 应用 / recover_table）。

`supportsVision === false` 时不得用于 `recover_table`。

## M0 Provider Acceptance

必须同时满足：

1. 用户配置中转站 URL + Key，走 `openai_compatible` 完成一次选区应用。
2. 切换到 Claude **或** Gemini（原生或兼容代理）完成同路径至少一次成功调用。
3. 错误 Key / 错误 URL / 超时时面板展示分层错误，不改文档。

## M0-T Vision Requirement

`recover_table` 必须走**支持图像输入**的模型/中转。适配器需能把选区 PNG（及可选用户粘贴补图）与提示词一并发送，并解析 `TableDraft`。

若某供应商无 vision，UI 在该模式下禁用或提示换模型；不得静默降级为无图请求。

## Capture limits (image size)

导出/粘贴图在发送前必须规范化：

| Rule | Default |
| --- | --- |
| 最长边 | ≤ 2048 px（超出则等比缩放） |
| 导出 PPI 目标 | 144 PPI（相对文档 pt bounds） |
| 编码 | PNG；若体积仍过大可降到 JPEG quality≤80（记录 warning） |
| 超限无法缩小时 | `VALIDATION_ERROR`，不发请求 |

缩放或格式降级必须写入 `warnings`（可见于面板），对应验收 T11。

## Privacy (image egress)

选区图与粘贴补图属于客户画册内容，可能含商业数据：

1. 发起 `recover_table` 前，面板必须明示：**图像将发送到当前 `baseUrl` 所指向的服务**；提供确认 / 取消。
2. 默认不在日志中持久化原图或完整 data URL；排障若需留样须另开显式开关且默认关闭。
3. API Key 与图像均不得写入仓库跟踪文件。
4. 设置中可关闭「允许粘贴补图外发」（仍可用自动选区图，或完全取消识别）。

## Prompt / Style Switching

不使用多 Agent 进程。通过动态配置注入：

- `styleProfile`（留白、层级、正文字号范围等）
- 后期 `knowledgeRefs`（M3 知识库）

字段预留在协议文档；M0 可先用面板内简单文本「风格备注」。

## Changing Models

更新本文件 + 若响应解析字段变化则同步 [`00_04_JSON_Protocol.md`](00_04_JSON_Protocol.md)。
