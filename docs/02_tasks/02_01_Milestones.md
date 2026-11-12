# 02_01 Milestones & Gates

## M0-T — Vector table recovery (urgent spike, current priority)

| Field | Value |
| --- | --- |
| Status | Ready for implementation after scaffolding shared panel/provider |
| Owner | implementation agent + user verification on real catalog page |
| Goal | 选中矢量伪表 → 视觉识别 → 预览确认 → 真表 + 已有表样式 + 表头/表尾行，并替换原对象 |
| Evidence required | T1–T8 in [`01_02_M0T_Vector_Table_Recovery.md`](../01_specs/01_02_M0T_Vector_Table_Recovery.md) |
| Done criteria | 画册样例页上伪表变为可编辑真表；头/尾行正确；指定已有 Table Style 套用成功；原矢量移除 |
| Fail criteria | 无图纯路径识字；无预览直接写入；忽略已有表样式 |
| Depends on | 面板设置、多模态供应商（vision）、选区导出图、协议校验、表命令 executor |
| Docs to update on fact change | `00_04` `01_02` `88_02` `99_audits` |

### M0-T implementation slices

1. 选区 bounds + 栅格导出 + 面板缩略图
2. `recover_table` 多模态请求（优先支持 vision 的供应商/中转）
3. `TableDraft` 预览编辑（含表样式下拉 = 文档已有样式列表）
4. 表白名单 executor：预检 → `createTable` → `writeCellText` → `setHeaderFooterRowCount` → `applyTableStyle` → 成功后才 `removeObjects`（无 `replaceSelectionIds`）
5. 粘贴补图兜底 + 外发明示 + 错误路径手测

> 与 M0 主线关系：M0-T **优先**交付紧急价值；共享脚手架（空面板、settings、openai_compatible+vision）先为 M0-T 服务，再补齐段/字符样式微调 AC。

## M0 — Selection apply + style assist (parallel baseline)

| Field | Value |
| --- | --- |
| Status | Ready for implementation scaffolding |
| Owner | implementation agent + user verification on ID 2024+ |
| Goal | 选区 JSON ↔ 多供应商直连 ↔ 白名单落地；段/字符样式可建可套 |
| Evidence required | AC1–AC8 in [`01_01_M0_Selection_Layout.md`](../01_specs/01_01_M0_Selection_Layout.md) |
| Done criteria | 内页正文框微调成功；新建并应用段/字符样式；中转 + 另一供应商均成功；错误路径可演示 |
| Fail criteria | 非法输出仍改文档；Key/URL 不可配置；仅单供应商 |
| Fallback | 若某原生供应商受 UXP 网络限制，先以兼容代理 URL 验证适配器，并记入 To Verify |
| Docs to update on fact change | `00_02` `00_03` `00_04` `01_01` `99_audits` |

### M0 implementation slices (suggested order)

1. UXP 空面板 + 设置页（provider 字段）
2. Selection → `DocumentSnapshot`
3. Protocol validate + executor dry-run / apply
4. `openai_compatible` adapter + 中转实调
5. Claude 或 Gemini adapter
6. 样式创建/套用指令
7. 错误路径与 Undo 手测清单

## M1 — Layout evaluation advisor

| Field | Value |
| --- | --- |
| Status | Planned |
| Goal | 版式评估可解释；标题+正文等多对象局部建议；勾选后应用 |
| Evidence | 问题列表 + rationale；至少一次跨两文本框建议并部分应用 |
| Fail | 只有改参没有评估依据 |

## M2 — Prepress / richer styles / local assets

| Field | Value |
| --- | --- |
| Status | Deferred |
| Includes | 表/单元格/图形样式；图片与 PDF 文字提取增强；印前/跨框语义校对；本地目录素材初稿 |

## M3 — Unified backend + knowledge advisor

| Field | Value |
| --- | --- |
| Status | Deferred |
| Includes | 统一后端 API；个人经验知识库；对话式沉淀「越用越懂你」 |

## Gate Rule

未关闭的 P0（安全写入、协议校验、Key 泄露进仓库）不得进入下一里程碑。
