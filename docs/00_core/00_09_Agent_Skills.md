# 00_09 Agent Skills（技能挂载）

## Goal

把**人工提炼、可版本化**的经验做成 Skill，按 Agent 挂载；与对话自动沉淀的 Lesson 分离。

## Concepts

| 概念 | 定义 | 写入方 |
| --- | --- | --- |
| **Skill** | 注册表中的知识包（标题 + 正文 + 适用 Agent） | 人 / 审核后入库 |
| **Lesson** | `rememberNote` 自动经验（agent/user/project/task） | 模型回合 |
| **Task / Action** | 可执行白名单 | 代码 |

## Schema

```ts
{
  id: "skill.table_style_priority",
  title: "表样式优先级",
  body: "…",
  agents: ["*"] | ["m0t.table_recover", "m0.table_normalize"],
  tags?: string[]
}
```

- `agents: ["*"]` → 所有 Agent（含默认顾问）  
- 否则仅列出的 `agentId` 注入  

组装：`buildAgentSystemPrompt(agentId)` = Agent 专属 system + `## 已挂载技能` 块。

## Default advisor（专家定性）

见 [`00_08_Agent_Catalog.md`](00_08_Agent_Catalog.md)：`default` 是**画册/内页工艺顾问**，不是路由壳。可给方法与转交建议；破坏性改文档仍只通过专属 Agent。

## Promotion path

稳定、高频的 Lesson → 人工晋升为 Skill 写入 `plugin/src/agent/skills/registry.ts`（后期可加面板编辑）。

## Implementation

- 注册表：`plugin/src/agent/skills/registry.ts`
- 注入：`plugin/src/agent/systemPrompt.ts`
- 转交：`AgentDecision.recommendAgentId`（可选）→ 面板一键加载
