# 00_07 AI Connection（通道）

## Goal

明确面板如何接到模型。当前只跑通 **自配模型（BYOK）**；插件内置默认模型预留，未开放。

## Modes

| Mode id | UI 名称 | 状态 | 行为 |
| --- | --- | --- | --- |
| `byok` | 自配模型 | **当前唯一可用** | 用户填写 Provider / Base URL / API Key / Model / Wire API；面板直连该端点（与现有用法相同） |
| `plugin_default` | 插件默认模型 | 类型预留；运行期强制 `byok` | 将来经厂商后端转发；Key 不进插件。配置页不提供该选项；`normalizeConnectionMode` 一律返回 `byok` |

设置字段：`ProviderSettings.connectionMode`（默认 / 实际恒为 `byok`）。

## Phase 1（本阶段）

1. 安装后到「配置」→「自配模型」（唯一选项）。
2. 按自己平时的中转填写 Base URL / API Key / 识图 Model；Codex `wire_api=responses` 时 Wire API 选 Responses。
3. 对话 / 伪表识别走同一套本地配置；无账号、无点数。
4. 识图外发前须点底部「确认外发」chip（或回复确认/取消）；同一会话对同一 Base URL 只确认一次。

验收：`resolveReadySettings()` 在完整 BYOK 下返回 `ok`；缺项给出中文原因并引导回配置页；`doRecognize` 在首次外发前阻塞于确认。

## Later（不做本期）

- 登录 / License
- 厂商默认模型代理与计费
- 自配与官方的套餐组合

相关实现：`plugin/src/settings/store.ts`、`docs/00_core/00_03_AI_Providers.md`。
