# Evolution Ledger

## 2026-11-13 — 落实 Agent/工具提示词分层（88_03）

- **Change**: `promptGuards` 写入伪表 Agent；宿主 `assessHeaderLanguage` 提示可能丢中文；runtimeContext 带 `draftQualityHint`。
- **Guardrail**: 决策层不塞 OCR 长文；质量告警只建议补图/重识别，不阻断 replace；附录变更要涨 `PROMPT_GUARDS_VERSION` 并过关键词测试。

## 2026-11-13 — 识图表头丢掉中文

- **Symptom**: 选区图表头有「货号 / Code NO.」等中英叠字，识别预览与真表只剩英文。
- **Root cause**: 丢字发生在模型 `TableDraft`（预览已无中文），不是写单元格/`normalizeCellText`；中英叠字表头 vision 模型常「简化」成英文，且原提示示例全英文、约束过弱。
- **Fix**: 统一 `recoverPrompt`（双语示例 + VERBATIM/CJK 规则）；识图 temperature 钳到 ≤0.1；Anthropic/Gemini 的 recover 也走同一提示。
- **Guardrail**: 识图提示必须含中英叠字示例与「禁止只留英文」；验收对照选区图 header 是否含 CJK。

## 2026-11-13 — Thinking 三点不动 +「识别中」重复 + UI 过方

- **Symptom**: 忙碌态三点不跳动；已有「识别中…」仍叠一层三点；气泡方正，远逊官方 AI 助手。
- **Root cause**: InDesign UXP 忽略 CSS `@keyframes`；`setBusy` 的 thinking 与文案状态并存；圆角仅 4px 且每条带「顾问/你」标签。
- **Fix**: `setInterval` 驱动三点透明度；去掉「识别中…/写入中…」；对齐 Adobe AI Assistant（圆角气泡、去角色标签、淡边框）。
- **Guardrail**: UXP 动效不要依赖 `@keyframes`；busy 指示与文字进度二选一；圆角用 12–18px，勿用 `999px` pill（UXP 会坏）。

## 2026-11-13 — 原位替换：框过大且仍需双击才见表；单元格软换行撑破

- **Symptom**: 框被加得很宽很长仍看不见表，需双击边框节点；单元格内软换行把格子撑满。
- **Root cause**: 按列数强制加宽 + `syncFrameToTable` 跟表宽走；OCR 软换行原样写入。
- **Fix**: 选区宽度原位锁定；`fitTableToFrame` 让表宽/列宽贴合框；高度仅必要时向下增；`normalizeCellText` 将软换行转为硬回车 `\r`（非空格）。
- **Guardrail**: 替换以选区 footprint 为准（定宽），表适配框，而不是框去追表；单元格换行用硬回车保留多行语义。

## 2026-11-13 — bodyRowCount must be >= 1

- **Symptom**: 小表（表头+1 行数据）识别报 `bodyRowCount must be >= 1`。
- **Root cause**: 模型常把 `headerRowCount` 标成整表行数（如 2 行表标 header=2）。
- **Fix**: `normalizeHeaderFooterCounts` 在校验前钳制，保证至少 1 行正文；提示词强调 2 行表只能 header=1。
- **Guardrail**: 不得因 header/footer 误标直接失败；仅当 `rows.length < 2` 才拒绝。

## 2026-11-13 — 多对象未编组导出失败 + 无进行中反馈

- **Symptom**: 选中大量未编组 graphic 时选区图错误/空白；点发送或确认后聊天无即时反馈，只能干等结果。
- **Root cause**: `exportFile` 只导出 `targets[0]`；忙碌态没有聊天气泡级指示。
- **Fix**: 多对象先 duplicate→group→export→删除副本；`setBusy` 显示跳动三点 thinking；选区摘要改为「N 个对象」。
- **Guardrail**: 多选导出不得只取第一个 pageItem；任何 busy 且非外发等待都应有 thinking 指示。

## 2026-11-13 — 真表写完框内空白，双击右侧中点才显现

- **Symptom**: 面板显示完成，文本框看似空；双击右侧中间手柄（Fit frame to content）后内容出现。
- **Root cause**: `442ef9e` 为「锁定选区宽」去掉了按列加宽与 `fitFrameToTable`；伪表选区常约 86×16pt，多列表被挤在过窄框内，视觉上像空框。
- **Fix**: `expandBoundsForTable` 恢复按列最小宽（42pt）与行高扩展；样式应用后 `syncFrameToTable` 以左上角为锚、只增不减。
- **Guardrail**: 定位保左上角；可见性优先于「宽高与选区完全一致」。

## 2026-11-13 — 安全/隔离审计 + 界面啰嗦

- **Findings**: 切文档时 chat-log 串台；`documentPath` 进 localStorage；对话堆满步骤旁白。
- **Fix**: 切文档重建对话；不落盘/不外发 path；文案只保留结果与决策点（审计见 `99_06`）。
- **Guardrail**: UI 不说「系统正在准备什么」；多文档必须视觉隔离；文件系统路径不得进 memory/模型载荷。

## 2026-11-13 — 外发确认回显 URL/端口泄密

- **Symptom**: 确认外发文案与识图进度把完整 Base URL / host 打进对话，截图或以后官方托管会暴露基础设施。
- **Root cause**: 隐私门闩实现时把「明示发往何处」误做成「回显 raw endpoint」。
- **Fix**: 对话只说「发往配置中的识图通道」；进度文案去掉 `baseUrl`；规范写入 `00_03` / planning ledger。
- **Guardrail**: 任何面向用户的消息、日志默认字段禁止输出 baseUrl/host/port；核对端点只走「配置」页。

## 2026-11-13 — 外发确认 chip 点了没反应

- **Symptom**: 伪表恢复识图时弹出「确认外发/取消」，对话气泡里的选项点击无任何反馈。
- **Root cause**: 确认控件嵌在 `chat-log` 消息气泡内；InDesign UXP 对滚动区内动态 chip 的 click 不可靠。同时 `busy===true` 时 Enter 被直接丢弃，文字确认路径也易失效。底部「识别表格」等 chip 本身是可用的。
- **Fix**: 外发门闩期间把「确认外发/取消」渲染到底部 chip 栏（与识别按钮同一套 `chip()`）；消息只保留说明文案；Enter 在 `pendingEgress` 时放行；乱点其它话术时给出提示。
- **Guardrail**: 选区图外发确认的主控件必须放在面板底部固定 chip 栏，不要只依赖聊天气泡内按钮。隐私门禁本身保留（AGENTS #7 / 00_03）。
- **Necessity note**: 确认不可去掉——图像发往用户配置的 Base URL；同会话同地址只问一次已是折中。
