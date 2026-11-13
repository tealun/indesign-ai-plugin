# 88_03 Agent / Tool 提示词优化原则

来源：2026-11-13 中英叠字表头被模型「简化」成英文（选区图仍有中文，识别预览已无）等实战教训。  
状态：规划决定；实现按切片推进，先改工具层提示，再改决策 Agent。

## 分层：别把两种模型工作混进同一段提示

| 层 | 职责 | 文件 | 优化重心 |
| --- | --- | --- | --- |
| **决策 Agent** | 理解用户意图 → 选 `taskId` / `actions` / 短 `reply` | `plugin/src/agent/catalog.ts` + `tasks.ts` | 路由、禁令、状态机、何时澄清 |
| **工具 / OCR** | 从图像抽出 `TableDraft`（保真） | `plugin/src/providers/recoverPrompt.ts` | 逐字抄录、双语、符号、行列不变量 |
| **宿主校验** | 钳制非法输出 | `tableDraft.ts` / preflight | 不信任模型自我约束 |

原则：**Agent 不负责 OCR 细则；OCR 提示不负责聊天话术。**  
把「禁止丢中文」塞进 Agent system prompt 帮不上 `recognize_table`——识图走的是另一条 prompt。

## 从这次失败抽象出的五条规则

### 1. 示例必须像真实失败样本，禁止玩具示例

- 坏：`[["col1","col2"],["a","b"]]` → 模型学会「英文、短、干净」。
- 好：`[["货号\\nCode NO.","测量范围\\nMeasuring Range mm"],["141-262","0-150"]]`。
- Agent 侧同理：`replace_table` 的 styleName 示例用 `[货号信息表]`，不要用 `"StyleA"`。

### 2. 按任务类型写清「保真 vs 改写」策略

| 任务 | 策略 | 温度 |
| --- | --- | --- |
| 识图 / 抽表 / 抄单元格 | **VERBATIM**：禁止翻译、删语种、title-case、「清理」 | ≤ 0.1 |
| 决策 / 路由 / 中文 reply | 可简洁改写；不编造能力 | 可用配置值（如 0.2） |
| lessons 沉淀 | 短、可复用、无密钥/无 URL | 同决策 |

一条模糊的 “keep faithful to the image language” **不够**；要写：  
「中英叠字同格用 `\n`；不得只留英文；不得翻译。」

### 3. 负面约束来自 evolution-ledger，不是空想

每条已验证 bug 应收成 **1 行硬规则 + 1 个反例**，写进对应层提示：

| 已发生 | 提示规则（摘要） |
| --- | --- |
| 2 行表 `headerRowCount=2` | tiny 2-row → header=1, footer=0 |
| 中英叠字丢中文 | bilingual → 同格保留 CJK+EN |
| hasDraft 仍再识别 | 替换路径禁止 recognize/lock |
| 外发回显 URL | Agent reply 禁止输出 baseUrl/host/port |

**流程**：`docs/98_evolution/evolution-ledger.md` 修好后 → 同步一条到 `recoverPrompt` 或 `buildM0tPrompt` → 加最小单测断言提示词含关键词。

### 4. Agent 提示要短、状态机要硬；质量验收另挂钩子

决策 Agent 应保持：

- 允许的 actions 白名单
- `hasDraft` / `selectedStyle` / 项目偏好的优先级
- 「重新识别」才可再 recognize
- reply 极简（与 UI 极简决策一致）

不要把长 OCR 手册塞进 Agent。质量问题用 **宿主钩子** 补：

- 识别完成后若表头无 CJK、而用户/项目期望中英（或选区图场景为画册），`reply` 提示「表头可能丢了中文，可补图或重试」——由 host 检测后注入，不单靠模型自觉。
- （可选后续）对 `draft.rows[0]` 做简单 CJK 缺失告警。

### 5. 经验（lessons / project）进 prompt 要结构化，忌散文堆砌

当前 `experience` JSON 已进 user payload，优化方向：

- **偏好类**：`projectPreferredTableStyle`（已有）继续强化。
- **失败类**：短期可把 ledger 中与本 Agent 相关的 3–5 条「勿再犯」编成固定附录（版本化字符串），而不是把整本聊天记录塞进 system。
- **禁止**：把 Base URL、路径、API Key、整页 OCR 原文写进 lessons。

## 建议的提示词骨架（专属 Agent）

```
[角色一句] 伪表恢复专属 Agent…
[硬禁令] 不输出脚本；reply 不泄密 endpoint；无能力不编造
[状态机] hasDraft→只 replace；仅「重新识别」才 recognize
[任务目录] taskCatalogForPrompt() — 短 when/steps/params
[决策优先级] 用户话 > selectedStyle > projectPreferred
[失败附录] 来自 ledger 的 3–5 条勿再犯（可版本号）
[输出形状] 唯一 JSON
```

工具层（`recover_table`）骨架见 `recoverPrompt.ts`：系统保真声明 + 真实双语示例 + 不变量 rules + 低温。

## 落地切片（不一次改完）

1. **已做**：`recoverPrompt` 双语示例 + VERBATIM + temp≤0.1（v0.4.11）。
2. **下一步（Agent）**：`buildM0tPrompt` 增加「识别质量」决策——预览缺语种时建议重试/补图；仍不复制 OCR 长文。
3. **下一步（宿主）**：识别完成后轻量检查表头是否含 CJK（可配置/可关），只影响 `reply` 提示，不阻断替换。
4. **持续**：每次 evolution 条目 → 提示词一行 + 测试断言关键词。

## 非目标

- 不为每个文档动态生成超长 few-shot（成本与泄密风险）。
- 不把官方 Adobe AI 助手的闲聊风格塞进决策 JSON。
- 不靠提高 temperature「更聪明」来改善 OCR。
