# 00_06 Tech Stack

Locked for scaffolding (2026-11-12). Changing versions here requires updating `package.json` / `tsconfig` and this file together.

## Runtime host

| Item | Choice |
| --- | --- |
| App | Adobe InDesign **2024+** (`host.minVersion` **19.0.0**) |
| Extension model | UXP plugin panel (`manifestVersion` 5) |
| Load tool | Adobe UXP Developer Tool → load `dist/` |

## Panel application

| Item | Choice | Why |
| --- | --- | --- |
| Language | **TypeScript** (strict) | 协议类型与白名单可静态约束 |
| UI | **原生 UXP HTML/CSS + TS**（不引入 React / Spectrum Web Components） | M0-T 优先；减少 SWC/React 版本锁；后续可换 |
| Bundle | **esbuild** → `dist/main.js` | 构建快、配置薄 |
| Module layout | `plugin/src/{ui,selection,capture,protocol,providers,executor,settings,types,transport}` | 对齐 [`00_02_Architecture.md`](00_02_Architecture.md) |
| Settings storage | `localStorage`（面板本机；Key 脱敏展示） | 无后端阶段够用 |
| Tests | **Node + tsx** 跑纯协议/校验单测（不依赖 InDesign） | CI 可验白名单与行列不变量 |
| Package manager | npm | 与环境一致 |

## Out of scaffold scope

- React / SWC UI
- 统一后端服务
- 真实 InDesign DOM 调用的完整实现（先 stub + 可替换端口）

## Commands

```bash
npm install
npm run typecheck
npm run build
npm test
npm run watch   # 可选：监听重建 dist/
```

UDT 加载目录：仓库根下 `dist/`（含 `manifest.json`、`index.html`、`main.js`）。
