# 99_03 Planning Audit (docs consistency + M0-T protocol)

Date: 2026-11-12  
Baseline: `cursor/m0-planning-docs-969f` (pre-fix `@4bbf7c2`; fixes landed in follow-up commit)  
Depth: standard  
Scope: documentation / protocol planning only (no plugin runtime code)  
Mode: findings repaired in same change set after explicit user request「按审计结果修复」

## Verdict

- P0: 0 | P1: 4 | P2: 3 → **all Fixed in docs**
- Main risk before fix: M0-T table replace could half-write or miscount rows

## Critical Paths

- M0-T recover → preview → apply table replace: was **At risk** → docs now **Healthy (spec)**; runtime still **Not verified**

## Confirmed Strengths

- SoT index + local markdown links resolve
- Model cannot execute free scripts; panel emits whitelist commands
- Hybrid select + vision path consistent across PRD / milestones / spec

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Path / Dimension | Evidence | Remediation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | P1 | Confirmed / High | Fixed | T7 零写入 vs 中途失败语义冲突 | Data accuracy / Runtime | `01_02` T7 vs old `00_04` mid-batch Undo | 预检零写入 + 成功后才 `removeObjects`；T7/T9 对齐 |
| F2 | P1 | Confirmed / High | Fixed | 双删除路径 | Parameter passing | `replaceSelectionIds` + `removeObjects` | 删除仅 `removeObjects` |
| F3 | P1 | Confirmed / High | Fixed | rows / bodyRowCount 未定义 | Data accuracy | TableDraft 示例含头尾 | 规范性行列公式写入 `00_04` |
| F4 | P1 | Exposure / High | Fixed | 选区图外发无隐私提示 | Security / UX | M0-T vision 必传图 | `00_03` Privacy + T9 + AGENTS #7 |
| F5 | P2 | Confirmed / High | Fixed | merges 无命令 | Standards | TableDraft.merges | M0-T 忽略 merges |
| F6 | P2 | Confirmed / High | Fixed | snapshot 缺 group | Architecture | 仅 textFrame 示例 | 增加 `group` / `graphic` |
| F7 | P2 | Confirmed / High | Fixed | 99_01 / PRD 旅程漂移 | Standards | M0-T 优先后未注 | superseded 注 + M0-T journey |

## Verification Gaps

- UXP 选区导出、InDesign 表头/表样式 API、中转 vision、Undo 整批：仍待实机（`88_02`）
- Testing / Deploy dimensions: N/A until implementation

## Coverage

1. Architecture: Pass after F6  
2. Platform integration: Not verified (runtime)  
3. Security: Pass (planning) after F4  
4. Code efficiency: N/A  
5. Runtime smoothness: Spec Healthy; runtime NV  
6. Information isolation: N/A  
7. Data accuracy: Pass after F3  
8. Parameter passing: Pass after F2  
9. User experience: Pass after F4/T9  
10. Coding standards / docs: Pass after F5/F7  
11. Testing: Verification gap  
12. Deploy & ops: N/A  

## Evidence Log

- Accepted: F1–F7 as listed in conversational audit 2026-11-12  
- Rejected: none material  
- Link check: 26 local links, 0 missing (pre-fix baseline)
