# 02_01 Milestones & Gates

## M0 — Selection apply + style assist (current)

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
