# Evolution Ledger

| ID | Trigger/Evidence | Root Cause | Local Fix | Systemic Action | Guard Verification | Closure Level | Next Planning Input |
|---|---|---|---|---|---|---|---|
| EV-2026-11-13-01 | User correction: agent claimed audit/fix without reading Tealun PDCA SKILL.md (AGENTS.md violated) | No hard gate forcing Read of /home/ubuntu/.cursor/skills/<role>/SKILL.md before audit or mutation; prior cycle improvised from old 99_* templates | This cycle: Read auditor/tasker/evolver SKILL.md first; wrote verification audit; persisted ledger | AGENTS.md hard PDCA invocation gate (must Read SKILL.md; no spirit-only execution) | 2026-11-13 read-back AGENTS.md contains 硬性调用门闩; session reply lists six skills | Institutionalized | Any new agent session on this repo must open with PDCA availability and skill Reads when triggered |
| EV-2026-11-13-02 | 99_07 F17 P0: sanitizeActionsForReplace after filterActionsForAgent re-injected replace_table for showTableTools agents | Host post-filter inject without agent-scoped gate; draft not cleared on agent switch | sanitize+auto-replace only m0t.table_recover; re-filter after sanitize; clear draft on leave recover (0.4.6) | contextGate.filterActionsByAllowlist + regression test drops replace_table for normalize allowlist (F17) | 2026-11-13 npm test contextGate F17 case pass; panel.ts activeAgentId===m0t.table_recover gate static proof | Institutionalized | Never add post-whitelist host injectors without re-applying allowedActions for the active agent |
| EV-2026-11-13-03 | 99_07 F1/F3/F4: compare doc + clipboard leaked across agents; SheetJS xlsx High CVE no npm fix | runtimeContext built without agent capability gates; dependency chosen without audit-gated review | contextGate inject/clipboard/live harvest; remove xlsx; OOXML via fflate; upload caps (0.4.7) | contextGate.ts + tests; npm audit 0; MAX_UPLOAD_BYTES enforced in extract+panel | 2026-11-13 npm run check 61+ tests; npm audit 0 vulns; no xlsx in package.json | Institutionalized | New upload/parsers: prefer zero High-CVE deps; gate every runtimeContext field by agent |
| EV-2026-11-13-04 | Stabilize M0.4 catalog agents (user: 稳固已实现 + 计划内扎实落地) | Sanitize logic lived only in panel; transport returned unfiltered actions; no ID smoke checklist for catalog acceptance | 0.4.8: sanitizeActions module + maySanitizeReplaceForAgent; directAgentTurn allowlist; catalog invariants tests; leave-compare clears upload; 02_03 smoke checklist | plugin/src/agent/sanitizeActions.ts + catalog.test.ts + docs/02_tasks/02_03_Agent_Catalog_Smoke.md | 2026-11-13 npm run check 71 pass; catalog invariants + F17 sanitize tests green | Institutionalized | Prefer ID smoke / M0-T To Verify before M1; GREP Style write may be pulled forward when product asks |
| EV-2026-11-13-05 | Continue develop: land planned M0 layout whitelist (user: 稳固已实现 + 计划内扎实落地) | M0 LayoutCommand types existed in protocol but indesignHost stubbed them; no panel path for analyze→preview→apply | 0.4.9: m0Layout host + selection style harvest; layoutAnalyzePrompt; agent m0.layout_assist chips; leave clears preview | plugin/src/host/m0Layout.ts + providers/layoutAnalyzePrompt.ts + catalog m0.layout_assist; docs 00_08/01_01/02_03/88_02 | 2026-11-13 npm run check 80 pass; m0Layout unit tests + catalog layout_assist invariants | Institutionalized | ID smoke 02_03 (incl. layout AC2–4); M0-T To Verify F8; GREP Style write when prioritized |
| EV-2026-11-13-06 | User: GREP 进样式是体系一部分，直接插队做 | GREP Style write deferred to M2 while propose_grep already shipped; product treats Find/Change + Nested GREP Style as one workflow | 0.4.10: apply_grep_style + grepStyle host; propose chip「写入段落样式」; utterance 写入「段」用「字」; merge main privacy | plugin/src/host/grepStyle.ts; AgentAction apply_grep_style; docs pull-forward from M2 | 2026-11-13 npm run check 88 pass; grepStyle add/update/fail-closed tests | Institutionalized | ID smoke 02_03 GREP Style on real styles; then M0-T To Verify or M1 eval |
| EV-2026-11-13-07 | User: 确定的就推送到 main；界面看不到其他 Agent | Confirmed catalog work stayed on feature PR while user loads main (policy 合入约定 ignored) | 0.4.13: merge main 0.4.12 into catalog branch; push confirmed agents to main | Standing decision in 88_02 already; this landing enforces it | 2026-11-13 npm run check 101 pass; catalog lists 6 specialized on main-bound tip | Institutionalized | After push, reload dist from main; ID smoke 02_03 |

