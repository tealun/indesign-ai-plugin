# 00_04 JSON Protocol

面板、模型与未来后端之间的标准化数据桥梁。所有跨边界载荷必须可 JSON Schema 校验。

## Envelope

```json
{
  "protocolVersion": "0.1",
  "requestId": "uuid",
  "op": "analyze_and_plan",
  "locale": "zh-CN",
  "styleProfile": {},
  "snapshot": {},
  "error": null
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `protocolVersion` | yes | M0 = `0.1` |
| `requestId` | yes | 关联请求与 `ExecutionReport` |
| `op` | yes | `analyze_and_plan` \| `apply_commands` \| `recover_table` \| `ping` |
| `styleProfile` | no | M0 可空对象；后期扩展 |
| `snapshot` | yes for analyze / recover | 选区打包结果 |
| `image` | recover_table | 选区栅格（data URL 或实现约定的本地引用）；可与用户粘贴补图合并。发送前须满足隐私提示与图像上限，见 [`00_03_AI_Providers.md`](00_03_AI_Providers.md) |
| `error` | response | 失败时非 null；成功为 null |

## Coordinate units

所有 `bounds` 数值单位为 **文档点 pt**（InDesign 内部点，1 pt = 1/72 in）。导出选区图时另记像素尺寸与 PPI，不与 `bounds` 混用。

```json
"bounds": { "x": 36, "y": 80, "w": 480, "h": 220, "unit": "pt" }
```

`unit` 字段固定为 `"pt"`；缺省时按 `pt` 解释。

## DocumentSnapshot (selection pack)

最小字段：

```json
{
  "documentName": "issue-03.indd",
  "pageIndex": 2,
  "selection": [
    {
      "id": "tf_1",
      "type": "textFrame",
      "storyText": "...",
      "appliedParaStyle": "Body",
      "appliedCharStyle": null,
      "fontFamily": "Source Han Serif",
      "fontSize": 10.5,
      "leading": 16,
      "alignment": "leftJustify",
      "bounds": { "x": 40, "y": 60, "w": 220, "h": 400, "unit": "pt" },
      "spaceBefore": 0,
      "spaceAfter": 6
    },
    {
      "id": "g_1",
      "type": "group",
      "bounds": { "x": 36, "y": 80, "w": 480, "h": 220, "unit": "pt" },
      "childCount": 48,
      "notes": "vector fake table candidate"
    }
  ]
}
```

| `type` | Minimal fields | Used by |
| --- | --- | --- |
| `textFrame` | text/style/bounds as above | M0；亦作表的父容器 |
| `group` | `id`, `bounds`, `childCount?` | M0-T 矢量组合 |
| `graphic` | `id`, `bounds` | 单块图形/曲线对象 |

规则：图层数据打包必须可逆映射到宿主对象 id；无法解析的对象跳过并记入 warnings，不中断整次请求。`removeObjects.ids` 只能引用**替换批次锁定**的 id（见预检），且 apply 时必须仍可解析。

## LayoutCommand Whitelist (M0)

仅允许下列 `type`。未知 type → 校验失败 → **不执行任何写入**（整批 fail-closed）。

| type | params (minimal) |
| --- | --- |
| `setFontSize` | `targetId`, `size` |
| `setLeading` | `targetId`, `leading` |
| `setAlignment` | `targetId`, `alignment` |
| `setSpaceBeforeAfter` | `targetId`, `before?`, `after?` |
| `createParaStyle` | `name`, `props` |
| `applyParaStyle` | `targetId`, `name` |
| `createCharStyle` | `name`, `props` |
| `applyCharStyle` | `targetId`, `name` |
| `createTextFrame` | `pageIndex`, `bounds`, `text?` → 成功后产生 `frameId` |
| `moveResizeFrame` | `targetId`, `bounds` |

### LayoutCommand Whitelist (M0-T additions)

| type | params (minimal) |
| --- | --- |
| `createTable` | `parentFrameId`, `bodyRowCount`, `columnCount`, `headerRowCount`, `footerRowCount` → 成功后产生 `tableId` |
| `writeCellText` | `tableId`, `row`, `column`, `text` |
| `applyTableStyle` | `tableId`, `name`（必须是文档已有表样式） |
| `removeObjects` | `ids[]`（**唯一**删除原矢量伪表的路径） |

说明：

- **宿主约束：** InDesign 表必须位于文本框/Story 内。禁止「仅 pageIndex+bounds、无父框」的建表。M0-T 先 `createTextFrame`（bounds=原选区），再 `createTable(parentFrameId=…)`。
- **删除路径唯一性：** 禁止在 `createTable` / `createTextFrame` 上隐式删除原对象；只通过批末成功后的 `removeObjects`。
- **`setHeaderFooterRowCount`：** **不在 M0-T 主路径**。头/尾行数在 `createTable` 创建时一次给定。该 type 若出现在旧草稿中 → `VALIDATION_ERROR`（M0-T）或留待后续里程碑再启用。

## Command result binding

批内后续命令通过符号引用先前创建结果：

| Symbol | Meaning |
| --- | --- |
| `$created.frameId` | 本批最近一次成功的 `createTextFrame` 返回 id |
| `$created.tableId` | 本批最近一次成功的 `createTable` 返回 id |

Executor 在每条成功的创建类命令后写入 `ExecutionReport.created`；解析参数时替换 `$created.*`。未解析到 → `VALIDATION_ERROR` / `EXECUTE_ERROR`，停止后续（含 `removeObjects`）。

## Table row math (normative)

`TableDraft.rows` 是**含表头与表尾**的完整矩阵：

```text
rows.length === headerRowCount + bodyRowCount + footerRowCount
header rows  = rows[0 .. headerRowCount)
body rows    = rows[headerRowCount .. headerRowCount+bodyRowCount)
footer rows  = rows[headerRowCount+bodyRowCount .. rows.length)
bodyRowCount = rows.length - headerRowCount - footerRowCount
```

`writeCellText.row` / `.column`：**0-based**，相对**整张表**（含已在创建时声明的表头/表尾行）。  
即 `row` 与 `TableDraft.rows` 的行下标一致；创建时宿主行数 = `rows.length`，其中前 `headerRowCount` 行为表头，末 `footerRowCount` 行为表尾。

约束（M0-T）：

- `headerRowCount >= 1`
- `footerRowCount >= 0`
- `bodyRowCount >= 1`
- 每行 `columnCount` 相同；`columnCount >= 1`
- 不满足 → `VALIDATION_ERROR`，不发 `apply_commands`

示例：`headerRowCount=1`, `footerRowCount=1`, `rows` 3 行 → `bodyRowCount=1`。

## TableDraft (recover_table model output)

```json
{
  "protocolVersion": "0.1",
  "requestId": "uuid",
  "tableDraft": {
    "headerRowCount": 1,
    "footerRowCount": 1,
    "suggestedTableStyleName": "Catalog-Table",
    "rows": [
      ["品名", "规格", "数量"],
      ["A", "10mm", "2"],
      ["合计", "", "2"]
    ]
  },
  "confidence": 0.86,
  "warnings": [],
  "error": null
}
```

**`merges`：** M0-T **忽略**。若模型返回 `merges`，解析器丢弃并写入 `warnings`；不进入白名单、不实现合并单元格。

面板将 `TableDraft` 转为用户可编辑预览；用户确认后由面板（非模型）发出 `apply_commands`。

## M0-T table replace transaction

表替换批处理必须按下列顺序，且满足预检：

1. **Preflight（零写入）**
   - 校验行列不变量与 `writeCellText` 索引范围
   - 确认 `tableStyleName` 在文档表样式列表中存在
   - 锁定 `selectionIds` + 各对象 `bounds` 快照（识别/确认时采集）
   - **Apply 时复检：** 每个 id 仍可在文档中解析；中心点或 bounds 相对锁定快照漂移 ≤ **2 pt**（可配置，默认 2）；失败 → `VALIDATION_ERROR`，整批不开始
   - 任一项失败 → **整批不开始**（T7）
2. `createTextFrame`（`bounds` = 原选区，单位 pt）→ `$created.frameId`
3. `createTable`（`parentFrameId: "$created.frameId"`，创建时带齐 `headerRowCount` / `footerRowCount` / `bodyRowCount` / `columnCount`）→ `$created.tableId`
4. `writeCellText`（`tableId: "$created.tableId"`，按 `rows` 全量写入）
5. `applyTableStyle`（`tableId: "$created.tableId"`）
6. **仅当 2–5 全部 ok** → `removeObjects`（删除原矢量）

中途失败：

- **停止后续指令**（尤其不得执行 `removeObjects`）
- 报告已执行 / 未执行列表与 `created`
- 已写入的新框/表保留，依赖宿主 **Undo**；原矢量仍在

## Error Model

```json
{
  "code": "PROVIDER_AUTH | PROVIDER_TIMEOUT | PROVIDER_HTTP | PARSE_ERROR | VALIDATION_ERROR | EXECUTE_ERROR | CANCELLED",
  "message": "human readable",
  "details": {},
  "retryable": false
}
```

双向要求：

- 上行：snapshot 构建失败 → 面板本地 `error`，不发网络请求。
- 下行：供应商 HTTP / 解析 / 校验失败 → 统一 `error`，executor 不调用。
- 通用 M0 批处理：执行中单条失败 → 停止后续；已成功条目依赖 Undo。
- M0-T 表替换：另遵守上一节事务顺序与预检。

## ExecutionReport

```json
{
  "requestId": "uuid",
  "ok": false,
  "created": {
    "frameId": "tf_new_1",
    "tableId": "table_1"
  },
  "results": [
    { "index": 0, "type": "createTextFrame", "ok": true, "createdId": "tf_new_1" },
    { "index": 1, "type": "createTable", "ok": true, "createdId": "table_1" },
    { "index": 2, "type": "applyTableStyle", "ok": false, "error": { "code": "EXECUTE_ERROR", "message": "style apply failed" } }
  ],
  "stoppedAt": 2,
  "removeObjectsSkipped": true
}
```

## Compatibility

- 未来后端返回相同 `commands` / `error` / `tableDraft` 形状。
- 新增命令只能追加 type，并同步更新本文件与 executor 白名单；旧面板遇未知 type 必须 fail-closed。
