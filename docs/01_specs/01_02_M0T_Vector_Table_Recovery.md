# 01_02 M0-T Vector Table → Real Table

## Summary

紧急尖兵：将画册中**由矢量曲线构成的伪表格**识别为结构数据，替换为真正的 InDesign 表格，套用文档中**已有**的 Table Style，并设置表头行与表尾行。

优先级：**高于**通用选区微调主线的并行尖兵；可与 M0 脚手架共享面板 / 供应商 / 协议校验，但验收独立。

## User Decision Lock

- 交互主路径：选中矢量组合对象；插件自动导出该选区图像给视觉模型（非「只选中无图」或「只贴图无选区」）。
- 文档内**已有**可用 Table Style 名称；应用时由用户在预览中确认或选择样式名。

## Primary Workflow

1. 用户选中伪表矢量组（Group / Compound 等）。
2. 插件读取页面索引与 `bounds`，将选区栅格化为 PNG（或等价位图）。
3. 多模态模型返回 `TableDraft` JSON（行列文本、表头/表尾行数、可选合并单元格）。
4. 面板展示可编辑预览；用户可改字、改头/尾行数、选择已有 `tableStyleName`。
5. 用户确认「替换」后，executor 白名单执行：建表 → 写单元格 → 设头/尾行 → 套表样式 → 删除或移走原矢量选区。
6. 整次替换应可 Undo（或明确文档限制）。

## In Scope

- 选区 bounds + 自动截图识别
- 预览编辑后再写入
- `headerRowCount` / `footerRowCount`
- `applyTableStyle` 使用文档已有样式名
- 手动粘贴补充截图（识别不准时的兜底）

## Out of Scope (this spike)

- 全书批量表转换
- 自动新建复杂表样式（只用已有）
- 单元格样式精细映射、斜线表头艺术字还原
- 无选区的整页盲识别

## Protocol Additions

见 [`00_04_JSON_Protocol.md`](../00_core/00_04_JSON_Protocol.md) 中 `op: recover_table`、`TableDraft`、表相关白名单命令。

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| T1 | 选中矢量组后可导出选区预览图 | 面板缩略图 |
| T2 | 视觉识别返回可编辑行列数据 | 预览表格与源图对照 |
| T3 | 可设置 ≥1 表头行与 ≥0 表尾行并写入宿主 | 表头/表尾行属性正确 |
| T4 | 成功 `applyTableStyle` 到用户指定的已有样式名 | 样式面板可见应用结果 |
| T5 | 新表位置/尺寸对齐原选区 bounds（允许小误差） | 前后叠图或坐标记录 |
| T6 | 原矢量组被移除或移出正文层 | 页面上只留真表 |
| T7 | 非法/缺样式名时 fail-closed，不半写入 | 错误码 + 文档未残缺表 |
| T8 | 识别错误时可粘贴补图或手改预览后成功替换 | 一次纠正路径演示 |

## Fail Criteria

- 无视觉输入仅靠路径几何猜字
- 模型自由脚本直接改文档
- 强制新建表样式而忽略文档已有样式
