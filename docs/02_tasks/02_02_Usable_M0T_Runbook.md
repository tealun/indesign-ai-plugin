# 02_02 Usable M0-T Runbook (v0.2)

给你自己马上用的最短路径。

## 安装

1. 本机：`npm install && npm run build`
2. 打开 **UXP Developer Tool** + **InDesign 2024+**
3. Add Plugin → 选仓库 `dist/manifest.json` → Load（建议 Watch）
4. 菜单/面板中打开 **InDesign AI**

## 配置

- Provider：一般选 `OpenAI Compatible / 中转`
- Base URL：你的中转，例如 `https://xxx/v1`（需兼容 chat/completions + 识图）
- Model：必须支持图像输入
- API Key：中转密钥

## 操作（对话界面）

1. 「配置」选项卡填好中转 URL / Key / 识图 Model 并保存  
2. 打开画册，选中矢量表组合  
3. 在对话里发送：`读取选区` → `识别表格` → 下方选表样式 → `替换为真表`（或 `用样式名替换`）  
4. 也可用快捷短语按钮；识别不准点「补图」  

## 若失败

- 未开文档时不会再硬报「读取表样式失败」；打开文档后说「有哪些表样式」刷新  
- 导出失败：确认选中的是页面对象（Group/图形）  
- 识别乱：补图后再识别  
- 预检漂移：对象被挪过 → 重新读取选区  
- 替换半成功：Undo  

## 版本

插件 `0.2.1`：对话主界面 + 配置选项卡；M0-T 闭环可用。
