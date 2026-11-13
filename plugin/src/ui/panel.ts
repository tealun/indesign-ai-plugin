import { listProviders } from "../providers/registry.js";
import {
  loadSettings,
  maskApiKey,
  resolveReadySettings,
  saveSettings,
} from "../settings/store.js";
import type {
  AiConnectionMode,
  LayoutCommand,
  OpenAiWireApi,
  ProviderSettings,
  ProviderType,
  TableDraft,
} from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";
import { validateCommandBatch } from "../protocol/whitelist.js";

const PLUGIN_UI_VERSION = "0.4.14";

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
  filterActionsByAllowlist,
  shouldHarvestLiveSelection,
  shouldInjectCompareDocument,
  shouldReadClipboard,
} from "../agent/contextGate.js";
import {
  maySanitizeReplaceForAgent,
  sanitizeActionsForReplace,
} from "../agent/sanitizeActions.js";
import {
  COMPARE_UPLOAD_ACCEPT,
  MAX_UPLOAD_BYTES,
  extractDocumentText,
} from "../compare/extractDocumentText.js";
import { readClipboardText, writeClipboardText } from "../host/clipboard.js";
import {
  applyNestedGrepStyle,
  applyTableStyleToSelection,
  createIndesignHost,
  listCharacterStyleNames,
  listParagraphStyleNames,
  listTableStyleNames,
  unionBounds,
} from "../host/indesignHost.js";
import { isInDesignRuntime } from "../host/uxpRequire.js";
import { directChatCommands, directRecoverTable } from "../transport/direct.js";
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
import { assessHeaderLanguage } from "../protocol/draftQuality.js";

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
  /** Uploaded compare-source (文稿比对). */
  let compareDoc: {
    fileName: string;
    format: string;
    text: string;
  } | null = null;
  let busy = false;
  /** Session approval: payload may be POSTed to this normalized baseUrl. */
  let egressAllowedBaseUrl = "";
  let pendingEgress:
    | { baseUrl: string; resolve: (ok: boolean) => void }
    | null = null;
  let compareUploadGen = 0;
  let compareParsing = false;
  /** Per-document chat histories — never share across open files. */
  const chatByProject = new Map<string, AgentChatMessage[]>();
  let activeProjectKey = "no-doc";
  let history: AgentChatMessage[] = [];
  let lastTaskId = "";
  let activeAgentId = DEFAULT_AGENT_ID;
  /** Previewed M0 LayoutCommand batch (选区排版); cleared on leave / apply. */
  let pendingLayoutCommands: LayoutCommand[] | null = null;
  /** Last propose_grep find — for「写入 GREP 样式」chip / utterance. */
  let pendingGrepFind: string | null = null;
  let paragraphStyles: string[] = [];
  let characterStyles: string[] = [];
  // Future: swap NOOP_USAGE_METER for a real points meter.
  const usageMeter = NOOP_USAGE_METER;

  const chatLog = el("div", { className: "chat-log", id: "chatLog" });
  const composer = el("textarea", {
    id: "composer",
    className: "composer",
    rows: "2",
  }) as HTMLTextAreaElement;

  /** UXP can double-paint long placeholders; reset attr and keep copy short. */
  function setComposerPlaceholder(text: string): void {
    const next = (text || "").trim();
    composer.removeAttribute("placeholder");
    if (next) composer.setAttribute("placeholder", next);
  }
  setComposerPlaceholder(getAgent(DEFAULT_AGENT_ID).ui.placeholder);
  let thinkingEl: HTMLElement | null = null;
  let thinkingTimer: ReturnType<typeof setInterval> | null = null;
  let thinkingPhase = 0;

  function stopThinkingAnim(): void {
    if (thinkingTimer == null) return;
    clearInterval(thinkingTimer);
    thinkingTimer = null;
  }

  function hideThinking(): void {
    stopThinkingAnim();
    if (!thinkingEl) return;
    thinkingEl.remove();
    thinkingEl = null;
  }

  /**
   * Typing indicator while host/model is working.
   * Drive opacity via setInterval — InDesign UXP ignores CSS @keyframes.
   * Do not pair with text status like「识别中…」(redundant).
   */
  function showThinking(): void {
    if (thinkingEl) {
      chatLog.append(thinkingEl);
      chatLog.scrollTop = chatLog.scrollHeight;
      return;
    }
    const s1 = el("span", {}) as HTMLElement;
    const s2 = el("span", {}) as HTMLElement;
    const s3 = el("span", {}) as HTMLElement;
    const spans = [s1, s2, s3];
    for (const s of spans) {
      s.style.opacity = "0.35";
      s.style.transform = "translateY(0px)";
    }
    const dots = el("div", { className: "thinking-dots", "aria-label": "处理中" }, [
      s1,
      s2,
      s3,
    ]);
    thinkingEl = el("div", { className: "msg msg-assistant msg-thinking" }, [dots]);
    thinkingPhase = 0;
    thinkingTimer = setInterval(() => {
      thinkingPhase = (thinkingPhase + 1) % 3;
      for (let i = 0; i < spans.length; i++) {
        const on = i === thinkingPhase;
        spans[i]!.style.opacity = on ? "1" : "0.35";
        spans[i]!.style.transform = on ? "translateY(-2px)" : "translateY(0px)";
      }
    }, 280);
    chatLog.append(thinkingEl);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addMessage(role: Role, text: string, extra?: HTMLElement): HTMLElement {
    // Adobe AI Assistant style: no per-bubble "顾问/你" labels — alignment shows role.
    const bubble = el("div", { className: `msg msg-${role}` }, [
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
   * Privacy gate (AGENTS.md / 00_03): payload must not leave the host until the
   * user explicitly confirms. Session-scoped per baseUrl (image + 对照稿共用).
   * Never echo host/port/URL in chat (leak risk for BYOK relays / hosted endpoints).
   */
  function ensureEgressAllowed(
    baseUrl: string,
    kind: "image" | "document",
  ): Promise<boolean> {
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

      const what =
        kind === "image"
          ? "选区图/补图将发往当前识图通道。确认外发，或取消。"
          : "对照稿文字将发往当前模型通道做比对。确认外发，或取消。";
      addMessage("assistant", what);
    });
  }

  function ensureImageEgressAllowed(baseUrl: string): Promise<boolean> {
    return ensureEgressAllowed(baseUrl, "image");
  }

  async function refreshStylesSilent(): Promise<void> {
    const keep = (styleSelect.value || "").trim();
    try {
      if (!isInDesignRuntime()) {
        tableStyles = ["Catalog-Table"];
        paragraphStyles = ["Body", "[Basic Paragraph]"];
        characterStyles = ["Price", "Emph"];
      } else {
        tableStyles = await listTableStyleNames();
        try {
          paragraphStyles = await listParagraphStyleNames();
        } catch {
          paragraphStyles = [];
        }
        try {
          characterStyles = await listCharacterStyleNames();
        } catch {
          characterStyles = [];
        }
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

  const compareFileInput = el("input", {
    id: "compareFile",
    type: "file",
    accept: COMPARE_UPLOAD_ACCEPT,
    className: "file-input",
  }) as HTMLInputElement;

  const compareFileLabel = el(
    "label",
    { className: "file-label", for: "compareFile" },
    ["上传对照稿"],
  );
  const compareClearBtn = el(
    "div",
    { className: "file-label hidden", role: "button", id: "clearCompareDoc" },
    ["清除稿件"],
  );
  const compareDocStatus = el("span", { className: "meta-label compare-doc-status" }, [
    "",
  ]);

  const tableToolsRow = el(
    "div",
    { className: "composer-meta-row hidden", id: "tableToolsRow" },
    [
      el("span", { className: "meta-label" }, ["表样式"]),
      styleSelect,
      el("label", { className: "file-label", for: "pasteFile" }, ["补图"]),
      fileInput,
    ],
  );

  const compareToolsRow = el(
    "div",
    { className: "composer-meta-row hidden", id: "compareToolsRow" },
    [compareFileLabel, compareFileInput, compareClearBtn, compareDocStatus],
  );

  const composerMeta = el("div", { className: "composer-meta hidden" }, [
    tableToolsRow,
    compareToolsRow,
  ]);

  const composerBar = el("div", { className: "composer-bar" }, [
    composerMeta,
    el("div", { className: "composer-row" }, [
      composer,
      el("div", { className: "composer-actions" }, [sendBtn]),
    ]),
  ]);

  agentsView.append(
    el("p", { className: "lede" }, ["选择 Agent 后回到对话。"]),
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

  function refreshCompareDocStatus(): void {
    if (compareDoc) {
      const n = compareDoc.text.length;
      compareDocStatus.textContent = `已载入 ${compareDoc.fileName}（${compareDoc.format} · ${n} 字）`;
      compareClearBtn.classList.remove("hidden");
    } else {
      compareDocStatus.textContent = "支持 txt / doc / docx / xls / xlsx / pdf 等";
      compareClearBtn.classList.add("hidden");
    }
  }

  function renderAgentChrome(): void {
    const agent = getAgent(activeAgentId);
    setComposerPlaceholder(agent.ui.placeholder);
    const showTable = Boolean(agent.ui.showTableTools);
    const showCompare = Boolean(agent.ui.showCompareUpload);
    tableToolsRow.classList.toggle("hidden", !showTable);
    compareToolsRow.classList.toggle("hidden", !showCompare);
    composerMeta.classList.toggle("hidden", !showTable && !showCompare);
    if (showCompare) refreshCompareDocStatus();
    else {
      compareDocStatus.textContent = "";
      compareClearBtn.classList.add("hidden");
    }
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
          void handleUserText(
            "请说明如何上传或粘贴对照稿（txt/doc/docx/xls/xlsx/pdf），并与当前选区比对。",
          ),
        ),
      );
      chips.append(
        chip("开始比对", () =>
          void handleUserText(
            "请用已上传的对照稿（若无则用剪贴板/我刚粘贴的文字）与当前版面选区做差异比对。",
          ),
        ),
      );
    }
    if (agent.ui.chips.includes("help_proof")) {
      chips.append(chip("读取选区", () => void doLock()));
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
    if (agent.ui.chips.includes("help_layout")) {
      chips.append(chip("读取选区", () => void doLock()));
      chips.append(chip("分析排版", () => void analyzeLayout()));
      chips.append(chip("应用指令", () => void applyPendingLayout()));
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
    const prevId = activeAgentId;
    const agent = getAgent(id);
    activeAgentId = agent.id;
    // Isolate伪表 draft: leaving recover must not leave replace-capable state on normalize.
    if (
      prevId === "m0t.table_recover" &&
      agent.id !== "m0t.table_recover" &&
      draft
    ) {
      draft = null;
      addMessage(
        "system",
        "已离开伪表恢复：清除未落地的识别稿，避免在其它场景误替换。",
      );
    }
    // Isolate对照稿：离开比对场景清除上传稿，避免会话内残留外发面。
    if (
      prevId === "m0.copy_compare" &&
      agent.id !== "m0.copy_compare" &&
      compareDoc
    ) {
      compareDoc = null;
      addMessage("system", "已离开文稿比对：清除上传的对照稿。");
    }
    if (
      prevId === "m0.layout_assist" &&
      agent.id !== "m0.layout_assist" &&
      pendingLayoutCommands
    ) {
      pendingLayoutCommands = null;
      addMessage("system", "已离开选区排版：清除未应用的指令预览。");
    }
    if (
      prevId === "m0.grep_assist" &&
      agent.id !== "m0.grep_assist" &&
      pendingGrepFind
    ) {
      pendingGrepFind = null;
      addMessage("system", "已离开 GREP 助手：清除待写入的表达式。");
    }
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

  function setCompareParsing(v: boolean): void {
    compareParsing = v;
    compareFileInput.disabled = v;
    compareClearBtn.classList.toggle("disabled", v);
    if (v) {
      compareDocStatus.textContent = "正在解析对照稿…";
    } else {
      refreshCompareDocStatus();
    }
  }

  compareFileInput.addEventListener("change", () => {
    const file = compareFileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      addMessage(
        "assistant",
        `文件过大（${(file.size / (1024 * 1024)).toFixed(1)}MB）。请压缩到 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB 以内后再上传。`,
      );
      compareFileInput.value = "";
      return;
    }
    const gen = ++compareUploadGen;
    setCompareParsing(true);
    void (async () => {
      try {
        const buf = await file.arrayBuffer();
        if (gen !== compareUploadGen) return;
        const result = await extractDocumentText(
          file.name,
          new Uint8Array(buf),
        );
        if (gen !== compareUploadGen) return;
        if (!result.text.trim()) {
          addMessage(
            "assistant",
            `未能从「${file.name}」抽出文字。${result.warnings.join("；") || "请换 txt/docx/xlsx，或另存为可搜索 PDF。"}`,
          );
          return;
        }
        compareDoc = {
          fileName: result.fileName,
          format: result.format,
          text: result.text,
        };
        const warn = result.warnings.length
          ? `\n注意：${result.warnings.join("；")}`
          : "";
        addMessage(
          "system",
          `已载入对照稿「${result.fileName}」（${result.format} · ${result.text.length} 字）。可点「开始比对」或直接说明要比对的范围。首次发送前会确认外发目标。${warn}`,
        );
      } catch (e) {
        if (gen !== compareUploadGen) return;
        addMessage(
          "assistant",
          `上传对照稿失败：${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        if (gen === compareUploadGen) {
          compareFileInput.value = "";
          setCompareParsing(false);
        }
      }
    })();
  });

  compareClearBtn.addEventListener("click", () => {
    if (compareParsing) {
      compareUploadGen += 1;
      setCompareParsing(false);
    }
    compareDoc = null;
    refreshCompareDocStatus();
    addMessage("system", "已清除上传的对照稿。");
  });

  async function doLock(): Promise<void> {
    const snapshot = await readSelectionSnapshot();
    if (snapshot.selection.length === 0) {
      addMessage(
        "assistant",
        activeAgentId === "m0.layout_assist"
          ? "当前没有选区。请先选中正文文本框，再点「读取选区」。"
          : "当前没有选区。请先在页面上选中矢量伪表组合，再让我读取。",
      );
      return;
    }
    const ub = unionBounds(snapshot.selection);
    lockSelection(snapshot, ub);
    await refreshStylesSilent();
    const nextHint =
      activeAgentId === "m0.layout_assist"
        ? "下一步可点「分析排版」。"
        : activeAgentId === "m0.proofread"
          ? "下一步可以说「校对选区」。"
          : "下一步可以说「识别表格」。";
    addMessage(
      "assistant",
      (() => {
        const notes = snapshot.selection
          .map((s) => (s.type === "graphic" ? s.notes : undefined))
          .filter(Boolean);
        return `已锁定：${selectionSummary(snapshot.selection)} · 页 ${snapshot.pageIndex + 1}${notes.length ? `\n${notes.join("\n")}` : ""}\n${nextHint}`;
      })(),
    );
  }

  async function analyzeLayout(): Promise<void> {
    const locked = getLockedSelection();
    if (!locked) {
      addMessage("assistant", "请先「读取选区」锁定要微调的文本框。");
      return;
    }
    const ready = resolveReadySettings();
    if (!ready.ok) {
      addMessage("assistant", ready.reason);
      switchTab("config");
      return;
    }
    const s = ready.settings;
    const okEgress = await ensureEgressAllowed(s.baseUrl, "document");
    if (!okEgress) {
      addMessage("assistant", "已取消：未调用模型分析排版。");
      return;
    }
    setBusy(true);
    try {
      addMessage("assistant", "正在分析选区并生成白名单指令预览…");
      const note =
        (composer.value || "").trim() ||
        "请对锁定文本框给出最小必要的排版微调（字号/行距/对齐/样式）。";
      const commands = await directChatCommands(s, {
        op: "analyze_and_plan",
        snapshot: locked.snapshot,
        userNote: note,
      });
      const gate = validateCommandBatch(commands);
      if (!gate.ok) {
        pendingLayoutCommands = null;
        addMessage(
          "assistant",
          `模型指令未通过白名单校验（未改文档）：${gate.error.message}`,
        );
        return;
      }
      if (commands.length === 0) {
        pendingLayoutCommands = null;
        addMessage("assistant", "模型未给出可执行指令（commands 为空）。可换描述后再分析。");
        return;
      }
      pendingLayoutCommands = commands;
      const preview = commands
        .slice(0, 12)
        .map((c, i) => `${i + 1}. ${c.type} ${JSON.stringify(c)}`)
        .join("\n");
      addMessage(
        "assistant",
        `已生成 ${commands.length} 条指令预览（尚未写入文档）。确认无误后点「应用指令」。\n${preview}${commands.length > 12 ? "\n…" : ""}`,
      );
    } catch (e) {
      pendingLayoutCommands = null;
      addMessage(
        "assistant",
        `分析排版失败：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyPendingLayout(): Promise<void> {
    if (!pendingLayoutCommands?.length) {
      addMessage("assistant", "没有待应用的指令。请先「分析排版」。");
      return;
    }
    const gate = validateCommandBatch(pendingLayoutCommands);
    if (!gate.ok) {
      pendingLayoutCommands = null;
      addMessage("assistant", `指令已失效：${gate.error.message}`);
      return;
    }
    setBusy(true);
    try {
      addMessage("assistant", `正在应用 ${pendingLayoutCommands.length} 条白名单指令…`);
      const report = await runCommandBatch({
        requestId: newId(),
        commands: pendingLayoutCommands,
        host: getHost(),
      });
      if (!report.ok) {
        const err =
          report.results.find((r) => !r.ok)?.error?.message || "未知错误";
        addMessage(
          "assistant",
          `应用未完成：${err}\n可用 Undo 回退已写入部分。`,
        );
        return;
      }
      pendingLayoutCommands = null;
      addMessage("assistant", "排版指令已全部应用。可用 Undo 整批回退。");
    } catch (e) {
      addMessage(
        "assistant",
        `应用失败：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
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
    // Host quality hook (88_03): advisory only — never blocks replace.
    const lang = assessHeaderLanguage(draft);
    if (lang.message) {
      addMessage("assistant", lang.message);
    }
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

  async function buildAgentContext(): Promise<AgentRuntimeContext> {
    const locked = getLockedSelection();
    const preview = draft
      ? draft.rows
          .slice(0, 6)
          .map((r) => r.join(" | "))
          .join("\n")
      : "";
    let selectionText = selectionTextFromSnapshot(locked?.snapshot ?? null);
    let summary = locked ? selectionSummary(locked.snapshot.selection) : "";
    // Live selection — only agents that need layout text (99_07 F7)
    if (
      !selectionText &&
      shouldHarvestLiveSelection(activeAgentId) &&
      isInDesignRuntime()
    ) {
      try {
        const live = await readSelectionSnapshot();
        selectionText = selectionTextFromSnapshot(live);
        if (!summary && live.selection.length) {
          summary = selectionSummary(live.selection);
        }
      } catch {
        /* ignore */
      }
    }
    let clipboardText = "";
    if (shouldReadClipboard(activeAgentId)) {
      try {
        clipboardText = await readClipboardText();
      } catch {
        clipboardText = "";
      }
    }
    const injectCompare = shouldInjectCompareDocument(activeAgentId);
    const lang = draft
      ? assessHeaderLanguage(draft)
      : { likelyDroppedCjk: false, message: null as string | null };
    return {
      selectionLocked: Boolean(locked),
      selectionSummary: summary,
      selectionText,
      clipboardText,
      compareDocumentText: injectCompare ? compareDoc?.text ?? "" : "",
      compareDocumentName: injectCompare ? compareDoc?.fileName ?? "" : "",
      compareDocumentFormat: injectCompare ? compareDoc?.format ?? "" : "",
      hasDraft: Boolean(draft),
      readyToReplace: Boolean(draft),
      draftPreview: preview,
      headerLikelyDroppedCjk: lang.likelyDroppedCjk,
      draftQualityHint: lang.message || "",
      tableStyles: [...tableStyles],
      selectedStyle: (styleSelect.value || "").trim(),
      hasPatchImage: Boolean(imageDataUrl),
      paragraphStyles: [...paragraphStyles],
      characterStyles: [...characterStyles],
    };
  }

  async function runApplyGrepStyle(opts: {
    paragraphStyleName: string;
    characterStyleName: string;
    find: string;
  }): Promise<void> {
    const para = opts.paragraphStyleName.trim();
    const ch = opts.characterStyleName.trim();
    const find = opts.find.trim();
    if (!para || !ch || !find) {
      addMessage("assistant", "写入 GREP 样式需要：段落样式名、字符样式名、查找式。");
      return;
    }
    if (!isInDesignRuntime()) {
      addMessage(
        "assistant",
        `（浏览器桩）将把 GREP「${find}」写入段落样式「${para}」→ 字符样式「${ch}」。`,
      );
      pendingGrepFind = null;
      return;
    }
    const result = await applyNestedGrepStyle({
      paragraphStyleName: para,
      characterStyleName: ch,
      grepExpression: find,
    });
    addMessage("assistant", result.message);
    if (result.ok) pendingGrepFind = null;
  }

  function filterActionsForAgent(actions: AgentAction[]): AgentAction[] {
    const { kept, dropped } = filterActionsByAllowlist(
      actions,
      getAgent(activeAgentId).allowedActions,
    );
    if (dropped.length) {
      addMessage(
        "system",
        `已忽略当前 Agent 不允许的动作（${dropped
          .map((a) => a.type)
          .join(", ")}）。`,
      );
    }
    return kept;
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
          if (activeAgentId === "m0.grep_assist") {
            const para = paragraphStyles.length
              ? `段落样式：\n${paragraphStyles
                  .slice(0, 40)
                  .map((n) => `· ${n}`)
                  .join("\n")}${paragraphStyles.length > 40 ? "\n…" : ""}`
              : "未读到段落样式。";
            const ch = characterStyles.length
              ? `字符样式：\n${characterStyles
                  .slice(0, 40)
                  .map((n) => `· ${n}`)
                  .join("\n")}${characterStyles.length > 40 ? "\n…" : ""}`
              : "未读到字符样式。";
            addMessage("assistant", `${para}\n\n${ch}`);
          } else {
            addMessage(
              "assistant",
              tableStyles.length
                ? `文档表样式：\n${tableStyles.map((n) => `· ${n}`).join("\n")}`
                : "还没有读到表样式。",
            );
          }
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
          pendingGrepFind = action.find;
          const lines = [
            "【InDesign GREP · 可复制到查找/更改】",
            `查找：${action.find}`,
          ];
          if (action.changeTo !== undefined) {
            lines.push(`替换为：${action.changeTo}`);
          }
          if (action.flags) lines.push(`选项：${action.flags}`);
          if (action.note) lines.push(`说明：${action.note}`);
          const actionsRow = el("div", { className: "chips" });
          const copyFind = el("div", { className: "chip", role: "button" }, [
            "复制查找式",
          ]);
          copyFind.addEventListener("click", () => {
            void writeClipboardText(action.find).then((ok) => {
              addMessage(
                "system",
                ok ? "查找式已复制到剪贴板。" : "复制失败，请手动选中上方查找式。",
              );
            });
          });
          actionsRow.append(copyFind);
          if (action.changeTo !== undefined) {
            const copyRep = el("div", { className: "chip", role: "button" }, [
              "复制替换式",
            ]);
            copyRep.addEventListener("click", () => {
              void writeClipboardText(action.changeTo || "").then((ok) => {
                addMessage(
                  "system",
                  ok ? "替换式已复制到剪贴板。" : "复制失败，请手动选中。",
                );
              });
            });
            actionsRow.append(copyRep);
          }
          const writeChip = el("div", { className: "chip", role: "button" }, [
            "写入段落样式",
          ]);
          writeChip.addEventListener("click", () => {
            void (async () => {
              await refreshStylesSilent();
              const paraHint = paragraphStyles.slice(0, 8).join("、") || "（无）";
              const charHint = characterStyles.slice(0, 8).join("、") || "（无）";
              addMessage(
                "assistant",
                `要把查找式写入 Nested GREP Style，请回复：\n写入「段落样式名」用「字符样式名」\n例：写入「正文」用「价格」\n当前段样式示例：${paraHint}\n当前字符样式示例：${charHint}`,
              );
            })();
          });
          actionsRow.append(writeChip);
          addMessage("assistant", lines.join("\n"), actionsRow);
          break;
        }
        case "apply_grep_style": {
          await runApplyGrepStyle({
            paragraphStyleName: action.paragraphStyleName,
            characterStyleName: action.characterStyleName,
            find: action.find,
          });
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

    // GREP Style write utterance after propose_grep chip prompt
    if (pendingGrepFind && activeAgentId === "m0.grep_assist") {
      const m =
        /写入[「"“]?(.+?)[」"”]?\s*用[「"“]?(.+?)[」"”]?\s*$/.exec(text) ||
        /把.?GREP.?写入[「"“]?(.+?)[」"”].*字符样式[「"“]?(.+?)[」"”]/.exec(text);
      if (m) {
        await runApplyGrepStyle({
          paragraphStyleName: m[1]!.trim(),
          characterStyleName: m[2]!.trim(),
          find: pendingGrepFind,
        });
        return;
      }
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
      // 99_07 F5: confirm before sending uploaded/clipboard对照稿 to BYOK
      if (
        activeAgentId === "m0.copy_compare" &&
        (compareDoc?.text || shouldReadClipboard(activeAgentId))
      ) {
        const needsDocGate =
          Boolean(compareDoc?.text) ||
          Boolean((await readClipboardText().catch(() => "")).trim());
        if (needsDocGate) {
          const ok = await ensureEgressAllowed(s.baseUrl, "document");
          if (!ok) {
            addMessage("assistant", "已取消：对照稿未发送到模型。");
            return;
          }
        }
      }

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
        context: await buildAgentContext(),
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

      const recommendId = (decision.recommendAgentId || "").trim();
      const recommendHit = recommendId
        ? listSpecializedAgents().find((a) => a.id === recommendId)
        : undefined;
      if (recommendId && !recommendHit) {
        addMessage(
          "system",
          `模型建议的 Agent「${recommendId}」不在目录中，已忽略转交。`,
        );
      }
      const handoff = recommendHit
        ? el("div", { className: "chips" }, [
            (() => {
              const b = el(
                "div",
                { className: "chip", role: "button" },
                [`加载「${recommendHit.name}」`],
              );
              b.addEventListener("click", () => {
                activateAgent(recommendHit.id, { announce: true });
              });
              return b;
            })(),
          ])
        : undefined;
      addMessage("assistant", decision.reply, handoff);

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
      // Recover-only: never re-inject replace_table for normalize/other agents (99_07 F17).
      if (maySanitizeReplaceForAgent(activeAgentId)) {
        const style =
          (styleSelect.value || "").trim() ||
          loadMemory().projects[activeProjectKey]?.preferredTableStyle ||
          "";
        const shaped = sanitizeActionsForReplace({
          actions,
          userText: text,
          hasDraft: Boolean(draft),
          styleName: style,
        });
        if (shaped.skippedVision) {
          addMessage("system", "已有识别结果：跳过重新识图，只执行替换。");
        }
        actions = filterActionsForAgent(shaped.actions);
      }
      if (actions.length) {
        await executeAgentActions(actions);
      } else if (
        activeAgentId === "m0t.table_recover" &&
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

  // Dropdown: record preferred style for table agents; auto-replace only in伪表恢复.
  styleSelect.addEventListener("change", () => {
    if (!getAgent(activeAgentId).ui.showTableTools) return;
    updateStyleSelectHint();
    const name = (styleSelect.value || "").trim();
    if (!name) return;
    if (busy) {
      addMessage("system", `已记下「${name}」。`);
      return;
    }
    if (activeAgentId === "m0t.table_recover" && draft) {
      void handleUserText(
        `我选择了表样式「${name}」。请用它把已识别的表格替换到当前锁定选区，不要重新识别。`,
      );
      return;
    }
    addMessage("user", `表样式「${name}」。`);
    const assist =
      activeAgentId === "m0.table_normalize"
        ? `已记下「${name}」。可说「规范化」套用到当前真表。`
        : `已记下「${name}」。`;
    history = [
      ...history,
      { role: "user" as const, text: `表样式「${name}」。` },
      { role: "assistant" as const, text: assist },
    ].slice(-20);
    chatByProject.set(activeProjectKey, history);
    addMessage("assistant", assist);
    const mem = loadMemory();
    if (activeProjectKey && activeProjectKey !== "no-doc") {
      rememberNote(mem, {
        scope: "project",
        projectKey: activeProjectKey,
        text: `用户偏好表样式「${name}」`,
        taskId:
          activeAgentId === "m0.table_normalize"
            ? "m0.normalize_table_style"
            : "m0t.replace_with_style",
      });
      const project = mem.projects[activeProjectKey];
      if (project) {
        project.preferredTableStyle = name;
        saveMemory(mem);
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
      ? "你好，我是画册/内页工艺顾问。直接说需求；改文档时转交专属 Agent。模型在「配置」。"
      : "未连接 InDesign。",
  );
}
