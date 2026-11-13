# 01_01 M0 Selection Layout & Style Assist

## Summary

在书刊内页选区上，完成「读取 → 直连模型 → 白名单应用」闭环，覆盖排版微调与段落/字符样式辅助创建应用。

**实现入口（0.4.9）**：专属 Agent `m0.layout_assist`（读取选区 → 分析排版 → 应用指令）；宿主 `plugin/src/host/m0Layout.ts`；协议仍以本文件 + `00_04` 为准。

## In Scope

- 选区解析：文本内容、常用字体样式字段、几何 bounds
- 面板配置：provider / baseUrl / apiKey / model
- 指令预览（应用前可查看 `commands` + `rationale`）
- 白名单执行（见 [`00_04_JSON_Protocol.md`](../00_core/00_04_JSON_Protocol.md)）
- 分层错误反馈

## Out of Scope

- 版式评分体系深化（M1）
- 跨分散文本框全局语义校对
- 图片 / PDF 文字提取增强
- 表 / 单元格 / 图形样式
- 本地目录批量素材导入生成初稿
- 知识库顾问

## UI

策略：**主控面板 + 分步配置**。

- 主区：选区摘要、一键分析、指令预览、应用 / 取消
- 折叠区：供应商与模型参数、风格备注、高级超时等
- 复杂项不塞进首屏

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| AC1 | 选中正文框可生成含 text/style/bounds 的 snapshot | 面板预览或导出 JSON |
| AC2 | 可执行 `setFontSize` / `setLeading` / `setAlignment` 中至少两类成功 | 文档可见变化 + Undo |
| AC3 | `createParaStyle` + `applyParaStyle` 成功 | 样式面板可见新样式且已套用 |
| AC4 | `createCharStyle` + `applyCharStyle` 成功 | 同上 |
| AC5 | 非法 command type 整批拒绝，文档无变化 | 校验错误截图 / 日志 |
| AC6 | OpenAI 兼容中转可配 URL 跑通 | 成功 `ExecutionReport` |
| AC7 | Claude 或 Gemini 另一供应商跑通同路径 | 成功 `ExecutionReport` |
| AC8 | 错误 Key 不写入文档 | 错误码展示 |

## Fail Criteria

- 模型自由文本被直接 `eval` / 当脚本执行
- 仅支持单一写死端点
- 执行失败无 `ExecutionReport` 或无用户可见错误
