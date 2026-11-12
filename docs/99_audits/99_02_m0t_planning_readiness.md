# 99_02 M0-T Planning Readiness

Date: 2026-11-12  
Scope: Urgent vector-table recovery spike planning

## Verdict

**Ready for M0-T implementation scaffolding**

用户确认：M0-T 为当前最优先；文档已有 Table Style；主路径为选区 + 自动截图视觉识别，预览后替换。

## Checks

| Area | Result | Notes |
| --- | --- | --- |
| Workflow | Pass | Hybrid capture locked |
| Protocol | Pass | `recover_table` + table whitelist added |
| Styles | Pass | Apply existing table style only |
| Milestone | Pass | M0-T slices 1–5 listed |
| External facts | Partial | 选区导出与中转 vision 格式待实机验证 |

## Next Exact Step

协议审计缺口已在 [`99_03_planning_audit.md`](99_03_planning_audit.md) 修复。搭建共享 UXP 面板与 settings 后，立即做 M0-T slice 1（选区导出图），再接 vision `recover_table`。
