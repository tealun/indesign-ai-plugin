# 00_08 Agent Catalog（专属 Agent 目录）

## Goal

面板「Agent」列表可加载的专属场景。**默认顾问是工艺专家 Agent**（方法、诊断、转交），不是空壳路由；改文档等破坏性能力按专属 Agent 白名单执行。技能挂载见 [`00_09_Agent_Skills.md`](00_09_Agent_Skills.md)。

## Product decisions（2026-11-13）

| Decision | Detail |
| --- | --- |
| UI | 首屏自然对话；点选 Agent 后回到对话首屏并进入该场景 |
| 默认顾问 | **画册/书籍内页工艺顾问**：给可执行步骤与方案；可 `recommendAgentId` 转交专属场景；几乎不直接改文档 |
| Skills | 共用 `*` 或按 Agent 挂载；与 Lesson 分离（`00_09`） |
| Phase-1 AI | 仅自配模型（BYOK）；见 `00_07` |
| **不做** | **溢出巡检、缺图重链**（宿主/既有软件已有快捷提醒，不重复开发） |
| 计费 | 预留 hook；本期 NOOP |

## Shipping agents

| id | 名称 | 状态 | 职责 |
| --- | --- | --- | --- |
| `default` | 默认顾问（专家） | 已上线 | 方法/诊断/转交；挂载共用 Skills；`open_config` |
| `m0t.table_recover` | 伪表恢复 | 已上线 | 矢量/图片假表 → 真表 + 表样式 |
| `m0.table_normalize` | 贴表规范化 | 本期落地 | Excel/Word 粘贴或已有真表 → 套文档表样式、清理解释 |
| `m0.copy_compare` | 文稿比对 | 本期落地 | Word/Excel/粘贴稿 vs 版面选区文本：差异列表（先报告，慎自动覆写） |
| `m0.proofread` | 文章校对 | 本期落地 | 错别字、数字/空格/术语等问题报告；可建议替换文案 |
| `m0.grep_assist` | GREP 助手 | 本期落地 | 口语 → Find/Change GREP；可选 `propose_grep` 展示；样式内 GREP Style 写入为后续 |

## Explicitly out of catalog

- 溢出巡检 Agent  
- 缺图 / 批量重链 Agent  
- 全书重排、表行跨页拆分（宿主能力缺口）

## Implementation map

- 注册表 / 提示词：`plugin/src/agent/catalog.ts`
- 任务目录：`plugin/src/agent/tasks.ts`
- 动作白名单：`plugin/src/agent/types.ts` + `parseDecision.ts`
- 面板场景：`plugin/src/ui/panel.ts`

## Acceptance（本期）

1. Agent 列表可见上述专属项（不含溢出/缺图）。  
2. 点选后回对话并显示场景栏；可「退出到默认」。  
3. 各 Agent 仅能发射自身 `allowedActions`。  
4. GREP 助手能产出可复制的查找表达式（`propose_grep`）。  
5. 贴表规范化在选中真表时可 `apply_table_style`。  
6. 比对 / 校对以对话报告为主；不假装已实现全自动覆写全书。
