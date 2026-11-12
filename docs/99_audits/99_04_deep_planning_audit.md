# 99_04 Deep Planning Audit (M0-T host/protocol)

Date: 2026-11-12  
Baseline audited: `fa1d339`  
Depth: deep  
Scope: docs / protocol / host integration planning (no plugin runtime)  
Remediation: applied in follow-up commit per user「按深入审计修复」

## Verdict

- New findings P0: 0 | P1: 4 | P2: 5 → **Fixed in docs**
- Prior F1–F7: remain Fixed
- Main risk before fix: `createTable` ignored InDesign parent-frame model; `tableId` unbound; HF timing contradictory

## Critical Paths

- M0-T recover → preview → preflight → frame+table replace: was **At risk** → docs **Healthy (spec)**; runtime still **Not verified** (F8 closed as Likely→spec; needs ID 2024 sample)

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Remediation |
| --- | --- | --- | --- | --- | --- |
| F8 | P1 | Likely / High | Fixed (spec) | 裸 `createTable(page,bounds)` 不符 ID 表模型 | 先 `createTextFrame` 再 `createTable(parentFrameId)`；To Verify 实机样例 |
| F9 | P1 | Confirmed / High | Fixed | 创建后再 `setHeaderFooterRowCount` 与创建参数冲突 | 主路径创建时带齐 HF；移除该步骤；定义 row 0-based 整表索引 |
| F10 | P1 | Confirmed / High | Fixed | `tableId` 无回填 | `$created.frameId` / `$created.tableId` + report.created |
| F11 | P1 | Likely / High | Fixed | 选区漂移可误删 | apply 预检 id 仍在且 bounds 漂移 ≤2pt |
| F12 | P2 | Confirmed / High | Fixed | bounds 无单位 | 锁定 pt |
| F13 | P2 | Confirmed / High | Fixed | Adapter 无 TableDraft/vision | `supportsVision` + `parseTableDraft` |
| F14 | P2 | Confirmed / High | Fixed | 架构「仅 LayoutCommand」与 Draft 冲突 | 原则改为 Draft 可产出、改文档仅白名单 |
| F15 | P2 | Confirmed / High | Fixed | T6「移层」无命令 | T6 仅删除 |
| F16 | P2 | Confirmed / High | Fixed | Setup 无 M0-T smoke | `00_05` 增 M0-T checklist |
| F17 | P2 | Exposure / High | Fixed | 图像尺寸无上限 | 最长边 2048 / 144 PPI + T11 |

## Verification Gaps

- ID 2024 框内建表 + 头尾行实机样例（closes F8 empirically）
- UXP capture、中转 vision、Undo 整批、2pt 阈值手感

## Coverage

1 Architecture: Pass (spec)  
2 Platform: Pass (spec); runtime NV  
3 Security: Pass (planning)  
4 Efficiency: N/A  
5 Runtime: Pass (spec)  
6 Isolation: N/A  
7 Data accuracy: Pass (spec)  
8 Parameter: Pass (spec)  
9 UX: Pass (spec)  
10 Docs: Pass  
11 Testing: gap  
12 Deploy: N/A  