## 2026-11-13 — 落实 Agent/工具提示词分层（88_03）

- **Change**: `promptGuards` 写入伪表 Agent；宿主 `assessHeaderLanguage` 提示可能丢中文；runtimeContext 带 `draftQualityHint`。
- **Guardrail**: 决策层不塞 OCR 长文；质量告警只建议补图/重识别，不阻断 replace；附录变更要涨 `PROMPT_GUARDS_VERSION` 并过关键词测试。

## 2026-11-13 — 识图表头丢掉中文

- **Symptom**: 选区图表头有「货号 / Code NO.」等中英叠字，识别预览与真表只剩英文。
- **Root cause**: 丢字发生在模型 `TableDraft`（预览已无中文），不是写单元格/`normalizeCellText`；中英叠字表头 vision 模型常「简化」成英文，且原提示示例全英文、约束过弱。
- **Fix**: 统一 `recoverPrompt`（双语示例 + VERBATIM/CJK 规则）；识图 temperature 钳到 ≤0.1；Anthropic/Gemini 的 recover 也走同一提示。
- **Guardrail**: 识图提示必须含中英叠字示例与「禁止只留英文」；验收对照选区图 header 是否含 CJK。

## 2026-11-13 — Thinking 三点不动 +「识别中」重复 + UI 过方

- **Symptom**: 忙碌态三点不跳动；已有「识别中…」仍叠一层三点；气泡方正，远逊官方 AI 助手。
- **Root cause**: InDesign UXP 忽略 CSS `@keyframes`；`setBusy` 的 thinking 与文案状态并存；圆角仅 4px 且每条带「顾问/你」标签。
- **Fix**: `setInterval` 驱动三点透明度；去掉「识别中…/写入中…」；对齐 Adobe AI Assistant（圆角气泡、去角色标签、淡边框）。
- **Guardrail**: UXP 动效不要依赖 `@keyframes`；busy 指示与文字进度二选一；圆角用 12–18px，勿用 `999px` pill（UXP 会坏）。

## 2026-11-13 — 原位替换：框过大且仍需双击才见表；单元格软换行撑破

- **Symptom**: 框被加得很宽很长仍看不见表，需双击边框节点；单元格内软换行把格子撑满。
- **Root cause**: 按列数强制加宽 + `syncFrameToTable` 跟表宽走；OCR 软换行原样写入。
- **Fix**: 选区宽度原位锁定；`fitTableToFrame` 让表宽/列宽贴合框；高度仅必要时向下增；`normalizeCellText` 将软换行转为硬回车 `\r`（非空格）。
- **Guardrail**: 替换以选区 footprint 为准（定宽），表适配框，而不是框去追表；单元格换行用硬回车保留多行语义。

## 2026-11-13 — bodyRowCount must be >= 1

- **Symptom**: 小表（表头+1 行数据）识别报 `bodyRowCount must be >= 1`。
- **Root cause**: 模型常把 `headerRowCount` 标成整表行数（如 2 行表标 header=2）。
- **Fix**: `normalizeHeaderFooterCounts` 在校验前钳制，保证至少 1 行正文；提示词强调 2 行表只能 header=1。
- **Guardrail**: 不得因 header/footer 误标直接失败；仅当 `rows.length < 2` 才拒绝。

## 2026-11-13 — 多对象未编组导出失败 + 无进行中反馈

- **Symptom**: 选中大量未编组 graphic 时选区图错误/空白；点发送或确认后聊天无即时反馈，只能干等结果。
- **Root cause**: `exportFile` 只导出 `targets[0]`；忙碌态没有聊天气泡级指示。
- **Fix**: 多对象先 duplicate→group→export→删除副本；`setBusy` 显示跳动三点 thinking；选区摘要改为「N 个对象」。
- **Guardrail**: 多选导出不得只取第一个 pageItem；任何 busy 且非外发等待都应有 thinking 指示。

## 2026-11-13 — 真表写完框内空白，双击右侧中点才显现

- **Symptom**: 面板显示完成，文本框看似空；双击右侧中间手柄（Fit frame to content）后内容出现。
- **Root cause**: `442ef9e` 为「锁定选区宽」去掉了按列加宽与 `fitFrameToTable`；伪表选区常约 86×16pt，多列表被挤在过窄框内，视觉上像空框。
- **Fix**: `expandBoundsForTable` 恢复按列最小宽（42pt）与行高扩展；样式应用后 `syncFrameToTable` 以左上角为锚、只增不减。
- **Guardrail**: 定位保左上角；可见性优先于「宽高与选区完全一致」。

## 2026-11-13 — 安全/隔离审计 + 界面啰嗦

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
