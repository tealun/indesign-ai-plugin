import { listProviders } from "../providers/registry.js";
import {
  loadSettings,
  maskApiKey,
  resolveReadySettings,
  saveSettings,
} from "../settings/store.js";
import type {
  AiConnectionMode,
  OpenAiWireApi,
  ProviderSettings,
  ProviderType,
  TableDraft,
} from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";

const PLUGIN_UI_VERSION = "0.4.3";

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* UXP may lack randomUUID */
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

import { runCommandBatch } from "../executor/runBatch.js";
import { buildTableReplaceCommands } from "../protocol/buildTableReplaceCommands.js";
import { readSelectionSnapshot } from "../selection/snapshot.js";
import { exportSelectionPng } from "../capture/exportSelection.js";
import {
  clearLockedSelection,
  getLockedSelection,
  lockSelection,
  selectionSummary,
} from "../host/session.js";
import {
  applyTableStyleToSelection,
  createIndesignHost,
  listTableStyleNames,
  unionBounds,
} from "../host/indesignHost.js";
import { isInDesignRuntime } from "../host/uxpRequire.js";
import { directRecoverTable } from "../transport/direct.js";
import { directAgentTurn } from "../transport/directAgent.js";
import { preflightTableReplace } from "../m0t/preflight.js";
import { validateTableDraft } from "../protocol/tableDraft.js";
import type { AgentAction, AgentChatMessage, AgentRuntimeContext } from "../agent/types.js";
import {
  appendProjectDigest,
  getOrCreateProject,
  loadMemory,
  memorySliceForPrompt,
  recordTaskOutcome,
  rememberNote,
  saveMemory,
} from "../agent/memory/store.js";
import { getActiveDocumentIdentity } from "../host/documentIdentity.js";
import {
  DEFAULT_AGENT_ID,
  getAgent,
  listSpecializedAgents,
  NOOP_USAGE_METER,
} from "../agent/catalog.js";
import { recordAgentOpen, sortAgentsByUsage } from "../agent/usageStore.js";
import { el } from "./dom.js";
import { matchTableStyleName } from "./matchStyle.js";

type Role = "assistant" | "user" | "system";

function getHost() {
  return isInDesignRuntime() ? createIndesignHost() : createStubHost();
}

function readConfigForm(root: HTMLElement): ProviderSettings {
  const current = loadSettings();
  const q = (id: string) =>
    (root.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)
      ?.value ?? "";
  void q("connectionMode"); // reserved; phase-1 always byok
  return {
    connectionMode: "byok" as AiConnectionMode,
    provider: (q("provider") as ProviderType) || current.provider,
    baseUrl: q("baseUrl"),
    apiKey: q("apiKey") || current.apiKey,
    model: q("model"),
    timeoutMs: Number(q("timeoutMs")) || current.timeoutMs,
    temperature: Number(q("temperature")) || current.temperature,
    wireApi: (q("wireApi") as OpenAiWireApi) || current.wireApi || "chat_completions",
  };
}

