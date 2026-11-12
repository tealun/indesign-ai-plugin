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

## 操作

1. 在画册页选中矢量表组合  
2. ① 读取选区  
3. ② 导出并识别（同意外发图像）  
4. 在预览里改错字、确认头/尾行数  
5. 下拉选择文档里**已有**表样式  
6. ③ 确认替换为真表  

## 若失败

- 导出失败：确认选中的是页面对象（Group/图形），文档已保存过至少一次更稳  
- 识别乱：用「粘贴/选择补图」换更清晰截图再识别  
- 预检漂移：对象被挪过 → 重新 ①②  
- 替换半成功：Undo；原矢量按设计应仍在  

## 版本

插件 `0.2.0`：M0-T 闭环可用；通用选区微调（字号等）尚未启用。
