# 99_06 Advisor & Skills Audit

Date: 2026-11-13（Asia/Shanghai）  
Baseline: `cursor/advisor-skills-969f` @ catalog-expand `b77e826`（含未合入 main 的 #4 内容）  
Prior anchor: `99_05_byok_connection_audit.md`  
Depth: **standard**（产品/架构缺口；非全仓 deep）  
Scope: 默认顾问定性、经验/技能层、专属 Agent 知识注入  
Evidence limits: 静态通读 + `npm run check`（修复轮后）

## Verdict

- P0: **0** | P1: **3** | P2: **2** → **F1–F5 Fixed**（同日执行轮）
- Main risk（修复前）: 顾问为壳、无 Skill 挂载。修复后：专家顾问 + Skill 注册表 + recommendAgentId 交接。

## Critical Paths

### 默认对话 → 系统提示 → 模型回复
- Goal: 首屏像工艺顾问，给出方法并正确转交专属 Agent
- Trace: `panel` → `directAgentTurn` → `buildAgentSystemPrompt("default")` → `catalog.buildDefaultPrompt`
- Findings: F1, F2, F5
- Health: **At risk**（壳行为）

### 经验沉淀 → 再注入
- Goal: 提炼技能可版本化、可挂载
- Trace: `lessons` → `rememberNote` → `memorySliceForPrompt` → user payload；**无** skill registry
- Findings: F3, F4
- Health: **At risk**

## Confirmed Strengths

- Agent 列表 + 白名单动作边界清晰（改文档不进 default）
- `agentLessons` / project lessons 已有注入通道，可复用为 Skill 旁路
- 专属 Agent 已分场景 prompt（伪表 / 规范化 / 比对 / 校对 / GREP）

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Evidence | Remediation |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | P1 | Confirmed / High | Fixed | `default` 定性为引导壳，无方法库 | 已改为工艺顾问 prompt + 共用 SOP skill | 已落地 |
| F2 | P1 | Confirmed / High | Fixed | 无 Skill 注册/挂载层 | `plugin/src/agent/skills/registry.ts` + systemPrompt 注入 | 已落地 |
| F3 | P1 | Confirmed / High | Fixed | lessons ≠ 提炼技能；无法专属挂载 | Skill.agents 筛选；Lesson 通道保留 | 已落地 |
| F4 | P2 | Confirmed / High | Fixed | 顾问转交无结构化交接 | `recommendAgentId` + 面板「加载」chip | 已落地 |
| F5 | P2 | Confirmed / Medium | Fixed | 文档与产品意图冲突 | `00_08` / `00_09` 已对齐 | 已落地 |

## Coverage

1 Architecture: Gap — 缺 Skill 层  
2 Platform: Pass  
3 Security: Pass — default 仍无破坏性动作  
4 Efficiency: Pass  
5 Runtime: Pass  
6 Isolation: Pass — project lessons 仍隔离  
7 Data accuracy: Gap — 经验无晋升路径  
8 Parameter: Gap — 无 handoff  
9 UX: At risk — 首屏像壳  
10 Docs: Gap — F5  
11 Testing: Gap — 无 skill 选择单测  
12 Deploy: N/A

## Recommendation（执行顺序）

1. 落库 `00_09` + 改 `00_08` 顾问定性  
2. 实现 Skill 注册表 + `skillsForAgent` + 注入 system prompt  
3. 顾问专家化 prompt + `recommendAgentId` 解析与一键加载  
4. 种子技能（共用工艺 + 表样式优先级 + GREP 方言注意）

User request「审计一次然后执行」→ 本报告之后进入修复实现。
