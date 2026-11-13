# 99_06 Security / Isolation / UX Verbosity Audit

Date: 2026-11-13  
Scope: panel + settings/memory storage + providers transport + chat UX  
Branch: `cursor/fix-egress-confirm-chips-a3bd`

## Verdict

| Area | Status |
| --- | --- |
| Image egress gate | Pass（确认保留；端点不回显） |
| API Key in repo | Pass |
| Chat echo of Base URL | Pass（0.4.3） |
| Document chat UI isolation | **Fail → Fixed**（切换文档未重建 chat-log） |
| Filesystem path in memory / model payload | **Fail → Fixed**（不再持久化/外发 path） |
| Machine-local secret storage | Accept（UXP `localStorage` 明文；单机 BYOK） |
| `network.domains: all` | Accept for BYOK；托管上线须收紧 |
| UI verbosity | **Fail → Fixed**（步骤旁白过多） |

## Security findings

| ID | Sev | Status | Finding | Action |
| --- | --- | --- | --- | --- |
| S1 | P1 | Fixed earlier | 外发确认回显 baseUrl/host | 对话/错误不回显端点 |
| S2 | P1 | Fixed | 切文档时 chat-log 仍显示上一文档气泡（视觉串台） | `syncProjectScope` 清空并按当前 `history` 重建 |
| S3 | P2 | Fixed | `documentPath` 写入 localStorage，且可能进入 agent 请求 | 记忆与 agent 载荷不再带 path |
| S4 | P2 | Open | API Key 存 UXP `localStorage` 明文 | 文档化；托管改走后端；本机暂无 OS keychain API |
| S5 | P2 | Open | Gemini 适配器把 Key 放在 query（`?key=`） | 后续改为 header/或仅经后端；BYOK 实机再验 |
| S6 | P2 | Accept | `manifest.network.domains: all` | BYOK 任意中转必需；官方通道上线后按域名白名单 |
| S7 | P3 | Open | 选区图以 data URL 留在会话 DOM（预览） | 可接受；切文档已清；勿写入 memory |
| S8 | P3 | Open | `maskApiKey` 仍露末 4 位 | 配置页可保留；对话保存回执不再带 key 片段 |
| S9 | P3 | Open | 错误 `String(e)` 可能含供应商原文 | 保持截断；禁止拼 baseUrl（已做） |

## Isolation findings

| ID | Sev | Status | Finding | Action |
| --- | --- | --- | --- | --- |
| I1 | P1 | Fixed | 对话 UI 未按文档隔离 | 切文档重建 chat-log |
| I2 | P2 | Pass | `history` / project lessons 按 document key | 保持 |
| I3 | P2 | Note | `user` 级 lessons 跨文档共享（同机） | 有意；多账号托管时需 account 作用域 |
| I4 | P2 | Note | Provider 设置全局一份（同机所有文档） | BYOK 预期；托管后按账号 |
| I5 | P3 | Note | 面板重载后 chatByProject 丢失，memory 仍在 | 可接受；勿把图像写入 memory |
| I6 | P2 | Open | 尚无「登录用户」隔离 | 官方服务前必须：账号 token、服务端会话、禁止把他人文档经验混入 |

## UX verbosity（非必要提示）

原则：**只说结果与下一步选择；不说系统在后台做了什么准备。**

已收敛示例：

- 去掉「① 正在导出 / ② 正在调用模型 / ③ 正在写入」旁白堆叠  
- 去掉「正在结合上下文理解」「执行：a→b」「已沉淀 N 条经验」「任务 id」  
- 去掉切文档「经验与对话隔离」说明  
- 外发确认缩为短句；配置页 lede 缩短  
- 保存配置不再朗读整份 settings

保留：错误、预检失败、需用户决策（确认外发 / 选表样式 / 完成结果）。

## Residual risks (before hosted service)

1. 单机多操作系统用户共用同一 InDesign 配置档时，共享 BYOK Key 与 memory。  
2. `domains: all` + 用户可贴任意 Base URL → 恶意中转可收图；靠外发确认与用户自配信任。  
3. 无服务端审计日志；投诉取证依赖本机。

## Sign-off

- Auditor: agent pass for current BYOK scope after fixes in this change set.  
- Re-audit required before enabling `plugin_default` / 账号体系。
