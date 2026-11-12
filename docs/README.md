# Documentation Index

InDesign AI 插件的权威文档入口。实现与改动前先读对应域的源文档，避免口头决策漂移。

## Sources of Truth

| Domain | Authoritative doc |
| --- | --- |
| Product goals / non-goals | [`00_core/00_01_PRD.md`](00_core/00_01_PRD.md) |
| Architecture / stack / modules | [`00_core/00_02_Architecture.md`](00_core/00_02_Architecture.md) |
| AI providers / config | [`00_core/00_03_AI_Providers.md`](00_core/00_03_AI_Providers.md) |
| JSON command protocol | [`00_core/00_04_JSON_Protocol.md`](00_core/00_04_JSON_Protocol.md) |
| Local setup | [`00_core/00_05_Setup_Guide.md`](00_core/00_05_Setup_Guide.md) |
| M0 feature behavior | [`01_specs/01_01_M0_Selection_Layout.md`](01_specs/01_01_M0_Selection_Layout.md) |
| M0-T vector table recovery | [`01_specs/01_02_M0T_Vector_Table_Recovery.md`](01_specs/01_02_M0T_Vector_Table_Recovery.md) |
| Milestone gates | [`02_tasks/02_01_Milestones.md`](02_tasks/02_01_Milestones.md) |
| Roadmap / deferred scope | [`88_planning/88_01_Roadmap.md`](88_planning/88_01_Roadmap.md) |
| Planning readiness (M0) | [`99_audits/99_01_planning_readiness.md`](99_audits/99_01_planning_readiness.md) |
| Planning readiness (M0-T) | [`99_audits/99_02_m0t_planning_readiness.md`](99_audits/99_02_m0t_planning_readiness.md) |
| Planning audit | [`99_audits/99_03_planning_audit.md`](99_audits/99_03_planning_audit.md) |
| Deep planning audit (latest) | [`99_audits/99_04_deep_planning_audit.md`](99_audits/99_04_deep_planning_audit.md) |
| Decisions / assumptions | [`88_planning/88_02_Planning_Ledgers.md`](88_planning/88_02_Planning_Ledgers.md) |

## Maintenance Rules

- Changing AI prompts, models, or provider adapters → update `00_03` and protocol docs if response shape changes.
- Changing whitelist commands or JSON fields → update `00_04` and the affected feature spec.
- Changing milestone scope → update `02_01` and readiness audit.
- Prefer links over copying facts across docs.
- Do not implement business code while planning artifacts contradict each other; fix docs first.

## PDCA Skills

本仓库使用 Tealun Dev PDCA（planner / tasker / bugfixer / auditor / evolver / explainer）。触发条件见根目录 [`AGENTS.md`](../AGENTS.md)。
