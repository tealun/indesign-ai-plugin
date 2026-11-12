# 00_02 Architecture

## Platform

| Item | Choice |
| --- | --- |
| Host | Adobe InDesign **2024+**（主测可用最新 CC；API 使用以 2024 为兼容基线） |
| Panel | UXP 常驻面板 |
| AI transport (M0) | 面板直连供应商 HTTP API |
| AI transport (later) | 统一后端 API；面板只换 Transport，不换布局指令协议 |
| Command execution | UXP / 脚本层执行**白名单**布局指令；禁止执行自由脚本串 |

## Module Map

```text
uxp-panel/
  ui/                 # 主控面板 + 分步/折叠配置（含表预览）
  selection/          # 选区与图层文本解析 → DocumentSnapshot
  capture/            # 选区栅格导出（M0-T 视觉输入）
  protocol/           # JSON 编解码与校验
  providers/          # 供应商适配器（OpenAI-compat / Claude / Gemini；含 vision）
  executor/           # 白名单指令执行 + 错误汇总（含表命令）
  settings/           # 本机 provider/baseUrl/apiKey/model
```

业务模块只依赖内部类型：`DocumentSnapshot`、`ChatRequest`、`TableDraft`、`LayoutCommand[]`、`ExecutionReport`。供应商差异止于 `providers/`。

## Core Principles

1. **版式评估是产品重心**；执行层必须可被评估结果驱动，但评估可在 M1 加深。
2. **模型不可直接碰文档**。模型可产出经校验的建议稿（如 `LayoutCommand[]` 或 `TableDraft`）；**一切改文档动作**必须由面板生成的白名单 `LayoutCommand[]` 经 executor 执行。
3. **JSON 是唯一跨边界契约**（面板 ↔ 模型；面板 ↔ 未来后端）。
4. **风格靠配置 / 提示词参数**，不靠多个专用 Agent 进程。
5. **失败可观测**：网络、鉴权、解析、校验、执行分层错误码，见协议文档。
6. **宿主对象模型优先**：InDesign 表必须挂在文本框内；M0-T 建表路径为框→表，见协议事务节。

## High-Risk Surfaces

| Surface | Rule |
| --- | --- |
| API Key | 仅本机设置存储；日志与错误展示脱敏 |
| Model output | schema 校验；Draft≠直接执行；改文档仅白名单命令 |
| Partial apply | 通用批：中途失败停止后续，已成功项靠 Undo。M0-T：预检含选区复检；`removeObjects` 仅在框+表+样式成功后 |
| Image egress | 明示确认；最长边/PPI 上限；日志默认不存原图 |
| CORS / network | UXP 网络权限在 manifest 声明；中转 URL 可配置 |
| Version drift | 文档与代码标注 ID 2024 基线；使用高版本-only API 必须记入里程碑风险 |

## Future Backend Seam

保留 `Transport` 接口：

- `DirectProviderTransport`（M0）
- `UnifiedBackendTransport`（后期）

两者都产出相同的 `LayoutCommand[]`。后端上线时不改 executor / selection 主路径。

## Repo Layout (planned)

```text
/
  AGENTS.md
  README.md
  docs/                 # 本规划体系
  plugin/               # UXP 插件源码（实现阶段创建）
  scripts/              # 打包 / 校验辅助（按需）
```
