import { taskCatalogForPrompt, TASK_CATALOG } from "./tasks.js";

export type AgentUiProfile = {
  /** Show table style dropdown + 补图 */
  showTableTools: boolean;
  /** Natural-language placeholder */
  placeholder: string;
  /** Optional chips; empty = none */
  chips: Array<"recognize" | "replace">;
};

export type AgentDefinition = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** false = shell / default receptionist */
  specialized: boolean;
  ui: AgentUiProfile;
  /** Allowed action types for host sanitizer */
  allowedActions: string[];
  buildSystemPrompt: () => string;
};

const OUTPUT_SHAPE = `## 输出（唯一：一个 JSON 对象，无 Markdown 围栏）
{
  "reply": "给用户的中文回复",
  "taskId": "任务目录中的 id，或 meta.clarify",
  "actions": [ /* 0..N，按顺序 */ ],
  "lessons": [
    { "scope": "agent|user|project|task", "text": "可沉淀的短经验", "taskId": "可选" }
  ]
}`;

function buildDefaultPrompt(): string {
  return `你是「InDesign AI」默认顾问：友好、简洁，帮助用户理解能做什么，并引导他们加载合适的专属 Agent。

## 原则
1. 你**不能**改文档、不能识图建表。破坏性/版面任务请引导用户到「Agent」列表加载专属 Agent。
2. 当前已提供的专属 Agent：伪表恢复（把矢量假表或裁切图表图片变成真表）。
3. 用户若直接说转成表格/识别表格，请明确请他们打开 Agent 列表加载「伪表恢复」。
4. 模型/中转配置问题可引导去「配置」。

${OUTPUT_SHAPE}

## 允许的 actions
- {"type":"open_config"}
- 不要发射 lock_selection / recognize_table / replace_table / list_styles

## 任务
- id: meta.clarify — 解释能力并引导选 Agent
- id: meta.open_config — 打开配置`;
}

function buildM0tPrompt(): string {
  return `你是「InDesign AI · 伪表恢复」专属 Agent：把选中的矢量假表或裁切后的表格图片，恢复为可编辑 InDesign 真表并应用文档表样式。

## 原则
1. 专注本职：只做伪表/图表恢复相关程序化任务，不编造未实现能力。
2. 最大化智能：结合 runtimeContext + 经验理解省略说法；能安全推进就推进。
3. 项目隔离：project 经验只属于当前文档。
4. 经验沉淀：稳定偏好写入 lessons。
5. 安全：不输出脚本；改文档只能通过 actions。replace_table 可 Undo。

${OUTPUT_SHAPE}

## 允许的 actions
- {"type":"lock_selection"}
- {"type":"recognize_table"}
- {"type":"replace_table","styleName":"..."}
- {"type":"list_styles"}
- {"type":"open_config"}

## 任务目录
${taskCatalogForPrompt()}

## 决策要点
- hasDraft=======true 且用户要替换 → 只发 replace_table，禁止再 recognize/lock。
- 仅当用户明确「重新识别」才可再 recognize。
- 样式优先：用户话 > selectedStyle > projectPreferredTableStyle。
- 内嵌图会归一到图框，只识别裁切可见区域（宿主已处理）。`;
}

export const DEFAULT_AGENT_ID = "default";

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    id: DEFAULT_AGENT_ID,
    name: "默认顾问",
    tagline: "自然对话与引导",
    description: "日常问答与引导；版面任务请加载专属 Agent。",
    specialized: false,
    ui: {
      showTableTools: false,
      placeholder: "想做什么？",
      chips: [],
    },
    allowedActions: ["open_config"],
    buildSystemPrompt: buildDefaultPrompt,
  },
  {
    id: "m0t.table_recover",
    name: "伪表恢复",
    tagline: "矢量/图片假表 → 真表",
    description:
      "识别选区中的假表（矢量或裁切图片），写入可编辑表格并套用文档表样式。",
    specialized: true,
    ui: {
      showTableTools: true,
      placeholder: "转成表格 / 用样式替换…",
      chips: ["recognize", "replace"],
    },
    allowedActions: [
      "lock_selection",
      "recognize_table",
      "replace_table",
      "list_styles",
      "open_config",
    ],
    buildSystemPrompt: buildM0tPrompt,
  },
];

export function getAgent(id: string): AgentDefinition {
  return AGENT_CATALOG.find((a) => a.id === id) || AGENT_CATALOG[0]!;
}

export function listSpecializedAgents(): AgentDefinition[] {
  return AGENT_CATALOG.filter((a) => a.specialized);
}

/** Future metering hook — unused in M0. */
export type UsageMeterHook = {
  /** Called before a billed agent turn; return false to block. */
  canSpend?(agentId: string, units?: number): boolean;
  recordSpend?(agentId: string, units?: number): void;
};

export const NOOP_USAGE_METER: UsageMeterHook = {
  canSpend: () => true,
  recordSpend: () => undefined,
};

void TASK_CATALOG;
