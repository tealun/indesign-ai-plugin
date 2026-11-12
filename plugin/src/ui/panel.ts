import { listProviders } from "../providers/registry.js";
import { loadSettings, maskApiKey, saveSettings } from "../settings/store.js";
import type {
  OpenAiWireApi,
  ProviderSettings,
  ProviderType,
  TableDraft,
} from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";

const PLUGIN_UI_VERSION = "0.3.3";

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
  return {
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
  /** Per-document chat histories — never share across open files. */
  const chatByProject = new Map<string, AgentChatMessage[]>();
  let activeProjectKey = "no-doc";
  let history: AgentChatMessage[] = [];
  let lastTaskId = "";

  const chatLog = el("div", { className: "chat-log", id: "chatLog" });
  const composer = el("textarea", {
    id: "composer",
    className: "composer",
    rows: "2",
    placeholder: "自然说即可，例如：把这个转成真表，用货号信息表…",
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
    sendBtn.classList.toggle("ctl-disabled", v);
    composer.disabled = v;
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
  const tabConfig = el("div", { className: "tab", role: "button" }, ["配置"]);
  const tabs = el("div", { className: "tabs" }, [tabChat, tabConfig]);

  const chatView = el("section", { className: "view view-chat" });
  const configView = el("section", { className: "view view-config hidden" });

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
      "模型与中转只在这里改。若你的 Codex/中转配置是 wire_api=responses，下方 Wire API 必须选 Responses，否则会打到 /chat/completions 并 404。",
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
    el("div", { id: "saveConfig", className: "ctl ctl-primary", role: "button" }, [
      "保存配置",
    ]),
  );

  // —— Chat chrome ——
  const styleSelect = el("select", { id: "tableStyle", className: "style-select" });
  const chips = el("div", { className: "chips" }, [
    chip("转成表格", () => void handleUserText("转成表格")),
    chip("读取选区", () => void handleUserText("读取选区")),
    chip("识别表格", () => void handleUserText("识别表格")),
    chip("替换为真表", () => {
      const style = (styleSelect.value || "").trim();
      void handleUserText(
        style
          ? `把已识别好的表格文字，用表样式「${style}」直接替换到当前锁定选区。不要重新识别，不要从头执行。`
          : "把已识别好的表格文字直接替换到当前锁定选区（用我选的/项目偏好表样式）。不要重新识别，不要从头执行。",
      );
    }),
  ]);

  const sendBtn = el("div", { className: "ctl ctl-primary send", role: "button" }, [
    "发送",
  ]);
  const fileInput = el("input", {
    id: "pasteFile",
    type: "file",
    accept: "image/*",
    className: "file-input",
  }) as HTMLInputElement;

  const composerBar = el("div", { className: "composer-bar" }, [
    el("div", { className: "composer-meta" }, [
      el("span", { className: "meta-label" }, ["表样式"]),
      styleSelect,
      el("label", { className: "file-label", for: "pasteFile" }, ["补图"]),
      fileInput,
    ]),
    composer,
    el("div", { className: "composer-actions" }, [sendBtn]),
  ]);

  chatView.append(chatLog, chips, composerBar);

  root.append(
    el("header", { className: "top" }, [
      el("div", {}, [
        el("h1", {}, ["InDesign AI"]),
        el("p", { className: "sub" }, [`对话顾问 · v${PLUGIN_UI_VERSION}`]),
      ]),
      tabs,
    ]),
    chatView,
    configView,
  );

  function chip(label: string, onClick: () => void): HTMLDivElement {
    const b = el("div", { className: "chip", role: "button" }, [label]);
    b.addEventListener("click", onClick);
    return b;
  }

  function switchTab(which: "chat" | "config"): void {
    const chat = which === "chat";
    tabChat.classList.toggle("active", chat);
    tabConfig.classList.toggle("active", !chat);
    chatView.classList.toggle("hidden", !chat);
    configView.classList.toggle("hidden", chat);
  }

  tabChat.addEventListener("click", () => switchTab("chat"));
  tabConfig.addEventListener("click", () => switchTab("config"));

  configView.querySelector("#saveConfig")?.addEventListener("click", () => {
    const next = readConfigForm(root);
    if (!(root.querySelector("#apiKey") as HTMLInputElement).value) {
      next.apiKey = loadSettings().apiKey;
    }
    saveSettings(next);
    addMessage(
      "system",
      `配置已保存：${next.provider} · wire=${next.wireApi || "chat_completions"} · model=${next.model || "（空）"} · key=${maskApiKey(next.apiKey)}`,
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
      `已锁定选区：${selectionSummary(snapshot.selection)}\n页面 ${snapshot.pageIndex + 1} · ${ub.w.toFixed(1)}×${ub.h.toFixed(1)} pt\n下一步可以说「识别表格」。`,
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
    const s = loadSettings();
    if (!s.baseUrl || !s.apiKey || !s.model) {
      addMessage("assistant", "模型还没配好。请到「配置」填 Base URL / API Key / 识图 Model。");
      switchTab("config");
      return false;
    }

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
    if (next.length !== actions.length) {
      addMessage(
        "system",
        "已有识别结果：跳过重新识图，只执行替换。",
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
        case "recognize_table":
          if (draft) {
            addMessage("system", "识别稿已在，跳过重复识图。");
            break;
          }
          await doRecognize(undefined, { quiet: true });
          break;
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
    if (busy) return;
    const text = raw.trim();
    if (!text) return;
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

    const s = loadSettings();
    if (!s.baseUrl || !s.apiKey || !s.model) {
      addMessage("assistant", "模型还没配好。请到「配置」填好中转与 Model（Wire API 按你的 Codex 选 Responses）。");
      switchTab("config");
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
      // Prefer project style in UI when empty
      if (!styleSelect.value && experience.projectPreferredTableStyle) {
        const hit = matchTableStyleName(
          experience.projectPreferredTableStyle,
          tableStyles,
        );
        if (hit) styleSelect.value = hit;
      }

      addMessage("system", "顾问正在结合项目经验与上下文理解…");
      const decision = await directAgentTurn(s, {
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
      lastTaskId = decision.taskId || "";
      history = [
        ...history,
        { role: "user" as const, text },
        { role: "assistant" as const, text: decision.reply },
      ].slice(-20);
      chatByProject.set(activeProjectKey, history);

      const taskLabel = decision.taskId ? ` · 任务 ${decision.taskId}` : "";
      addMessage("assistant", decision.reply + (taskLabel ? `\n（${taskLabel.trim()}）` : ""));

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

      const actions = sanitizeActionsForReplace(decision.actions, text);
      if (actions.length) {
        addMessage(
          "system",
          `执行：${actions.map((a) => a.type).join(" → ")}`,
        );
        await executeAgentActions(actions);
      } else if (draft && /(替换|成真表)/.test(text) && !(styleSelect.value || "").trim()) {
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

  // Dropdown selection IS user feedback — mirror into chat and continue if draft ready.
  styleSelect.addEventListener("change", () => {
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
  addMessage(
    "assistant",
    isInDesignRuntime()
      ? "你好。我按「打开的文档」隔离项目经验：识别任务 → 执行已实现的程序化步骤，并沉淀 agent/用户/项目/任务经验。直接说你想做什么即可。模型在「配置」。"
      : "当前不在 InDesign 面板环境。连上宿主后即可处理真表替换。",
  );
}
