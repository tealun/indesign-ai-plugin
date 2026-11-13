# 01_02 M0-T Vector Table → Real Table

## Summary

紧急尖兵：将画册中**由矢量曲线构成的伪表格**识别为结构数据，替换为真正的 InDesign 表格，套用文档中**已有**的 Table Style，并设置表头行与表尾行。

优先级：**高于**通用选区微调主线的并行尖兵；可与 M0 脚手架共享面板 / 供应商 / 协议校验，但验收独立。

## User Decision Lock

- 交互主路径：选中矢量组合对象；插件自动导出该选区图像给视觉模型（非「只选中无图」或「只贴图无选区」）。
- 文档内**已有**可用 Table Style 名称；应用时由用户在预览中确认或选择样式名。

## Primary Workflow

1. 用户选中伪表矢量组（Group / Compound 等）。
2. 插件读取页面索引与 `bounds`（**pt**），将选区栅格化为 PNG（遵守最长边/PPI 上限）。
3. **发送前**面板明示：选区图像将发往当前配置的 API Base URL；用户确认后才请求。
4. 多模态模型返回 `TableDraft` JSON（行列文本、表头/表尾行数；`merges` 忽略）。
5. 面板展示可编辑预览；用户可改字、改头/尾行数、从文档已有列表选择 `tableStyleName`。
6. 用户确认「替换」后：**预检**（样式存在、行列不变量、选区 id 仍在且 bounds 漂移 ≤ 2pt）→  
   `createTextFrame` → `createTable(parentFrameId)`（创建时带齐头/尾行）→ `writeCellText`* → `applyTableStyle` → **仅成功后** `removeObjects`。
7. 整次替换应可 Undo；中途失败不删原矢量。

## In Scope

- 选区 bounds（pt）+ 自动截图识别（含缩放上限）
- 预览编辑后再写入
- `headerRowCount` / `footerRowCount` 与 `rows` 行列不变量（见 `00_04`）
- 父文本框 + 框内真表（宿主约束）
- `$created.frameId` / `$created.tableId` 批内绑定
- `applyTableStyle` 使用文档已有样式名
- 手动粘贴补充截图（识别不准时的兜底）
- 图像外发明示确认
- Apply 时选区漂移复检

## Out of Scope (this spike)

- 全书批量表转换
- 自动新建复杂表样式（只用已有）
- 单元格合并（`merges`）、单元格样式精细映射、斜线表头艺术字还原
- 无选区的整页盲识别
- `createTable` 内隐式删除原对象
- 将原对象「移到隐藏层」（只删除）
- `setHeaderFooterRowCount` 作为主路径步骤

## Protocol Additions

见 [`00_04_JSON_Protocol.md`](../00_core/00_04_JSON_Protocol.md) 中 `op: recover_table`、`TableDraft`、表相关白名单命令与事务顺序。

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| T1 | 选中矢量组后可导出选区预览图 | 面板缩略图 |
| T2 | 视觉识别返回可编辑行列数据 | 预览表格与源图对照 |
| T3 | 创建时即具备 ≥1 表头行与 ≥0 表尾行，并写入宿主 | 表头/表尾行属性正确 |
| T4 | 成功 `applyTableStyle` 到用户指定的已有样式名 | 样式面板可见应用结果 |
| T5 | **原位替换**：父框左上角与**宽度**对齐原选区；高度可向下略增；表宽强制贴合框宽，列均分；单元格去掉软换行 | 完成后无需双击边框即可看见表 |
| T6 | 原矢量组被 **删除**（非移层） | 页面上只留真表 |
| T7 | 缺样式名、行列不合法或选区漂移超限时预检失败，**零写入**；中途失败不执行 `removeObjects` | 错误码 + 无新表或原矢量仍在 |
| T8 | 识别错误时可粘贴补图或手改预览后成功替换 | 一次纠正路径演示 |
| T9 | 发送识别请求前有外发图像明示，可取消 | UI 文案/取消路径 |
| T10 | 表位于新文本框内；批内 `$created.*` 绑定成功 | 对象结构检查 / ExecutionReport.created |
| T11 | 超大选区图被缩放并产生 warning 后仍可识别或明确失败 | 日志/warnings |

## Fail Criteria

- 无视觉输入仅靠路径几何猜字
- 模型自由脚本直接改文档
- 强制新建表样式而忽略文档已有样式
- 无父文本框的「裸表」创建路径
