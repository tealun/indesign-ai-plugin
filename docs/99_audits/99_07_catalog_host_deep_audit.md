# 99_07 Catalog & Host Deep Audit（顾问 / 专属 Agent / 宿主加深 / 比对上传）

Date: 2026-11-13（Asia/Shanghai）  
Baseline: `cursor/advisor-skills-969f` @ `fe266db`（相对 `origin/main` @ `6c39df3`）  
Prior anchors: `99_05_byok_connection_audit.md` · `99_06_advisor_skills_audit.md`  
Depth: **deep**（实现 + 安全/隐私边界 + 上下文注入 + 文档一致性；含依赖供应链）  
Scope: Agent 目录扩展、Skill 挂载、宿主抽字/剪贴板/贴表、文稿比对上传（0.4.4–0.4.5）  
Worktree: clean at audit start  
Evidence limits: 无 InDesign 实机；无真实客户稿联调；静态通读 + `npm run check`（51 pass）+ `npm audit`

## Verdict

- P0: **0** | P1: **7** | P2: **6**（F11 Fixed 于同日索引提交）→ **Open（本报告不自动改码；待执行轮）**
- Main risks:（1）上传对照稿 / 隐式选区与剪贴板被注入**过宽** Agent 回合；（2）`xlsx` 社区包已知 High 且无 npm 修复；（3）上传无字节上限 + 解析竞态；（4）**编组选区**抽字为空导致比对/校对盲区。
- 白名单改文档边界整体 **Healthy**（default 仅 `open_config`；`filterActionsForAgent` 宿主兜底）。
- 补充证据：并行深挖 [Audit compare upload host](bc-f42801b4-1414-5461-adef-6566b795c319)（与主审交叉验证 F1/F2/F4，并新增 F13–F16）。

## Critical Paths

### A. 默认顾问 → Skill → recommendAgentId 交接
- Goal: 专家方法 + 正确转交；不直接改文档
- Trace: `panel` → `directAgentTurn` → `buildAgentSystemPrompt` + `skillsPromptBlock` → `parseAgentDecision` → `filterActionsForAgent` → handoff chip
- Controls: `allowedActions: ["open_config"]`；Skill `agents` 过滤；handoff 要求 `specialized`
- Findings: F6, F9, F12
- Health: **Healthy**（动作）；**At risk**（上下文过宽，见 Path C）

### B. 专属 Agent 白名单动作
- Goal: 仅发射本场景动作；贴表/GREP/伪表互不越权
- Trace: `catalog.allowedActions` → `filterActionsForAgent` → `executeAgentActions`
- Controls: 集合过滤 + 系统提示任务目录；`sanitizeActionsForReplace`（伪表）
- Findings: F12（缺单测）
- Health: **Healthy**

### C. 文稿比对：上传 → 解析 → runtimeContext → 模型
- Goal: 对照稿与版面差异报告；不写回
- Trace: `compareFileInput` → `extractDocumentText` → `compareDoc` → `buildAgentContext.compareDocument*` → `buildAgentUserPayload` → BYOK
- Controls: 文本截断 `MAX_CHARS=80_000`；UI 限比对场景显示上传；`addMessage`/`textContent` 防 XSS
- Findings: F1, F2, F3, F5, F7, F10
- Health: **At risk**

### D. 选区/剪贴板隐式采集
- Goal: 比对/校对无需强制 lock 也能读字
- Trace: `buildAgentContext` live `readSelectionSnapshot`；`readClipboardText`（compare + **default**）
- Findings: F1, F4, F8
- Health: **At risk**（隐私/成本）

### E. 贴表规范化宿主
- Goal: 真表套样式
- Trace: `apply_table_style` → `applyTableStyleToSelection`（Table / Cell 上溯 / nested）
- Health: **Healthy**（逻辑完备；实机未验）

## Confirmed Strengths

