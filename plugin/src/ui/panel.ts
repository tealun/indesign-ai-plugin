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

const PLUGIN_UI_VERSION = "0.4.7";

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
  let thinkingEl: HTMLElement | null = null;

  function hideThinking(): void {
    if (!thinkingEl) return;
    thinkingEl.remove();
    thinkingEl = null;
  }

  /** ChatGPT-style pending indicator while the host/model is working. */
  function showThinking(): void {
    if (thinkingEl) {
      chatLog.append(thinkingEl);
      chatLog.scrollTop = chatLog.scrollHeight;
      return;
    }
    const dots = el("div", { className: "thinking-dots", "aria-label": "处理中" });
    dots.append(el("span", {}), el("span", {}), el("span", {}));
    thinkingEl = el("div", { className: "msg msg-assistant msg-thinking" }, [
      el("div", { className: "msg-role" }, ["顾问"]),
      dots,
    ]);
    chatLog.append(thinkingEl);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addMessage(role: Role, text: string, extra?: HTMLElement): HTMLElement {
    const bubble = el("div", { className: `msg msg-${role}` }, [
      el("div", { className: "msg-role" }, [
        role === "user" ? "你" : role === "system" ? "系统" : "顾问",
      ]),
      el("div", { className: "msg-body" }, [text]),
    ]);
    if (extra) bubble.append(extra);
    chatLog.append(bubble);
    if (thinkingEl) chatLog.append(thinkingEl);
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
    if (block) showThinking();
    else hideThinking();
  }

  function normalizeBaseUrlKey(baseUrl: string): string {
    return baseUrl.trim().replace(/\/$/, "");
  }

  /** Bottom-bar chips are UXP-reliable; message-embedded chips often miss clicks. */
  function renderEgressActionChips(): void {
    chips.innerHTML = "";
    chips.append(
      chip("确认外发", () => {
        if (!pendingEgress) return;
        addMessage("user", "确认外发");
        pendingEgress.resolve(true);
      }),
      chip("取消", () => {
        if (!pendingEgress) return;
        addMessage("user", "取消");
        pendingEgress.resolve(false);
      }),
    );
    chips.classList.remove("hidden");
  }

  /**
   * Privacy gate (AGENTS.md / 00_03): image must not leave the host until the
   * user explicitly confirms. Session-scoped per baseUrl. Never echo host/port/URL
   * in chat (leak risk for BYOK relays and future hosted endpoints).
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
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        if (pendingEgress?.baseUrl !== key) return;
        settled = true;
        pendingEgress = null;
        if (ok) egressAllowedBaseUrl = key;
        setBusy(busy);
        renderAgentChrome();
        resolve(ok);
      };
      pendingEgress = { baseUrl: key, resolve: settle };
      setBusy(busy);
      // Primary affordance: same bottom chip bar as「识别表格」(works in UXP).
      renderEgressActionChips();

      addMessage(
        "assistant",
        "选区图将发往当前识图通道。确认外发，或取消。",
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
      addMessage("assistant", `表样式「${current}」。点「替换为真表」或改选样式。`);
      return;
    }
    addMessage("assistant", "请选择表样式，再点「替换为真表」。");
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
    el("p", { className: "lede" }, ["填写 Base URL / API Key / Model。"]),
    el("label", {}, [
      "连接方式",
      el("select", { id: "connectionMode" }, [
        el("option", { value: "byok", selected: "selected" }, ["自配模型"]),
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
      "Codex 类中转请将 Wire API 设为 Responses。",
    ]),
    el("div", { id: "saveConfig", className: "ctl ctl-primary", role: "button" }, [
      "保存",
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
    el("p", { className: "lede" }, ["选择 Agent 后回到对话。"]),
    agentsList,
  );

  chatView.append(sceneBar, chatLog, recommendBar, chips, composerBar);

  const headerSub = el("p", { className: "sub" }, [
    `对话顾问 · v${PLUGIN_UI_VERSION}`,
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
      el("div", { className: "recommend-title" }, ["专属 Agent"]),
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
    chips.classList.toggle("hidden", agent.ui.chips.length === 0);
    headerSub.textContent = agent.specialized
      ? `${agent.name} · v${PLUGIN_UI_VERSION}`
      : `对话顾问 · v${PLUGIN_UI_VERSION}`;
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
      addMessage(
        "assistant",
        agent.specialized ? `已加载「${agent.name}」。` : "已回到默认对话。",
      );
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
    addMessage("system", "配置已保存。");
    switchTab("chat");
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result || "");
      addImageMessage("补图", imageDataUrl);
    };
    reader.readAsDataURL(file);
  });

  async function doLock(): Promise<void> {
    const snapshot = await readSelectionSnapshot();
    if (snapshot.selection.length === 0) {
      addMessage("assistant", "没有选区。请先选中伪表再读取。");
      return;
    }
    const ub = unionBounds(snapshot.selection);
    lockSelection(snapshot, ub);
    await refreshStylesSilent();
    addMessage(
      "assistant",
      `已锁定：${selectionSummary(snapshot.selection)} · 页 ${snapshot.pageIndex + 1}`,
    );
  }

  async function doRecognize(
    note?: string,
    opts?: { quiet?: boolean },
  ): Promise<boolean> {
    const locked = getLockedSelection();
    if (!locked) {
      addMessage("assistant", "还没有锁定选区。");
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
      const cap = await exportSelectionPng();
      if (!cap.dataUrl) {
        addMessage("assistant", `导出失败：${cap.warnings.join("；") || "无图像"}`);
        return false;
      }
      imageDataUrl = cap.dataUrl;
      if (cap.warnings.length) {
        addMessage("system", cap.warnings.join("；"));
      }
      addImageMessage("选区图", imageDataUrl);
    }

    const egressOk = await ensureImageEgressAllowed(s.baseUrl);
    if (!egressOk) {
      addMessage("assistant", "已取消外发。");
      return false;
    }

    addMessage("assistant", "识别中…");
    try {
      draft = await directRecoverTable(s, {
        op: "recover_table",
        snapshot: locked.snapshot,
        imageDataUrl,
        ...(note ? { userNote: note } : {}),
      });
    } catch (e) {
      addMessage(
        "assistant",
        `识别失败：${String(e).replace(/^Error:\s*/, "")}。可补图后重试。`,
      );
      return false;
    }
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
      addMessage("assistant", `没有表样式「${styleName}」。`);
      return;
    }
    styleSelect.value = name;
    if (!draft || !getLockedSelection()) {
      addMessage("assistant", "缺少识别结果或选区。");
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
      addMessage("assistant", `预检未通过：${pre.error.message}`);
      return;
    }
    await runReplace(name);
  }

  async function runReplace(styleName: string): Promise<void> {
    const locked = getLockedSelection();
    if (!locked || !draft) {
      addMessage("assistant", "状态已变，请重新识别。");
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
    addMessage("assistant", "写入中…");
    const report = await runCommandBatch({
      requestId: newId(),
      commands: built.commands,
      host: getHost(),
    });
    if (!report.ok) {
      const err = report.results.find((r) => !r.ok)?.error?.message || "未知错误";
      addMessage("assistant", `替换失败：${err}（可用 Undo）`);
      return;
    }
    clearLockedSelection();
    imageDataUrl = "";
    draft = null;
    updateStyleSelectHint();
    addMessage("assistant", `完成：已用「${styleName}」生成真表。`);
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

  /** Rebuild chat-log for the active document so UI never mixes projects. */
  function renderHistoryChat(): void {
    chatLog.innerHTML = "";
    for (const m of history) {
      addMessage(m.role === "user" ? "user" : "assistant", m.text);
    }
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
        getOrCreateProject(mem, { key: id.key, name: id.name });
        saveMemory(mem);
      }
      draft = null;
      imageDataUrl = "";
      clearLockedSelection();
      renderHistoryChat();
    } else if (id) {
      const mem = loadMemory();
      getOrCreateProject(mem, { key: id.key, name: id.name });
      saveMemory(mem);
    }
    return id;
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
    return next;
  }

  function filterActionsForAgent(actions: AgentAction[]): AgentAction[] {
    const allowed = new Set(getAgent(activeAgentId).allowedActions);
    return actions.filter((a) => allowed.has(a.type));
  }

  async function executeAgentActions(actions: AgentAction[]): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case "lock_selection":
          await doLock();
          break;
        case "recognize_table": {
          if (draft) {
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
      addMessage("user", text);
      composer.value = "";
      addMessage("assistant", "请先确认或取消外发。");
      return;
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
      addMessage("assistant", "已清空。");
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
        getOrCreateProject(mem, { key: id.key, name: id.name });
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

      const decision = await directAgentTurn(s, {
        activeAgentId,
        project: id ? { key: id.key, name: id.name } : null,
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

      addMessage("assistant", decision.reply);

      // Persist lessons proposed by the model (silent)
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
      }

      let actions = filterActionsForAgent(decision.actions);
      if (getAgent(activeAgentId).ui.showTableTools) {
        actions = sanitizeActionsForReplace(actions, text);
      }
      if (actions.length) {
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
      addMessage("system", `已记下「${name}」。`);
      return;
    }
    if (draft) {
      void handleUserText(
        `我选择了表样式「${name}」。请用它把已识别的表格替换到当前锁定选区，不要重新识别。`,
      );
    } else {
      addMessage("user", `表样式「${name}」。`);
      history = [
        ...history,
        { role: "user" as const, text: `表样式「${name}」。` },
        {
          role: "assistant" as const,
          text: `已记下「${name}」。`,
        },
      ].slice(-20);
      chatByProject.set(activeProjectKey, history);
      addMessage("assistant", `已记下「${name}」。`);
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
      // Allow confirm/cancel while recognize is blocked on image-egress gate.
      if (busy && !pendingEgress) return;
      void handleUserText(composer.value);
    }
  });

  void refreshStylesSilent();
  syncProjectScope();
  renderAgentChrome();
  addMessage(
    "assistant",
    isInDesignRuntime()
      ? "你好。伪表恢复请到「Agent」加载。"
      : "未连接 InDesign。",
  );
}
