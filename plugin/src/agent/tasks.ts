/**
 * Programmatic task catalog.
 * The agent identifies a taskId; the host runs the corresponding action sequence.
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
      "用户要把选中的矢量/曲线假表，或裁切后的表格图片转成可编辑 InDesign 表。",
    steps: [
      "lock_selection（若尚未锁定）",
      "recognize_table",
      "replace_table（需 styleName）",
    ],
    params: [
      {
        name: "styleName",
        required: false,
        description: "文档表样式名",
      },
    ],
    emits: ["lock_selection", "recognize_table", "replace_table"],
  },
  {
    id: "m0t.recognize_only",
    title: "仅识别表格内容",
    triggers: "只要识别/预览，暂不替换。",
    steps: ["lock_selection（如需要）", "recognize_table"],
    params: [],
    emits: ["lock_selection", "recognize_table"],
  },
  {
    id: "m0t.replace_with_style",
    title: "用指定样式落地真表",
    triggers: "已有识别稿，用户给出样式名或确认替换。",
    steps: ["replace_table"],
    params: [
      {
        name: "styleName",
        required: true,
        description: "必须能对应 runtimeContext.tableStyles",
      },
    ],
    emits: ["replace_table"],
  },
  {
    id: "m0.normalize_table_style",
    title: "真表套用文档表样式",
    triggers: "Excel/Word 贴入的表或已有真表要统一样式、规范化。",
    steps: ["lock_selection（可选）", "apply_table_style"],
    params: [
      {
        name: "styleName",
        required: true,
        description: "文档表样式名",
      },
    ],
    emits: ["lock_selection", "apply_table_style"],
  },
  {
    id: "m0.compare_copy",
    title: "文稿比对",
    triggers: "用户粘贴 Word/Excel/对照稿，要与版面选区文本比差异。",
    steps: ["lock_selection（如需要读选区）", "仅在 reply 中报告差异，不写文档"],
    params: [],
    emits: ["lock_selection"],
  },
  {
    id: "m0.proofread_copy",
    title: "文章校对",
    triggers: "校对错别字、数字格式、空格、术语。",
    steps: ["lock_selection（如需要）", "仅在 reply 中给出问题清单与建议"],
    params: [],
    emits: ["lock_selection"],
  },
  {
    id: "m0.grep_propose",
    title: "生成 GREP",
    triggers: "口语描述查找/替换规则，或要 GREP Style 表达式。",
    steps: ["propose_grep（展示可复制表达式）"],
    params: [
      { name: "find", required: true, description: "InDesign GREP 查找式" },
      { name: "changeTo", required: false, description: "替换式" },
    ],
    emits: ["propose_grep"],
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

export function taskCatalogForPrompt(ids?: string[]): string {
  const list = ids?.length
    ? TASK_CATALOG.filter((t) => ids.includes(t.id))
    : TASK_CATALOG;
  return list
    .map((t) => {
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
    })
    .join("\n");
}
