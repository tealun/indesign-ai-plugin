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
| `op` | yes | `analyze_and_plan` \| `apply_commands` \| `ping` |
| `styleProfile` | no | M0 可空对象；后期扩展 |
| `snapshot` | yes for analyze | 选区打包结果 |
| `error` | response | 失败时非 null；成功为 null |

## DocumentSnapshot (selection pack)

最小字段（M0）：

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
      "bounds": { "x": 40, "y": 60, "w": 220, "h": 400 },
      "spaceBefore": 0,
      "spaceAfter": 6
    }
  ]
}
```

规则：图层数据打包必须可逆映射到宿主对象 id；无法解析的对象跳过并记入 warnings，不中断整次请求。

## LayoutCommand Whitelist (M0)

仅允许下列 `type`。未知 type → 校验失败 → **不执行任何写入**（apply 批处理采用 fail-closed：发现非法命令则整批拒绝；若已开始执行的策略见 Executor）。

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
| `createTextFrame` | `pageIndex`, `bounds`, `text?` |
| `moveResizeFrame` | `targetId`, `bounds` |

模型响应示例：

```json
{
  "protocolVersion": "0.1",
  "requestId": "uuid",
  "commands": [
    { "type": "setLeading", "targetId": "tf_1", "leading": 17 },
    { "type": "createParaStyle", "name": "Body-Tight", "props": { "fontSize": 10.5, "leading": 17 } },
    { "type": "applyParaStyle", "targetId": "tf_1", "name": "Body-Tight" }
  ],
  "rationale": ["行距略增以改善内页灰区"],
  "error": null
}
```

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
- 执行中单条失败 → `ExecutionReport.results[i].ok=false`，默认**停止后续指令**，已成功条目依赖 Undo 由用户处理；报告必须列出已执行与未执行列表。

## ExecutionReport

```json
{
  "requestId": "uuid",
  "ok": false,
  "results": [
    { "index": 0, "type": "setLeading", "ok": true },
    { "index": 1, "type": "applyParaStyle", "ok": false, "error": { "code": "EXECUTE_ERROR", "message": "style missing" } }
  ],
  "stoppedAt": 1
}
```

## Compatibility

- 未来后端返回相同 `commands` / `error` 形状。
- 新增命令只能追加 type，并同步更新本文件与 executor 白名单；旧面板遇未知 type 必须 fail-closed。
