/**
 * Curated Agent skills — versioned knowledge packs (not auto lessons).
 * agents: ["*"] = every agent including default; else exact agent ids.
 */

export type AgentSkill = {
  id: string;
  title: string;
  body: string;
  agents: string[];
  tags?: string[];
};

export const SKILL_REGISTRY: AgentSkill[] = [
  {
    id: "skill.craft_advisor_sop",
    title: "画册/内页工艺顾问 SOP",
    agents: ["*"],
    tags: ["advisor", "sop"],
    body: `回答用户时按「判断问题 → 可行步骤 → 风险/注意 → 若需改文档则推荐哪个专属 Agent」组织。
常见路径：
- 矢量/图片假表 → 伪表恢复（先选中，再识别，再选表样式替换；可 Undo）
- Excel/Word 贴入的真表难看 → 贴表规范化（套文档表样式）
- 客户改了 Word/价表 → 文稿比对（粘贴对照稿，先出差异，不盲目覆写）
- 错别字/空格/术语 → 文章校对
- 找替换规则不会写 → GREP 助手
禁止空泛「请去 Agent 列表」；必须说明为何、用户接下来点哪、先准备什么（选区/样式/对照稿）。
不做溢出巡检与缺图重链（宿主或其他软件已有提醒）。`,
  },
  {
    id: "skill.table_style_priority",
    title: "表样式优先级",
    agents: ["*", "m0t.table_recover", "m0.table_normalize"],
    tags: ["table", "style"],
    body: `应用/替换表样式时优先级：用户话里的样式名 > 面板下拉 selectedStyle > 项目 preferredTableStyle。
名称需与文档 tableStyles 对齐；可用模糊匹配（去括号）。替换真表可 Undo；伪表路径必须先有识别稿再 replace。`,
  },
  {
    id: "skill.image_egress_privacy",
    title: "识图外发隐私",
    agents: ["*", "m0t.table_recover"],
    tags: ["privacy"],
    body: `选区图/补图发往用户配置的 Base URL 前，宿主会要求「确认外发」。向用户说明图像会离开本机；取消则不调用模型。`,
  },
  {
    id: "skill.grep_indesign_dialect",
    title: "InDesign GREP 方言要点",
    agents: ["*", "m0.grep_assist"],
    tags: ["grep"],
    body: `使用 InDesign「查找/更改」GREP，不是 JS/PCRE 全集。
常用：\\d 数字、\\s 空白、\\w 字词、(?<=) (?=) 部分版本支持需谨慎；替换里 $1 为子表达式。
给出表达式时说明在查找框怎么粘贴；GREP 样式写入段落样式为后续能力，本期以 propose_grep 展示为主。`,
  },
  {
    id: "skill.compare_no_blind_write",
    title: "比对不盲写",
    agents: ["*", "m0.copy_compare"],
    tags: ["compare"],
    body: `对照稿可来自「上传对照稿」（compareDocumentText：txt/doc/docx/xls/xlsx/pdf 等）、对话粘贴或剪贴板。比对只产出增删改清单与定位线索；在用户明确要求且具备白名单写回动作之前，不声称已改版面。扫描件 PDF / 旧版 .doc 抽字可能不全时要说明。`,
  },
  {
    id: "skill.proof_list_format",
    title: "校对输出格式",
    agents: ["*", "m0.proofread"],
    tags: ["proof"],
    body: `每条问题包含：线索（前后文）+ 原文 + 建议改法 + 类型（错别字/数字/空格/术语）。无选区文本时先请用户选中或锁定选区。`,
  },
];

export function skillsForAgent(agentId: string): AgentSkill[] {
  return SKILL_REGISTRY.filter(
    (s) => s.agents.includes("*") || s.agents.includes(agentId),
  );
}

export function skillsPromptBlock(agentId: string): string {
  const list = skillsForAgent(agentId);
  if (!list.length) return "";
  const body = list
    .map((s) => `### ${s.title} (\`${s.id}\`)\n${s.body}`)
    .join("\n\n");
  return `## 已挂载技能（按当前 Agent 筛选；Skill≠自动 Lesson）\n${body}`;
}
