# Evolution Ledger

## 2026-11-13 — 外发确认 chip 点了没反应

- **Symptom**: 伪表恢复识图时弹出「确认外发/取消」，对话气泡里的选项点击无任何反馈。
- **Root cause**: 确认控件嵌在 `chat-log` 消息气泡内；InDesign UXP 对滚动区内动态 chip 的 click 不可靠。同时 `busy===true` 时 Enter 被直接丢弃，文字确认路径也易失效。底部「识别表格」等 chip 本身是可用的。
- **Fix**: 外发门闩期间把「确认外发/取消」渲染到底部 chip 栏（与识别按钮同一套 `chip()`）；消息只保留说明文案；Enter 在 `pendingEgress` 时放行；乱点其它话术时给出提示。
- **Guardrail**: 选区图外发确认的主控件必须放在面板底部固定 chip 栏，不要只依赖聊天气泡内按钮。隐私门禁本身保留（AGENTS #7 / 00_03）。
- **Necessity note**: 确认不可去掉——图像发往用户配置的 Base URL；同会话同地址只问一次已是折中。
