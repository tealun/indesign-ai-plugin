/**
 * Programmatic task catalog.
 * The agent identifies a taskId; the host runs the corresponding action sequence.
 * Keep descriptions bilingual-ish but decision JSON stays structured.
 */

export type TaskParamDef = {
  name: string;
  required: boolean;
  description: string;
};

export type TaskDefinition = {
  id: string;
  title: string;
  /** When the agent should pick this task */
  triggers: string;
  /** What the host will do (for prompt + docs) */
  steps: string[];
  params: TaskParamDef[];
  /** Primitive actions this task may emit */
  emits: string[];
};

export const TASK_CATALOG: TaskDefinition[] = [
  {
    id: "m0t.vector_table_recover",
    title: "伪表/图表 → 真表",
    triggers:
      "用户要把选中的矢量/曲线假表，或裁切后的表格图片（含只选中内嵌图）转成可编辑 InDesign 表；或说转成表格、换成真表、一键转表。内嵌图会归一到图框并只识别可见裁切区域。",
    steps: [
      "lock_selection（若尚未锁定）",
      "recognize_table（导出选区并视觉识别）",
      "replace_table（需 styleName；可从项目经验/下拉/用户话里解析）",
    ],
    params: [
      {
        name: "styleName",
        required: false,
        description:
          "文档表样式名（例：货号信息表 / [货号信息表]）；未知时可先识别再问，或用项目偏好样式",
      },
    ],
    emits: ["lock_selection", "recognize_table", "replace_table"],
  },
  {
    id: "m0t.recognize_only",
    title: "仅识别表格内容",
    triggers: "只要识别/预览，暂不替换删除原矢量。",
    steps: ["lock_selection（如需要）", "recognize_table"],
    params: [],
    emits: ["lock_selection", "recognize_table"],
  },
  {
    id: "m0t.replace_with_style",
    title: "用指定样式落地真表",
    triggers:
      "已有识别稿，用户给出样式名、说「就用这个」、确认替换、或只回复样式名。",
    steps: ["replace_table"],
    params: [
      {
        name: "styleName",
        required: true,
        description:
          "必须能对应 runtimeContext.tableStyles（例：货号信息表 / [货号信息表]）",
      },
    ],
    emits: ["replace_table"],
  },
  {
    id: "meta.list_styles",
    title: "列出表样式",
    triggers: "询问有哪些表样式、样式列表。",
    steps: ["list_styles"],
    params: [],
    emits: ["list_styles"],
  },
  {
    id: "meta.open_config",
    title: "打开模型配置",
    triggers: "配置 API、换模型、Wire API、Key。",
    steps: ["open_config"],
    params: [],
    emits: ["open_config"],
  },
  {
    id: "meta.clarify",
    title: "澄清后不执行",
    triggers: "信息不足、风险不明、或用户只是闲聊问能力。",
    steps: ["不发射破坏性动作；reply 说明缺什么"],
    params: [],
    emits: [],
  },
];

export function taskCatalogForPrompt(): string {
  return TASK_CATALOG.map((t) => {
    const params = t.params
      .map((p) => `${p.name}${p.required ? "*" : "?"}：${p.description}`)
      .join("；");
    return [
      `- id: ${t.id}`,
      `  title: ${t.title}`,
      `  when: ${t.triggers}`,
      `  steps: ${t.steps.join(" → ")}`,
      params ? `  params: ${params}` : "  params: （无）",
    ].join("\n");
  }).join("\n");
}
