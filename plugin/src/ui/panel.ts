import { listProviders } from "../providers/registry.js";
import { loadSettings, maskApiKey, saveSettings } from "../settings/store.js";
import type { ProviderSettings, ProviderType } from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";
import { runCommandBatch } from "../executor/runBatch.js";
import { buildTableReplaceCommands } from "../protocol/buildTableReplaceCommands.js";
import { PROTOCOL_VERSION } from "../types/protocol.js";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function readForm(root: HTMLElement): ProviderSettings {
  const current = loadSettings();
  const q = (id: string) =>
    (root.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)
      ?.value ?? "";
  return {
    provider: (q("provider") as ProviderType) || current.provider,
    baseUrl: q("baseUrl"),
    apiKey: q("apiKey") || current.apiKey,
    model: q("model"),
    timeoutMs: Number(q("timeoutMs")) || current.timeoutMs,
    temperature: Number(q("temperature")) || current.temperature,
  };
}

export function mountPanel(root: HTMLElement): void {
  const settings = loadSettings();
  root.innerHTML = "";
  root.className = "panel-root";

  const status = el("p", { id: "status", className: "status" }, [
    `框架已加载 · protocol ${PROTOCOL_VERSION} · stub host`,
  ]);

  const providerOptions = listProviders().map((p) =>
    el(
      "option",
      { value: p.id, ...(p.id === settings.provider ? { selected: "selected" } : {}) },
      [`${p.label}${p.vision ? " (vision)" : ""}`],
    ),
  );

  const form = el("div", { className: "card" }, [
    el("h2", {}, ["供应商设置"]),
    el("label", {}, [
      "Provider",
      el("select", { id: "provider" }, providerOptions),
    ]),
    el("label", {}, [
      "Base URL",
      el("input", {
        id: "baseUrl",
        type: "text",
        value: settings.baseUrl,
        placeholder: "https://relay.example/v1",
      }),
    ]),
    el("label", {}, [
      `API Key${settings.apiKey ? ` (${maskApiKey(settings.apiKey)})` : ""}`,
      el("input", {
        id: "apiKey",
        type: "password",
        placeholder: settings.apiKey ? "•••• 留空则保持原 Key" : "sk-...",
      }),
    ]),
    el("label", {}, [
      "Model",
      el("input", { id: "model", type: "text", value: settings.model }),
    ]),
    el("label", {}, [
      "Timeout (ms)",
      el("input", {
        id: "timeoutMs",
        type: "number",
        value: String(settings.timeoutMs),
      }),
    ]),
    el("label", {}, [
      "Temperature",
      el("input", {
        id: "temperature",
        type: "number",
        step: "0.1",
        value: String(settings.temperature),
      }),
    ]),
  ]);

  const saveBtn = el("button", { id: "saveSettings", className: "primary" }, [
    "保存设置",
  ]);
  saveBtn.addEventListener("click", () => {
    const next = readForm(root);
    if (!(root.querySelector("#apiKey") as HTMLInputElement).value) {
      next.apiKey = loadSettings().apiKey;
    }
    saveSettings(next);
    status.textContent = `已保存 · provider=${next.provider} · key=${maskApiKey(next.apiKey)}`;
  });

  const dryRunBtn = el("button", { id: "dryRunTable" }, ["试跑表替换批处理 (stub)"]);
  dryRunBtn.addEventListener("click", async () => {
    const built = buildTableReplaceCommands({
      pageIndex: 0,
      bounds: { x: 36, y: 80, w: 480, h: 220, unit: "pt" },
      draft: {
        headerRowCount: 1,
        footerRowCount: 1,
        rows: [
          ["品名", "规格", "数量"],
          ["A", "10mm", "2"],
          ["合计", "", "2"],
        ],
      },
      tableStyleName: "Catalog-Table",
      selectionIds: ["sel_demo_group"],
    });
    if (!built.ok) {
      status.textContent = `预检失败: ${built.error.message}`;
      return;
    }
    const report = await runCommandBatch({
      requestId: crypto.randomUUID(),
      commands: built.commands,
      host: createStubHost(),
    });
    status.textContent = `stub 批处理 ok=${report.ok} steps=${report.results.length} created=${JSON.stringify(report.created ?? {})}`;
  });

  const modules = el("div", { className: "card muted" }, [
    el("h2", {}, ["模块骨架"]),
    el("ul", {}, [
      el("li", {}, ["selection/ — 选区 snapshot（待接宿主）"]),
      el("li", {}, ["capture/ — 选区导出（待接宿主）"]),
      el("li", {}, ["protocol/ — 白名单 / TableDraft 校验 ✓"]),
      el("li", {}, ["providers/ — OpenAI 兼容 / Claude / Gemini ✓"]),
      el("li", {}, ["executor/ — 批处理 + stub host ✓"]),
      el("li", {}, ["settings/ — 本机配置 ✓"]),
    ]),
  ]);

  root.append(
    el("header", { className: "hero" }, [
      el("h1", {}, ["InDesign AI"]),
      el("p", {}, ["书刊内页助手 · M0-T 框架"]),
    ]),
    form,
    el("div", { className: "actions" }, [saveBtn, dryRunBtn]),
    modules,
    status,
  );
}