- Agent 列表 + 场景栏 + 退出默认；专属/默认动作白名单分离清晰
- Skill 与 Lesson 分层（`00_09`）已实现并有 `skillsForAgent` 单测
- `propose_grep` 保留空白 `changeTo`；面板一键复制
- 选区抽字覆盖框/表/单元格；贴表 Cell→Table
- 比对上传 UX（状态字数、清除、开始比对）完整
- 文件名走 `textContent`，`el()` 子节点为 TextNode，上传路径未见 HTML XSS
- `npm run check`：typecheck + **51** tests + build ok；bundle ≈ 875KB

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Path / Dimension | Evidence | Remediation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | P1 | Confirmed / High | Open | `compareDocumentText` 在**任意** Agent 回合注入；换场景后稿件仍外发 | Privacy / Efficiency | `panel.ts` `buildAgentContext` 无条件带 `compareDoc`；仅 UI 隐藏上传行 | 仅 `m0.copy_compare`（或显式 opt-in）注入；切走场景可提示保留/清除 |
| F2 | P1 | Confirmed / High | Open | 上传无**字节**上限；`unzipSync`/`XLSX.read` 可致面板卡死（zip/xls 炸弹） | Security / Runtime | `extractDocumentText` 仅事后 `MAX_CHARS`；`panel` `file.arrayBuffer()` 无预检 | 例如 ≤5–8MB 拒收；解压条目数/未压缩上限；解析超时 |
| F3 | P1 | Confirmed / High | Open | 依赖 `xlsx@0.18.5`：Prototype Pollution + ReDoS，**npm 无 fix**（audit High） | Security | `npm audit` GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9；`package.json` dependencies | 自研 OOXML xlsx（fflate）为主路径；`.xls` 引导另存 xlsx；或换无漏洞实现并钉版本 |
| F4 | P1 | Confirmed / High | Open | **默认顾问**每回合 `readClipboardText`（至 20k）并入 context | Privacy / UX | `buildAgentContext`：`activeAgentId === DEFAULT_AGENT_ID` | 默认不读剪贴板；仅比对 Agent，或用户说「用剪贴板」再读 |
| F5 | P2 | Confirmed / High | Open | 对照稿/选区文本直发 BYOK，无类似识图的明示确认 | Privacy / UX | 识图有 `ensureImageEgressAllowed`；比对上传无对等门闩 | 首次上传或首次发送大稿时对话确认目标 `baseUrl` |
| F6 | P2 | Confirmed / High | Open | `AgentDefinition.specialized` 注释仍写「shell / receptionist」，与专家顾问定性冲突 | Coding standards | `catalog.ts` L28–29 vs `00_08` / 99_06 Fixed F1 | 改注释为「false = 默认工艺顾问（非专属改文档场景）」 |
| F7 | P2 | Confirmed / Medium | Open | live 选区文本在**无 lock**时对所有 Agent 采集外发 | Privacy | `buildAgentContext` live fallback 无 Agent 门闸 | 限 compare/proof/normalize/recover；或 UI 标明「将读取当前选区」 |
| F8 | P2 | Confirmed / High | Open | 任务目录比对 triggers 仍只写「粘贴」，未提上传 | Docs | `tasks.ts` `m0.compare_copy.triggers` | 更新 triggers + `00_08` Host 小节标明 0.4.5 上传 |
| F9 | P2 | Confirmed / Medium | Open | `getAgent(badId)` 静默回落 default，错误 `recommendAgentId` 无反馈 | Parameter / UX | `catalog.getAgent`；handoff 仅看 `specialized` | 未知 id 时 system 提示「无法识别的 Agent id」 |
| F10 | P2 | Confirmed / Medium | Open | `.doc` / 弱 PDF 尽力抽字可能注入噪声/乱码进模型 | Data accuracy | `extractDocBestEffort`；PDF stream 启发式 | 乱码比例检测则拒收并要求 docx/可搜索 PDF；提高 warnings 优先级到用户可见确认 |
| F11 | P2 | Confirmed / High | Fixed | `docs/README` 未索引 99_05/99_06（曾称 99_04 latest） | Docs | 同日已增补 99_05–99_07 链接 | 已落地 |
| F12 | P2 | Confirmed / Medium | Open | 缺 `filterActionsForAgent` / context 作用域单测；面板路径仅手工 | Testing | 无对应 `*.test.ts` | 抽纯函数测白名单过滤与 compare 注入门闸 |
| F13 | P1 | Confirmed / High | Open | 编组选区 `storyText` 为空：`extractIndesignItemText` 不遍历子文本框 | Data accuracy / Host | `indesignHost.toSelectionItem` group 分支；`extractText.ts` 无 `allPageItems` 游走 | 有界遍历子 TextFrame/Table，拼入 `maxLen`；加 mock 单测 |
| F14 | P1 | Confirmed / High | Open | 对照稿上传无 generation/`busy`：清除与二次选择可竞态覆盖 | Runtime / UX | `compareFileInput` fire-and-forget；`clear` 可与未完成 parse 交错 | `compareUploadGen`；解析中禁用上传/清除/发送并提示 |
| F15 | P1 | Confirmed / Medium | Open | `.doc` 尽力抽取用 `String.fromCharCode(...hugeRun)` 可能栈溢出/崩溃 | Runtime / Security | `extractDocBestEffort` `flush` | 分块 `fromCharCode` 或 `TextDecoder('utf-16le')` |
| F16 | P2 | Confirmed / Medium | Open | 无扩展名 ZIP 只试 docx 即抛错；二进制按 txt「成功」载入乱码 | Data accuracy | `extractDocumentText` ext 空 ZIP 分支 vs 后续 zip 回退不一致 | ZIP：docx→xlsx 回退；低可打印比拒收 |