export function mountPanel(root: HTMLElement): void {
  const settings = loadSettings();
  root.innerHTML = "";
  root.className = "app";

  let imageDataUrl = "";
  let draft: TableDraft | null = null;
  let tableStyles: string[] = [];
  let busy = false;
  /** Session approval: image may be POSTed to this normalized baseUrl. */
  let egressAllowedBaseUrl = "";
  let pendingEgress:
    | { baseUrl: string; resolve: (ok: boolean) => void }
    | null = null;
  /** Per-document chat histories — never share across open files. */
  const chatByProject = new Map<string, AgentChatMessage[]>();
  let activeProjectKey = "no-doc";
  let history: AgentChatMessage[] = [];
  let lastTaskId = "";
  let activeAgentId = DEFAULT_AGENT_ID;
  // Future: swap NOOP_USAGE_METER for a real points meter.
  const usageMeter = NOOP_USAGE_METER;

  const chatLog = el("div", { className: "chat-log", id: "chatLog" });
  const composer = el("textarea", {
    id: "composer",
    className: "composer",
    rows: "2",
    placeholder: getAgent(DEFAULT_AGENT_ID).ui.placeholder,
  }) as HTMLTextAreaElement;
  function addMessage(role: Role, text: string, extra?: HTMLElement): HTMLElement {
    const bubble = el("div", { className: `msg msg-${role}` }, [
      el("div", { className: "msg-role" }, [
        role === "user" ? "你" : role === "system" ? "系统" : "顾问",
      ]),
      el("div", { className: "msg-body" }, [text]),
    ]);
    if (extra) bubble.append(extra);
    chatLog.append(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
    return bubble;
  }

  /** Show capture/补图 inside the chat thread (not a fixed footer preview). */
  function addImageMessage(caption: string, dataUrl: string): void {
    const img = el("img", {
      className: "msg-image",
      alt: caption,
    }) as HTMLImageElement;
    img.src = dataUrl;
    addMessage("assistant", caption, img);
  }

  function setBusy(v: boolean): void {
    busy = v;
    // Keep composer usable while waiting for image-egress confirm/cancel.
    const block = v && !pendingEgress;
    sendBtn.classList.toggle("ctl-disabled", block);
    composer.disabled = block;
  }

  function normalizeBaseUrlKey(baseUrl: string): string {
    return baseUrl.trim().replace(/\/$/, "");
  }

  function describeEgressTarget(baseUrl: string): string {
    try {
      const u = new URL(baseUrl);
      return u.host || baseUrl;
    } catch {
      return baseUrl;
    }
  }

  /**
   * Privacy gate (AGENTS.md / 00_03): image must not leave the host until the
   * user explicitly confirms the destination. Session-scoped per baseUrl.
   */
  function ensureImageEgressAllowed(baseUrl: string): Promise<boolean> {
    const key = normalizeBaseUrlKey(baseUrl);
    if (!key) return Promise.resolve(false);
    if (egressAllowedBaseUrl === key) return Promise.resolve(true);
    if (pendingEgress) {
      return new Promise((resolve) => {
        const prev = pendingEgress!.resolve;
        pendingEgress!.resolve = (ok) => {
          prev(ok);
          resolve(ok);
        };
      });
    }

    return new Promise((resolve) => {
      const settle = (ok: boolean) => {
        if (pendingEgress?.baseUrl !== key) return;
        pendingEgress = null;
        if (ok) egressAllowedBaseUrl = key;
        setBusy(busy);
        resolve(ok);
      };
      pendingEgress = { baseUrl: key, resolve: settle };
      setBusy(busy);

      const host = describeEgressTarget(key);
      const actions = el("div", { className: "chips egress-actions" });
      const okBtn = el("div", { className: "chip", role: "button" }, ["确认外发"]);
      const noBtn = el("div", { className: "chip", role: "button" }, ["取消"]);
      okBtn.addEventListener("click", () => {
        addMessage("user", "确认外发");
        settle(true);
      });
      noBtn.addEventListener("click", () => {
        addMessage("user", "取消");
        settle(false);
      });
      actions.append(okBtn, noBtn);
      addMessage(
        "assistant",
        `选区图/补图将发送到你配置的服务用于识图：\n${host}\n${key}\n确认后才会外发；可取消。`,
        actions,
      );
    });
  }

  async function refreshStylesSilent(): Promise<void> {
    const keep = (styleSelect.value || "").trim();
    try {
      if (!isInDesignRuntime()) {
        tableStyles = ["Catalog-Table"];
      } else {
        tableStyles = await listTableStyleNames();
      }
    } catch {
      tableStyles = [];
    }
    styleSelect.innerHTML = "";
    styleSelect.append(
      el("option", { value: "" }, [
        tableStyles.length ? "（请选择表样式）" : "（打开文档后可刷新样式）",
      ]),
    );
    for (const name of tableStyles) {
      styleSelect.append(el("option", { value: name }, [name]));
    }
    if (keep && tableStyles.includes(keep)) {
      styleSelect.value = keep;
    }
    updateStyleSelectHint();
  }

  function updateStyleSelectHint(): void {
    const need = Boolean(draft) && !(styleSelect.value || "").trim();
    styleSelect.classList.toggle("need", need);
  }

  /** After recognize: remind user; selecting the dropdown counts as chat feedback. */
  function promptPickStyleAfterRecognize(): void {
    updateStyleSelectHint();
    const current = (styleSelect.value || "").trim();
    if (current) {
      addMessage(
        "assistant",
        `当前表样式是「${current}」。若要用它落地，点「替换为真表」；或在下方改选其它样式（改选会自动记入对话并继续）。`,
      );
      return;
    }
    addMessage(
      "assistant",
      "还差一步：请在下方「表样式」下拉框里选一个文档样式。\n选好后会自动当作你的回复并继续替换，不必再记口令。",
    );
    try {
      styleSelect.focus();
    } catch {
      /* UXP focus may be limited */
    }
  }

  // —— Tabs (div, not button — UXP native buttons render broken) ——
  const tabChat = el("div", { className: "tab active", role: "button" }, ["对话"]);
  const tabAgents = el("div", { className: "tab", role: "button" }, ["Agent"]);
  const tabConfig = el("div", { className: "tab", role: "button" }, ["配置"]);
  const tabs = el("div", { className: "tabs" }, [tabChat, tabAgents, tabConfig]);

  const chatView = el("section", { className: "view view-chat" });
  const agentsView = el("section", { className: "view view-agents hidden" });
  const configView = el("section", { className: "view view-config hidden" });

  const sceneBar = el("div", { className: "scene-bar hidden" });
  const recommendBar = el("div", { className: "recommend-bar" });
  const agentsList = el("div", { className: "agent-list" });

  // —— Config view ——
  const providerOptions = listProviders().map((p) =>
    el(
      "option",
      { value: p.id, ...(p.id === settings.provider ? { selected: "selected" } : {}) },
      [p.label],
    ),
  );
  configView.append(
    el("p", { className: "lede" }, [
      "当前仅开放「自配模型」：填写 Base URL / API Key / Model（与日常中转相同）。「插件默认模型」通道已预留、尚未上线，故不提供选项。",
    ]),
    el("label", {}, [
      "连接方式",
      el("select", { id: "connectionMode" }, [
        el("option", { value: "byok", selected: "selected" }, ["自配模型（当前可用）"]),
      ]),
    ]),
    el("label", {}, ["Provider", el("select", { id: "provider" }, providerOptions)]),
    el("label", {}, [
      "Base URL",
      el("input", {
        id: "baseUrl",
        type: "text",
        value: settings.baseUrl,
        placeholder: "https://your-relay/v1",
      }),
    ]),
    el("label", {}, [
      `API Key${settings.apiKey ? ` · 已保存 ${maskApiKey(settings.apiKey)}` : ""}`,
      el("input", {
        id: "apiKey",
        type: "password",
        placeholder: settings.apiKey ? "留空则保持原 Key" : "sk-...",
      }),
    ]),
    el("label", {}, [
      "Model（需识图）",
      el("input", {
        id: "model",
        type: "text",
        value: settings.model,
        placeholder: "gpt-5.5 / gpt-4o / …",
      }),
    ]),
    el("label", {}, [
      "Wire API（中转协议）",
      el("select", { id: "wireApi" }, [
        el(
          "option",
          {
            value: "chat_completions",
            ...((settings.wireApi || "chat_completions") === "chat_completions"
              ? { selected: "selected" }
              : {}),
          },
          ["Chat Completions（/v1/chat/completions）"],
        ),
        el(
          "option",
          {
            value: "responses",
            ...(settings.wireApi === "responses" ? { selected: "selected" } : {}),
          },
          ["Responses（/v1/responses · Codex wire_api）"],
        ),
      ]),
    ]),
    el("div", { className: "grid-2" }, [
      el("label", {}, [
        "Timeout ms",
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
    ]),
    el("p", { className: "lede" }, [
      "若 Codex/中转是 wire_api=responses，Wire API 必须选 Responses，否则会打到 /chat/completions 并 404。",
    ]),
    el("div", { id: "saveConfig", className: "ctl ctl-primary", role: "button" }, [
      "保存自配",
    ]),
  );

  // —— Chat chrome ——
  const styleSelect = el("select", { id: "tableStyle", className: "style-select" });
  const chips = el("div", { className: "chips" });

  const sendBtn = el("div", { className: "ctl ctl-primary send", role: "button" }, [
    "发送",
  ]);
  const fileInput = el("input", {
    id: "pasteFile",
    type: "file",
    accept: "image/*",
    className: "file-input",
  }) as HTMLInputElement;

  const composerMeta = el("div", { className: "composer-meta" }, [
    el("span", { className: "meta-label" }, ["表样式"]),
    styleSelect,
    el("label", { className: "file-label", for: "pasteFile" }, ["补图"]),
    fileInput,
  ]);

  const composerBar = el("div", { className: "composer-bar" }, [
    composerMeta,
    composer,
    el("div", { className: "composer-actions" }, [sendBtn]),
  ]);

  agentsView.append(
    el("p", { className: "lede" }, [
      "选择一个 Agent 后将回到对话首屏，并切换到该 Agent 的场景。以后可按需增加更多专属能力。",
    ]),
    agentsList,
  );

  chatView.append(sceneBar, chatLog, recommendBar, chips, composerBar);

  const headerSub = el("p", { className: "sub" }, [
    `工艺顾问 · v${PLUGIN_UI_VERSION}`,
  ]);

  root.append(
    el("header", { className: "top" }, [
      el("div", {}, [el("h1", {}, ["InDesign AI"]), headerSub]),
      tabs,
    ]),
    chatView,
    agentsView,
    configView,
  );

  function chip(label: string, onClick: () => void): HTMLDivElement {
    const b = el("div", { className: "chip", role: "button" }, [label]);
    b.addEventListener("click", onClick);
    return b;
  }

  function switchTab(which: "chat" | "agents" | "config"): void {
    tabChat.classList.toggle("active", which === "chat");
    tabAgents.classList.toggle("active", which === "agents");
    tabConfig.classList.toggle("active", which === "config");
    chatView.classList.toggle("hidden", which !== "chat");
    agentsView.classList.toggle("hidden", which !== "agents");
    configView.classList.toggle("hidden", which !== "config");
  }

  function renderSceneBar(): void {
    sceneBar.innerHTML = "";
    const agent = getAgent(activeAgentId);
    if (!agent.specialized) {
      sceneBar.classList.add("hidden");
      return;
    }
    sceneBar.classList.remove("hidden");
    sceneBar.append(
      el("span", { className: "scene-label" }, [`场景：${agent.name}`]),
      el("div", { className: "ctl scene-exit", role: "button", id: "exitAgent" }, [
        "退出到默认",
      ]),
    );
    sceneBar.querySelector("#exitAgent")?.addEventListener("click", () => {
      activateAgent(DEFAULT_AGENT_ID, { announce: true });
    });
  }

  function renderRecommendBar(): void {
    recommendBar.innerHTML = "";
    if (getAgent(activeAgentId).specialized) {
      recommendBar.classList.add("hidden");
      return;
    }
    recommendBar.classList.remove("hidden");
    const sorted = sortAgentsByUsage(listSpecializedAgents());
    recommendBar.append(
      el("div", { className: "recommend-title" }, [
        "需要专属能力时，可加载 Agent（或打开上方「Agent」列表）：",
      ]),
    );
    const row = el("div", { className: "recommend-row" });
    for (const a of sorted) {
      const card = el("div", { className: "recommend-chip", role: "button" }, [
        a.name,
      ]);
      card.addEventListener("click", () => activateAgent(a.id, { announce: true }));
      row.append(card);
    }
    const more = el("div", { className: "recommend-chip ghost", role: "button" }, [
      "全部…",
    ]);
    more.addEventListener("click", () => switchTab("agents"));
    row.append(more);
    recommendBar.append(row);
  }

  function renderAgentsList(): void {
    agentsList.innerHTML = "";
    const sorted = sortAgentsByUsage(listSpecializedAgents());
    for (const a of sorted) {
      const active = activeAgentId === a.id;
      const card = el("div", { className: `agent-card${active ? " active" : ""}` }, [
        el("div", { className: "agent-card-title" }, [a.name]),
        el("div", { className: "agent-card-tag" }, [a.tagline]),
        el("div", { className: "agent-card-desc" }, [a.description]),
        el(
          "div",
          {
            className: "ctl ctl-primary agent-card-go",
            role: "button",
          },
          [active ? "已加载 · 回对话" : "加载并回对话"],
        ),
      ]);
      card.addEventListener("click", () => {
        activateAgent(a.id, { announce: true });
      });
      agentsList.append(card);
    }
    if (sorted.length === 0) {
      agentsList.append(el("p", { className: "muted" }, ["暂无可用 Agent。"]));
    }
  }

  function renderAgentChrome(): void {
    const agent = getAgent(activeAgentId);
    composer.placeholder = agent.ui.placeholder;
    composerMeta.classList.toggle("hidden", !agent.ui.showTableTools);
    chips.innerHTML = "";
    if (agent.ui.chips.includes("recognize")) {
      chips.append(
        chip("识别表格", () => void handleUserText("识别表格")),
      );
    }
    if (agent.ui.chips.includes("replace")) {
      chips.append(
        chip("替换为真表", () => {
          const style = (styleSelect.value || "").trim();
          void handleUserText(
            style
              ? `把已识别好的表格文字，用表样式「${style}」直接替换到当前锁定选区。不要重新识别，不要从头执行。`
              : "把已识别好的表格文字直接替换到当前锁定选区（用我选的/项目偏好表样式）。不要重新识别，不要从头执行。",
          );
        }),
      );
    }
    if (agent.ui.chips.includes("list_styles")) {
      chips.append(chip("列出表样式", () => void handleUserText("有哪些表样式")));
    }
    if (agent.ui.chips.includes("normalize")) {
      chips.append(
        chip("规范化当前表", () => {
          const style = (styleSelect.value || "").trim();
          void handleUserText(
            style
              ? `请用表样式「${style}」规范化当前选中的真表。`
              : "请规范化当前选中的真表（用我选的或项目偏好表样式）。",
          );
        }),
      );
    }
    if (agent.ui.chips.includes("help_compare")) {
      chips.append(
        chip("怎么比对", () =>
          void handleUserText("请说明如何粘贴对照稿并与当前选区比对。"),
        ),
      );
    }
    if (agent.ui.chips.includes("help_proof")) {
      chips.append(
        chip("校对选区", () => void handleUserText("请校对当前选区的文字。")),
      );
    }
    if (agent.ui.chips.includes("help_grep")) {
      chips.append(
        chip("GREP 示例", () =>
          void handleUserText("给我一个清理连续空格的 InDesign GREP，并 propose_grep。"),
        ),
      );
    }
    chips.classList.toggle("hidden", agent.ui.chips.length === 0);
    headerSub.textContent = `${agent.name} · v${PLUGIN_UI_VERSION}`;
    renderSceneBar();
    renderRecommendBar();
    renderAgentsList();
  }

  function activateAgent(
    id: string,
    opts?: { announce?: boolean },
  ): void {
    const agent = getAgent(id);
    activeAgentId = agent.id;
    if (agent.specialized) {
      recordAgentOpen(agent.id);
      usageMeter.recordSpend?.(agent.id, 0);
    }
    renderAgentChrome();
    switchTab("chat");
    if (opts?.announce) {
      if (agent.specialized) {
        addMessage(
          "assistant",
          `已进入「${agent.name}」场景。${agent.description}\n直接用自然语言说明即可；需要换 Agent 时打开上方「Agent」或点「退出到默认」。`,
        );
      } else {
        addMessage(
          "assistant",
          "已回到默认顾问。版面专属任务请到「Agent」列表加载。",
        );
      }
    }
  }

  tabChat.addEventListener("click", () => switchTab("chat"));
  tabAgents.addEventListener("click", () => {
    renderAgentsList();
    switchTab("agents");
  });
  tabConfig.addEventListener("click", () => switchTab("config"));

  configView.querySelector("#saveConfig")?.addEventListener("click", () => {
    const prevBase = normalizeBaseUrlKey(loadSettings().baseUrl);
    const next = readConfigForm(root);
    if (!(root.querySelector("#apiKey") as HTMLInputElement).value) {
      next.apiKey = loadSettings().apiKey;
    }
    saveSettings(next);
    const nextBase = normalizeBaseUrlKey(next.baseUrl);
    if (nextBase !== prevBase) {
      egressAllowedBaseUrl = "";
    }
    addMessage(
      "system",
      `配置已保存：自配模型 · ${next.provider} · wire=${next.wireApi || "chat_completions"} · model=${next.model || "（空）"} · key=${maskApiKey(next.apiKey)}`,
    );
    switchTab("chat");
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result || "");
      addImageMessage("已载入补图（将用于识别）。", imageDataUrl);
    };
    reader.readAsDataURL(file);
  });

  async function doLock(): Promise<void> {
    const snapshot = await readSelectionSnapshot();
    if (snapshot.selection.length === 0) {
      addMessage("assistant", "当前没有选区。请先在页面上选中矢量伪表组合，再让我读取。");
      return;
    }
    const ub = unionBounds(snapshot.selection);
    lockSelection(snapshot, ub);
    await refreshStylesSilent();
    addMessage(
      "assistant",
      (() => {
        const notes = snapshot.selection
          .map((s) => (s.type === "graphic" ? s.notes : undefined))
          .filter(Boolean);
        return `已锁定选区：${selectionSummary(snapshot.selection)}\n页面 ${snapshot.pageIndex + 1} · ${ub.w.toFixed(1)}×${ub.h.toFixed(1)} pt${notes.length ? `\n${notes.join("\n")}` : ""}\n下一步可以说「识别表格」。`;
      })(),
    );
  }

  async function doRecognize(
    note?: string,
    opts?: { quiet?: boolean },
  ): Promise<boolean> {
    const locked = getLockedSelection();
    if (!locked) {
      addMessage("assistant", "还没有锁定选区。先说「读取选区」或「转成表格」。");
      return false;
    }
    const ready = resolveReadySettings();
    if (!ready.ok) {
      addMessage("assistant", ready.reason);
      switchTab("config");
      return false;
    }
    const s = ready.settings;

    if (!imageDataUrl) {
      addMessage("assistant", "① 正在导出选区图…");
      const cap = await exportSelectionPng();
      if (!cap.dataUrl) {
        addMessage("assistant", `导出失败：${cap.warnings.join("；") || "无图像"}`);
        return false;
      }
      imageDataUrl = cap.dataUrl;
      if (cap.warnings.length) {
        addMessage("system", cap.warnings.join("；"));
      }
      addImageMessage("选区图已导出，将据此识别表格。", imageDataUrl);
    }

    const egressOk = await ensureImageEgressAllowed(s.baseUrl);
    if (!egressOk) {
      addMessage("assistant", "已取消外发，未调用模型。需要识别时再说「识别表格」或「确认外发」。");
      return false;
    }

    addMessage(
      "assistant",
      `② 正在调用模型识别（${s.model} · ${s.wireApi === "responses" ? "Responses /responses" : "ChatCompletions /chat/completions"} → ${s.baseUrl}，超时 ${Math.round(s.timeoutMs / 1000)}s）…`,
    );
    draft = await directRecoverTable(s, {
      op: "recover_table",
      snapshot: locked.snapshot,
      imageDataUrl,
      ...(note ? { userNote: note } : {}),
    });
    const v = validateTableDraft(draft);
    if (!v.ok) {
      addMessage("assistant", `识别结果不合法：${v.error.message}`);
      return false;
    }
    draft = v.draft;
    if (draft.suggestedTableStyleName) {
      const hit = tableStyles.find((n) => n === draft!.suggestedTableStyleName);
      if (hit) styleSelect.value = hit;
    }
    const preview = draft.rows
      .slice(0, 8)
      .map((r) => r.join(" | "))
      .join("\n");
    addMessage(
      "assistant",
      `识别完成：${draft.rows.length} 行 × ${draft.rows[0]?.length ?? 0} 列（表头 ${draft.headerRowCount} / 表尾 ${draft.footerRowCount}）。\n${preview}${draft.rows.length > 8 ? "\n…" : ""}`,
    );
    promptPickStyleAfterRecognize();
    return true;
  }

  function resolveStyleName(preferred?: string): string | null {
    if (preferred) {
      const matched = matchTableStyleName(preferred, tableStyles);
      if (matched) return matched;
      const raw = preferred.trim();
      if (raw && tableStyles.includes(raw)) return raw;
      // User typed a free name that may still exist after refresh
      if (raw) return raw;
    }
    const fromSelect = (styleSelect.value || "").trim();
    if (fromSelect) return fromSelect;
    const suggested = (draft?.suggestedTableStyleName || "").trim();
    if (suggested) {
      const hit = matchTableStyleName(suggested, tableStyles);
      if (hit) return hit;
    }
    const usable = tableStyles.filter(
      (n) => n !== "[No Table Style]" && n !== "[无表样式]",
    );
    if (usable.length === 1) return usable[0]!;
    return null;
  }

  async function continueWithStyle(styleName: string): Promise<void> {
    const name = resolveStyleName(styleName);
    if (!name) {
      addMessage("assistant", `没找到表样式「${styleName}」。可以说「有哪些表样式」。`);
      return;
    }
    styleSelect.value = name;
    if (!draft || !getLockedSelection()) {
      addMessage("assistant", "当前没有可用的识别结果/选区，请再说「转成表格」。");
      return;
    }
    const host = getHost();
    const locked = getLockedSelection()!;
    const pre = await preflightTableReplace({
      draft,
      tableStyleName: name,
      locked,
      host,
    });
    if (!pre.ok) {
      addMessage("assistant", `预检未通过（未改文档）：${pre.error.message}`);
      return;
    }
    addMessage("assistant", `已接上：用样式「${name}」写入真表（可 Undo）…`);
    await runReplace(name);
  }

  async function runReplace(styleName: string): Promise<void> {
    const locked = getLockedSelection();
    if (!locked || !draft) {
      addMessage("assistant", "状态已变化，请重新识别后再替换。");
      return;
    }
    const built = buildTableReplaceCommands({
      pageIndex: locked.pageIndex,
      bounds: locked.unionBounds,
      draft,
      tableStyleName: styleName,
      selectionIds: locked.ids,
    });
    if (!built.ok) {
      addMessage("assistant", `无法生成指令：${built.error.message}`);
      return;
    }
    addMessage("assistant", "③ 正在写入真表…");
    const report = await runCommandBatch({
      requestId: newId(),
      commands: built.commands,
      host: getHost(),
    });
    if (!report.ok) {
      const err = report.results.find((r) => !r.ok)?.error?.message || "未知错误";
      addMessage(
        "assistant",
        `替换未完成：${err}\n原矢量应仍在；可用 Undo 清理残留。`,
      );
      return;
    }
    clearLockedSelection();
    imageDataUrl = "";
    draft = null;
    updateStyleSelectHint();
    addMessage("assistant", `完成：已用样式「${styleName}」生成真表，原矢量已删除。`);
    const mem = loadMemory();
    recordTaskOutcome(
      mem,
      activeProjectKey,
      lastTaskId || "m0t.replace_with_style",
      true,
      styleName,
    );
    appendProjectDigest(
      mem,
      activeProjectKey,
      `成功用样式「${styleName}」完成真表替换`,
    );
  }

  function syncProjectScope(): ReturnType<typeof getActiveDocumentIdentity> {
    const id = getActiveDocumentIdentity();
    const key = id?.key || "no-doc";
    if (key !== activeProjectKey) {
      chatByProject.set(activeProjectKey, history);
      activeProjectKey = key;
      history = chatByProject.get(key) ? [...chatByProject.get(key)!] : [];
      const mem = loadMemory();
      if (id) {
        getOrCreateProject(mem, {
          key: id.key,
          name: id.name,
          ...(id.path ? { path: id.path } : {}),
        });
        saveMemory(mem);
        addMessage(
          "system",
          `已切换到文档项目：${id.name}（经验与对话与其它文档隔离）`,
        );
      } else {
        addMessage("system", "当前无打开文档；经验暂存在临时空间。");
      }
      // Reset transient table state when document changes
      draft = null;
      imageDataUrl = "";
      clearLockedSelection();
    } else if (id) {
      const mem = loadMemory();
      getOrCreateProject(mem, {
        key: id.key,
        name: id.name,
        ...(id.path ? { path: id.path } : {}),
      });
      saveMemory(mem);
    }
    return id;
  }

  function selectionTextFromSnapshot(
    snapshot: { selection: Array<Record<string, unknown>> } | null,
  ): string {
    if (!snapshot?.selection?.length) return "";
    return snapshot.selection
      .map((s) => String((s as { storyText?: string }).storyText || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);
  }

  function buildAgentContext(): AgentRuntimeContext {
    const locked = getLockedSelection();
    const preview = draft
      ? draft.rows
          .slice(0, 6)
          .map((r) => r.join(" | "))
          .join("\n")
      : "";
    return {
      selectionLocked: Boolean(locked),
      selectionSummary: locked ? selectionSummary(locked.snapshot.selection) : "",
      selectionText: selectionTextFromSnapshot(locked?.snapshot ?? null),
      hasDraft: Boolean(draft),
      readyToReplace: Boolean(draft),
      draftPreview: preview,
      tableStyles: [...tableStyles],
      selectedStyle: (styleSelect.value || "").trim(),
      hasPatchImage: Boolean(imageDataUrl),
    };
  }

  /**
   * Host invariant: if we already have a table draft and the user asked to replace
   * (not re-recognize), drop redundant lock/recognize so we never re-OCR.
   */
  function sanitizeActionsForReplace(
    actions: AgentAction[],
    userText: string,
  ): AgentAction[] {
    const wantsReplace = /(替换|成真表|落地|写入真表)/.test(userText);
    const wantsRedoVision = /(重新识别|再识别|识错|重做识别)/.test(userText);
    if (!draft || !wantsReplace || wantsRedoVision) return actions;

    let next = actions.filter(
      (a) => a.type !== "recognize_table" && a.type !== "lock_selection",
    );
    const hasReplace = next.some((a) => a.type === "replace_table");
    if (!hasReplace) {
      const style =
        (styleSelect.value || "").trim() ||
        loadMemory().projects[activeProjectKey]?.preferredTableStyle ||
        "";
      if (style) {
        next = [...next, { type: "replace_table", styleName: style }];
      }
    }
    if (next.length !== actions.length) {
      addMessage(
        "system",
        "已有识别结果：跳过重新识图，只执行替换。",
      );
    }
    return next;
  }

  function filterActionsForAgent(actions: AgentAction[]): AgentAction[] {
    const allowed = new Set(getAgent(activeAgentId).allowedActions);
    const next = actions.filter((a) => allowed.has(a.type));
    if (next.length !== actions.length) {
      addMessage(
        "system",
        `已忽略当前 Agent 不允许的动作（${actions
          .filter((a) => !allowed.has(a.type))
          .map((a) => a.type)
          .join(", ")}）。`,
      );
    }
    return next;
  }

  async function executeAgentActions(actions: AgentAction[]): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case "lock_selection":
          await doLock();
          break;
        case "recognize_table": {
          if (draft) {
            addMessage("system", "识别稿已在，跳过重复识图。");
            break;
          }
          const recognized = await doRecognize(undefined, { quiet: true });
          if (!recognized) return;
          break;
        }
        case "replace_table":
          try {
            await continueWithStyle(action.styleName);
          } catch (e) {
            const mem = loadMemory();
            recordTaskOutcome(
              mem,
              activeProjectKey,
              lastTaskId || "m0t.replace_with_style",
              false,
              action.styleName,
            );
            throw e;
          }
          break;
        case "list_styles":
          await refreshStylesSilent();
          addMessage(
            "assistant",
            tableStyles.length
              ? `文档表样式：\n${tableStyles.map((n) => `· ${n}`).join("\n")}`
              : "还没有读到表样式。",
          );
          break;
        case "apply_table_style": {
          const style =
            matchTableStyleName(action.styleName, tableStyles) ||
            action.styleName.trim();
          if (!isInDesignRuntime()) {
            addMessage(
              "assistant",
              `（浏览器桩）将应用表样式「${style}」到选区真表。`,
            );
            break;
          }
          const result = await applyTableStyleToSelection(style);
          addMessage("assistant", result.message);
          if (result.applied > 0 && activeProjectKey && activeProjectKey !== "no-doc") {
            const mem = loadMemory();
            const project = mem.projects[activeProjectKey];
            if (project) {
              project.preferredTableStyle = style;
              saveMemory(mem);
            }
          }
          break;
        }
        case "propose_grep": {
          const lines = [
            "【InDesign GREP · 可复制到查找/更改】",
            `查找：${action.find}`,
          ];
          if (action.changeTo) lines.push(`替换为：${action.changeTo}`);
          if (action.flags) lines.push(`选项：${action.flags}`);
          if (action.note) lines.push(`说明：${action.note}`);
          addMessage("assistant", lines.join("\n"));
          break;
        }
        case "open_config":
          switchTab("config");
          break;
        default:
          break;
      }
    }
  }

  async function handleUserText(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;

    // Image-egress confirm must work even while recognize is "busy" waiting.
    if (pendingEgress) {
      if (/^(确认外发|确认|同意|允许外发|yes)$/i.test(text)) {
        addMessage("user", text);
        composer.value = "";
        pendingEgress.resolve(true);
        return;
      }
      if (/^(取消|不要|算了|拒绝|no|cancel)$/i.test(text)) {
        addMessage("user", text);
        composer.value = "";
        pendingEgress.resolve(false);
        return;
      }
    }

    if (busy) return;
    addMessage("user", text);
    composer.value = "";

    syncProjectScope();

    // Local-only utilities (no model needed)
    if (/^(清空|清除对话|clear)$/i.test(text)) {
      history = [];
      chatByProject.set(activeProjectKey, []);
      chatLog.innerHTML = "";
      addMessage("assistant", "当前文档的对话已清空（其它文档的经验与对话仍保留）。");
      return;
    }

    const ready = resolveReadySettings();
    if (!ready.ok) {
      addMessage("assistant", ready.reason);
      switchTab("config");
      return;
    }
    const s = ready.settings;

    if (usageMeter.canSpend && !usageMeter.canSpend(activeAgentId, 1)) {
      addMessage("assistant", "用量不足（预留控量钩子，当前未启用）。");
      return;
    }

    setBusy(true);
    try {
      await refreshStylesSilent();
      const id = getActiveDocumentIdentity();
      const mem = loadMemory();
      if (id) {
        getOrCreateProject(mem, {
          key: id.key,
          name: id.name,
          ...(id.path ? { path: id.path } : {}),
        });
        saveMemory(mem);
      }
      const experience = memorySliceForPrompt(mem, id?.key ?? null);
      // Prefer project style in UI when empty (only meaningful in table agent)
      if (
        getAgent(activeAgentId).ui.showTableTools &&
        !styleSelect.value &&
        experience.projectPreferredTableStyle
      ) {
        const hit = matchTableStyleName(
          experience.projectPreferredTableStyle,
          tableStyles,
        );
        if (hit) styleSelect.value = hit;
      }

      addMessage(
        "system",
        `「${getAgent(activeAgentId).name}」正在结合上下文理解…`,
      );
      const decision = await directAgentTurn(s, {
        activeAgentId,
        project: id
          ? {
              key: id.key,
              name: id.name,
              ...(id.path ? { path: id.path } : {}),
            }
          : null,
        experience,
        context: buildAgentContext(),
        history,
        userMessage: text,
      });
      usageMeter.recordSpend?.(activeAgentId, 1);
      lastTaskId = decision.taskId || "";
      history = [
        ...history,
        { role: "user" as const, text },
        { role: "assistant" as const, text: decision.reply },
      ].slice(-20);
      chatByProject.set(activeProjectKey, history);

      const taskLabel = decision.taskId ? ` · 任务 ${decision.taskId}` : "";
      const recommendId = (decision.recommendAgentId || "").trim();
      const recommend = recommendId ? getAgent(recommendId) : null;
      const handoff =
        recommend && recommend.specialized
          ? el("div", { className: "chips" }, [
              (() => {
                const b = el(
                  "div",
                  { className: "chip", role: "button" },
                  [`加载「${recommend.name}」`],
                );
                b.addEventListener("click", () => {
                  activateAgent(recommend.id, { announce: true });
                });
                return b;
              })(),
            ])
          : undefined;
      addMessage(
        "assistant",
        decision.reply + (taskLabel ? `\n（${taskLabel.trim()}）` : ""),
        handoff,
      );

      // Persist lessons proposed by the model
      if (decision.lessons?.length) {
        const root = loadMemory();
        for (const lesson of decision.lessons) {
          rememberNote(root, {
            scope: lesson.scope,
            text: lesson.text,
            ...(lesson.taskId ? { taskId: lesson.taskId } : {}),
            ...(lesson.scope === "project" || lesson.scope === "task"
              ? { projectKey: activeProjectKey }
              : {}),
          });
        }
        addMessage("system", `已沉淀 ${decision.lessons.length} 条经验。`);
      }

      let actions = filterActionsForAgent(decision.actions);
      if (getAgent(activeAgentId).ui.showTableTools) {
        actions = sanitizeActionsForReplace(actions, text);
      }
      if (actions.length) {
        addMessage(
          "system",
          `执行：${actions.map((a) => a.type).join(" → ")}`,
        );
        await executeAgentActions(actions);
      } else if (
        getAgent(activeAgentId).ui.showTableTools &&
        draft &&
        /(替换|成真表)/.test(text) &&
        !(styleSelect.value || "").trim()
      ) {
        promptPickStyleAfterRecognize();
      }
    } catch (e) {
      addMessage("assistant", `出错了：${String(e)}`);
      const mem = loadMemory();
      if (lastTaskId) {
        recordTaskOutcome(mem, activeProjectKey, lastTaskId, false);
      }
    } finally {
      setBusy(false);
    }
  }

  // Dropdown selection IS user feedback — only in table-recover agent.
  styleSelect.addEventListener("change", () => {
    if (!getAgent(activeAgentId).ui.showTableTools) return;
    updateStyleSelectHint();
    const name = (styleSelect.value || "").trim();
    if (!name) return;
    if (busy) {
      addMessage("system", `已记下表样式「${name}」（当前忙碌，完成后可再说替换）。`);
      return;
    }
    if (draft) {
      void handleUserText(
        `我选择了表样式「${name}」。请用它把已识别的表格替换到当前锁定选区，不要重新识别。`,
      );
    } else {
      addMessage("user", `我选择了表样式「${name}」。`);
      history = [
        ...history,
        { role: "user" as const, text: `我选择了表样式「${name}」。` },
        {
          role: "assistant" as const,
          text: `好的，已记录「${name}」。识别完成后会优先用它替换。`,
        },
      ].slice(-20);
      chatByProject.set(activeProjectKey, history);
      addMessage(
        "assistant",
        `好的，已记录「${name}」。识别完成后会优先用它替换。`,
      );
      const mem = loadMemory();
      if (activeProjectKey && activeProjectKey !== "no-doc") {
        rememberNote(mem, {
          scope: "project",
          projectKey: activeProjectKey,
          text: `用户偏好表样式「${name}」`,
          taskId: "m0t.replace_with_style",
        });
        const project = mem.projects[activeProjectKey];
        if (project) {
          project.preferredTableStyle = name;
          saveMemory(mem);
        }
      }
    }
  });

  sendBtn.addEventListener("click", () => {
    if (sendBtn.classList.contains("ctl-disabled")) return;
    void handleUserText(composer.value);
  });
  composer.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      if (busy) return;
      void handleUserText(composer.value);
    }
  });

  void refreshStylesSilent();
  syncProjectScope();
  renderAgentChrome();
  addMessage(
    "assistant",
    isInDesignRuntime()
      ? "你好，我是画册/内页工艺顾问：直接说你的排版问题，我会给可执行步骤；需要改文档时会建议并一键转交专属 Agent（伪表恢复、贴表规范化、比对、校对、GREP）。\n不做溢出巡检/缺图重链。模型在「配置」。"
      : "当前不在 InDesign 面板环境。连上宿主后即可使用。",
  );
}
