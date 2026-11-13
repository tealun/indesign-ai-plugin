# 99_07 Catalog & Host Deep Audit（顾问 / 专属 Agent / 宿主加深 / 比对上传）

Date: 2026-11-13（Asia/Shanghai）  
Baseline: `cursor/advisor-skills-969f` @ remediation `0.4.7`  
Prior anchors: `99_05_byok_connection_audit.md` · `99_06_advisor_skills_audit.md`  
Depth: **deep**  
Scope: Agent 目录扩展、Skill 挂载、宿主抽字/剪贴板/贴表、文稿比对上传  
Evidence: 静态通读 + `npm run check`（61 pass）+ `npm audit`（0 vulns after drop xlsx）

## Verdict

- P0: **1**（F17 Fixed）| P1 / P2 → **全部 Fixed（0.4.6–0.4.7）**
- **回头核验**：见 [`99_07_verification_2026-11-13.md`](99_07_verification_2026-11-13.md) — 静态/单测 **Verified Fixed**；实机 ID 仍为验证缺口。
- 白名单、上下文门闸、上传护栏、去 SheetJS、编组抽字均已落地。

## Findings（状态总表）

| ID | Sev | Status | Summary |
| --- | --- | --- | --- |
| F1 | P1 | Fixed | 对照稿仅 `m0.copy_compare` 注入（`contextGate`） |
| F2 | P1 | Fixed | `MAX_UPLOAD_BYTES` 8MB + zip 条目/解压上限 |
| F3 | P1 | Fixed | 移除 `xlsx`；OOXML 自研；`.xls` 引导另存 xlsx；`npm audit` 清零 |
| F4 | P1 | Fixed | 默认顾问不再读剪贴板 |
| F5 | P2 | Fixed | 比对发送前 `ensureEgressAllowed(..., document)` |
| F6 | P2 | Fixed | `specialized` 注释改为工艺顾问 |
| F7 | P2 | Fixed | live 选区限 compare/proof/normalize/recover |
| F8 | P2 | Fixed | `tasks` + `00_08` 上传说明 |
| F9 | P2 | Fixed | recommend 精确匹配（同 F20） |
| F10 | P2 | Fixed | `printableRatio` 乱码拒收 |
| F11 | P2 | Fixed | README 索引 |
| F12 | P2 | Fixed | `contextGate` + 单测 |
| F13 | P1 | Fixed | 编组 `allPageItems` 游走抽字 |
| F14 | P1 | Fixed | `compareUploadGen` + 解析中禁用 |
| F15 | P1 | Fixed | `.doc` 分块 `fromCharCode` |
| F16 | P2 | Fixed | ZIP docx→xlsx 回退；二进制拒收 |
| F17 | P0 | Fixed | sanitize 仅 recover + 二次 filter；离场清 draft |
| F18 | P1 | Fixed | 样式下拉自动替换仅 recover |
| F19 | P1 | Fixed | Skill 去全局 `*` |
| F20 | P2 | Fixed | recommendAgentId 校验 |

## Coverage（修复后）

1–12: **Pass**（实机 ID 仍为验证缺口，非 Open 缺陷）

## Recommendation

无强制剩余码债。可选后续：实机冒烟编组比对、大 xlsx、GREP 粘贴到查找/更改。