## Rejected / Downgraded

- 「default 可能 emit replace_table」→ 宿主 `filterActionsForAgent` 丢弃；降为已缓释，保持监视
- 「上传文件名 XSS」→ `textContent` / TextNode；Rejected（残留：文件名进模型属提示注入，非 DOM XSS）
- 「bundle 875KB = P0」→ 可接受体积；关注 xlsx 漏洞而非单纯体积
- 「Lesson 提示注入」→ 既有模型→记忆通道；非本 diff 独有；记入验证缺口
- 并行审将「无字节上限 / 全 Agent 注入对照稿」标为 P0 → 与主审对齐为 **P1**（本地面板 DoS / 成本隐私，非远程 RCE）；若产品要求零卡死可再升 P0

## Verification Gaps

- InDesign 实机：Cell 贴表、**编组选区**比对、docx/xlsx/pdf 比对、GREP 复制到查找/更改
- 大文件（>10MB xlsx）与畸形 zip 下 UXP 稳定性；上传中点清除竞态
- 客户机密稿上传后的中转日志/保留策略（BYOK 运营）
- `recommendAgentId` 错误 id 的产品文案
- `buildAgentUserPayload` 体积预算夹具

## Coverage

1. Architecture: Pass — Agent / Skill / Action 分层清楚；上下文作用域 **Gap（F1/F4/F7）**  
2. Platform: Pass（spec）；UXP 剪贴板/上传实机 NV；编组抽字 Gap F13  
3. Security: **At risk** — F2/F3/F15；隐私 F1/F4/F5  
4. Efficiency: At risk — 大 context / 默读剪贴板  
5. Runtime: At risk — F2/F14/F15  
6. Isolation: Pass — 项目 memory key；比对稿未按文档隔离（会话级）  
7. Data accuracy: At risk — F10/F13/F16  
8. Parameter: Pass；recommend 回落 F9  
9. UX: Pass 上传入口；隐私确认 Gap F5；上传竞态 F14  
10. Docs: Pass（F11 Fixed）；余 F8  
11. Testing: Gap — F12；提取单测有  
12. Deploy: Pass build；依赖 audit 未清

## Evidence Log

- Diff: `origin/main...HEAD` ≈ +1928/−87 across catalog/skills/host/compare/panel/docs  
- Checks: `npm run check` → 51 pass + build ok（2026-11-13 CST）  
- `npm audit`: xlsx High ×2 advisory, fixAvailable false  
- Accepted F1/F4/F7: 通读 `buildAgentContext`  
- Accepted F2: `extractDocumentText` + panel `arrayBuffer` 无 size guard  
- Accepted F3: audit JSON + package.json  
- Accepted F5: 对比 `ensureImageEgressAllowed` 仅识图路径  
- Accepted F6/F8: 注释与 docs 对照；F11 Fixed in README  
- Accepted F13–F16: 并行宿主审 + 主审复读 `extractText` / compare panel / `.doc` flush  

## Recommendation（执行顺序）

1. **F1+F4+F7**：收紧 `buildAgentContext` 注入门闸（比对稿 / 剪贴板 / live 选区按 Agent）  
2. **F2+F14**：上传字节护栏 + 解析 generation/busy  
3. **F3**：去掉或替换脆弱 `xlsx` 路径（优先 OOXML 自研 + xls 引导）  
4. **F13+F15+F16**：编组抽字、`.doc` 分块解码、ZIP/乱码门闸  
5. F5 大稿外发确认；F6/F8/F12/F9 文档与测试小改进  

User request「再做一次深入审计」→ **本报告为止**；修复需另开「按审计修复」执行轮。
