# 99_05 BYOK Connection Audit

Date: 2026-11-12（Asia/Shanghai）  
Baseline: `cursor/byok-model-first-969f` @ `a9bf66e`  
Prior anchor: `99_04_deep_planning_audit.md`（规划/协议；本报告改审实现变更窗）  
Depth: **standard**（密钥与网络路径；非全仓 deep）  
Scope: `origin/main...HEAD` BYOK 落地（settings / panel 配置 / docs 00_07）+ 其启用的识图外发临界路径  
Worktree: clean  
Evidence limits: 无 InDesign 实机；无真实中转联调；静态 + `npm run check`

## Verdict

- P0: **0** | P1: **1** | P2: **3** → **F1–F4 Fixed**（2026-11-12 修复轮，见下表 Status）
- Main risk（修复前）: 识图外发缺少明示确认/取消。修复后：对话内确认外发 + `plugin_default` 强制 byok。

## Critical Paths

### BYOK 配置 → resolve → 直连模型
- Goal: 仅完整自配可调用；插件默认不可用
- Trace: `panel` 配置表单 → `saveSettings` / `resolveReadySettings` → `directAgentTurn` / `directRecoverTable` → `providers/*`
- Controls: `connectionMode` 默认 `byok`；`plugin_default` 被 `resolveReadySettings` 拦截；缺 URL/Key/Model 拦截；UI Key 脱敏展示
- Findings: F2, F3
- Health: **Healthy**（通道门闩）

### recover_table 图像外发
- Goal: 选区/补图发往用户 `baseUrl` 前须明示确认
- Trace: `doRecognize` → `exportSelectionPng` / 补图 → `directRecoverTable` → `fetch(baseUrl+path)` + Bearer
- Controls: 发送前聊天确认外发（**不回显** `baseUrl`/host/端口；端点仅「配置」页可见）；manifest `network.domains: all`（BYOK 必要）
- Findings: F1（Fixed）
- Health: **Healthy**（修复后：确认外发门闩）

## Confirmed Strengths

- Key 仅 `localStorage`，保存/错误展示走 `maskApiKey`；仓库无真实 Key
- `resolveReadySettings` 单点门闩，对话与识图共用
- `plugin_default` 预留但不产生假成功调用
- 单测覆盖 mode 归一化与就绪判定；`npm run check` 38 tests pass + build ok

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Path / Dimension | Evidence | Remediation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | P1 | Confirmed / High | Fixed | 识图外发无确认/取消，违反隐私门禁 | Security / UX | 修复：`ensureImageEgressAllowed` + 对话 chips「确认外发/取消」；同会话同 baseUrl 只确认一次；取消则不调用模型 | 已落地 |
| F2 | P2 | Confirmed / High | Fixed | `normalizeConnectionMode` 注释与行为不符 | Coding standards | 修复：一律 coerce 为 `byok`，注释同步 | 已落地 |
| F3 | P2 | Confirmed / Medium | Fixed | UI 可选「插件默认」并保存，随后所有调用失败 | UX | 修复：配置页仅保留「自配模型」选项；保存强制 byok | 已落地 |
| F4 | P2 | Confirmed / High | Fixed | Setup 仍写「确认外发提示」，与实现漂移 | Docs / Deploy readiness | 修复：`00_05` 写明对话确认外发；与 F1 实现对齐 | 已落地 |

## Verification Gaps

- InDesign 实机：自配中转识图 + Wire Responses 端到端
- UXP `localStorage` 跨文档/卸载是否残留 Key（预期本机持久，需产品说明）
- `network.domains: all` 在目标 ID/UXP 版本的实际约束（BYOK 需要，但属宽权限 Exposure，非本 diff 引入）

## Rejected / Downgraded

- 「Gemini 把 Key 放进 query」→ 官方 API 形态；非本 diff 回归；保留为已知供应商差异，非新缺陷
- 「`domains: all` = P0」→ BYOK 任意中转所需；降为验证缺口/运营注意，非本变更缺陷

## Coverage

1. Architecture: Pass — `connectionMode` 与 Transport 直连边界清晰  
2. Platform integration: Pass — OpenAI-compat / wire 路径未改坏  
3. Security: Pass（修复后 — 外发确认）  
4. Code efficiency: Pass  
5. Runtime smoothness: Pass（门闩失败有中文引导）  
6. Information isolation: N/A — 单机面板，无多租户  
7. Data accuracy: Pass — settings 归一化合理  
8. Parameter passing: Pass — BYOK 字段边界清楚  
9. User experience: Pass（修复后 — 仅自配选项）  
10. Coding standards: Pass（修复后）  
11. Testing: Pass for settings unit；外发确认为面板交互（手工冒烟）  
12. Deploy & ops: Pass（`00_05` 已对齐）；无账号后端（符合本期范围）

## Evidence Log

- Accepted F1: 静态通读 `doRecognize` + 全文无外发确认控件 + 规范三处要求确认  
- Accepted F2/F3: `store.ts` / `panel.ts` 配置表单对照  
- Accepted F4: `00_05` vs 实现  
- Checks: `npm run check` → typecheck + 38 pass + `build ok → dist/`（2026-11-12 23:36 CST）

## Recommendation

合并 BYOK 通道前，**至少处理 F1（或显式 defer 并改 `00_03`/`00_05`/`AGENTS.md`）**；F2–F3 可同 PR 小修。未要求「修复」前本审计只读，不改产品代码。
