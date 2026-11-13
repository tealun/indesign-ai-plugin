# Evolution Ledger

| ID | Trigger/Evidence | Root Cause | Local Fix | Systemic Action | Guard Verification | Closure Level | Next Planning Input |
|---|---|---|---|---|---|---|---|
| EV-2026-11-13-01 | User correction: agent claimed audit/fix without reading Tealun PDCA SKILL.md (AGENTS.md violated) | No hard gate forcing Read of /home/ubuntu/.cursor/skills/<role>/SKILL.md before audit or mutation; prior cycle improvised from old 99_* templates | This cycle: Read auditor/tasker/evolver SKILL.md first; wrote verification audit; persisted ledger | AGENTS.md hard PDCA invocation gate (must Read SKILL.md; no spirit-only execution) | 2026-11-13 read-back AGENTS.md contains 硬性调用门闩; session reply lists six skills | Institutionalized | Any new agent session on this repo must open with PDCA availability and skill Reads when triggered |
| EV-2026-11-13-02 | 99_07 F17 P0: sanitizeActionsForReplace after filterActionsForAgent re-injected replace_table for showTableTools agents | Host post-filter inject without agent-scoped gate; draft not cleared on agent switch | sanitize+auto-replace only m0t.table_recover; re-filter after sanitize; clear draft on leave recover (0.4.6) | contextGate.filterActionsByAllowlist + regression test drops replace_table for normalize allowlist (F17) | 2026-11-13 npm test contextGate F17 case pass; panel.ts activeAgentId===m0t.table_recover gate static proof | Institutionalized | Never add post-whitelist host injectors without re-applying allowedActions for the active agent |
| EV-2026-11-13-03 | 99_07 F1/F3/F4: compare doc + clipboard leaked across agents; SheetJS xlsx High CVE no npm fix | runtimeContext built without agent capability gates; dependency chosen without audit-gated review | contextGate inject/clipboard/live harvest; remove xlsx; OOXML via fflate; upload caps (0.4.7) | contextGate.ts + tests; npm audit 0; MAX_UPLOAD_BYTES enforced in extract+panel | 2026-11-13 npm run check 61+ tests; npm audit 0 vulns; no xlsx in package.json | Institutionalized | New upload/parsers: prefer zero High-CVE deps; gate every runtimeContext field by agent |
| EV-2026-11-13-04 | Stabilize M0.4 catalog agents (user: 稳固已实现 + 计划内扎实落地) | Sanitize logic lived only in panel; transport returned unfiltered actions; no ID smoke checklist for catalog acceptance | 0.4.8: sanitizeActions module + maySanitizeReplaceForAgent; directAgentTurn allowlist; catalog invariants tests; leave-compare clears upload; 02_03 smoke checklist | plugin/src/agent/sanitizeActions.ts + catalog.test.ts + docs/02_tasks/02_03_Agent_Catalog_Smoke.md | 2026-11-13 npm run check 71 pass; catalog invariants + F17 sanitize tests green | Institutionalized | Prefer ID smoke / M0-T To Verify before M1; GREP Style write may be pulled forward when product asks |
| EV-2026-11-13-05 | Continue develop: land planned M0 layout whitelist (user: 稳固已实现 + 计划内扎实落地) | M0 LayoutCommand types existed in protocol but indesignHost stubbed them; no panel path for analyze→preview→apply | 0.4.9: m0Layout host + selection style harvest; layoutAnalyzePrompt; agent m0.layout_assist chips; leave clears preview | plugin/src/host/m0Layout.ts + providers/layoutAnalyzePrompt.ts + catalog m0.layout_assist; docs 00_08/01_01/02_03/88_02 | 2026-11-13 npm run check 80 pass; m0Layout unit tests + catalog layout_assist invariants | Institutionalized | ID smoke 02_03 (incl. layout AC2–4); M0-T To Verify F8; GREP Style write when prioritized |

## 2026-11-13 — 安全/隔离审计 + 界面啰嗦（main）

- **Findings**: 切文档时 chat-log 串台；`documentPath` 进 localStorage；对话堆满步骤旁白。
- **Fix**: 切文档重建对话；不落盘/不外发 path；文案只保留结果与决策点（审计见 `99_06_security_isolation_ux_audit`）。
- **Guardrail**: UI 不说「系统正在准备什么」；多文档必须视觉隔离；文件系统路径不得进 memory/模型载荷。

## 2026-11-13 — 外发确认回显 URL/端口泄密（main）

- **Symptom**: 确认外发文案与识图进度把完整 Base URL / host 打进对话。
- **Root cause**: 隐私门闩实现时把「明示发往何处」误做成「回显 raw endpoint」。
- **Fix**: 对话只说「发往配置中的识图通道」；进度文案去掉 `baseUrl`。
- **Guardrail**: 面向用户的消息禁止输出 baseUrl/host/port；核对端点只走「配置」页。

## 2026-11-13 — 外发确认 chip 点了没反应（main）

- **Symptom**: 对话气泡里的「确认外发/取消」在 UXP 滚动区内点击不可靠。
- **Fix**: 外发门闩期间把确认/取消渲染到底部 chip 栏；Enter 在 `pendingEgress` 时放行。
- **Guardrail**: 选区图外发确认的主控件必须放在面板底部固定 chip 栏。
