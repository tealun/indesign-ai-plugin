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
| `m0.layout_assist` | 选区排版 | 已落地（0.4.9） | 锁定文本框 → 分析排版 → 预览白名单指令 → 应用；段/字符样式创建与套用 |
| `m0.table_normalize` | 贴表规范化 | 已稳固（0.4.8） | Excel/Word 粘贴或已有真表 → 套文档表样式、清理解释 |
| `m0.copy_compare` | 文稿比对 | 已稳固（0.4.8） | 上传/粘贴对照稿（txt/doc/docx/xlsx/pdf…；旧 `.xls` 请另存 xlsx）vs 版面：差异报告 |
| `m0.proofread` | 文章校对 | 已稳固（0.4.8） | 错别字、数字/空格/术语等问题报告；「读取选区」+校对清单 |
| `m0.grep_assist` | GREP 助手 | 已稳固（0.4.8） | 口语 → Find/Change GREP；`propose_grep` + 一键复制；GREP Style 写入为 M2 |

## Explicitly out of catalog

- 溢出巡检 Agent  
- 缺图 / 批量重链 Agent  
- 全书重排、表行跨页拆分（宿主能力缺口）

## Implementation map

- 注册表 / 提示词：`plugin/src/agent/catalog.ts`
- 任务目录：`plugin/src/agent/tasks.ts`
- 动作白名单：`plugin/src/agent/types.ts` + `parseDecision.ts`
- 面板场景：`plugin/src/ui/panel.ts`
- 选区文本：`plugin/src/host/extractText.ts`（框/表/单元格 → `storyText`）
- 剪贴板：`plugin/src/host/clipboard.ts`（比对读入；GREP 一键复制）

## Host deepening（0.4.4–0.4.9）

| Agent | 宿主能力 |
| --- | --- |
| 选区排版 | `m0Layout`：setFontSize/Leading/Alignment/Space、create/apply Para|Char Style、moveResizeFrame；选区 snapshot 含样式字段；分析→预览→应用 |
| 贴表规范化 | `apply_table_style`：选区 Table / Cell 上溯 / 框内 nested tables |
| 文稿比对 | 上传对照稿（0.4.5+）→ `compareDocumentText`（仅本 Agent 注入）；剪贴板备选；外发确认 |
| 文章校对 | live `selectionText`（限校对等场景） |
| GREP 助手 | `propose_grep` 气泡提供「复制查找式 / 替换式」 |

## Acceptance（本期）

1. Agent 列表可见上述专属项（不含溢出/缺图）。  
2. 点选后回对话并显示场景栏；可「退出到默认」。  
3. 各 Agent 仅能发射自身 `allowedActions`。  
4. GREP 助手能产出可复制的查找表达式（`propose_grep` + 一键复制）。  
5. 贴表规范化在选中真表（含单元格）时可 `apply_table_style`。  
6. 选区排版：分析指令经白名单校验后才可应用；离开场景清除预览。  
7. 比对 / 校对以对话报告为主；不假装已实现全自动覆写全书。
