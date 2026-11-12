import { listProviders } from "../providers/registry.js";
import { loadSettings, maskApiKey, saveSettings } from "../settings/store.js";
import type { ProviderSettings, ProviderType, TableDraft } from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";

const PLUGIN_UI_VERSION = "0.2.7";

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
import { preflightTableReplace } from "../m0t/preflight.js";
import { validateTableDraft } from "../protocol/tableDraft.js";
import { el } from "./dom.js";
import { parseChatIntent } from "./chatIntent.js";

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
  /** UXP has no window.confirm — only destructive replace asks in chat. */
  let pending: null | { type: "replace"; styleName: string } = null;

  const chatLog = el("div", { className: "chat-log", id: "chatLog" });
  const composer = el("textarea", {
    id: "composer",
    className: "composer",
    rows: "2",
    placeholder: "选中后直接说：转成表格 / 用「样式名」转成表格…",
  }) as HTMLTextAreaElement;
  const thumb = el("img", {
    id: "thumb",
    className: "thumb hidden",
    alt: "选区预览",
  }) as HTMLImageElement;

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

  function setBusy(v: boolean): void {
    busy = v;
    sendBtn.classList.toggle("ctl-disabled", v);
    composer.disabled = v;
  }

  async function refreshStylesSilent(): Promise<void> {
    try {
      if (!isInDesignRuntime()) {
        tableStyles = ["Catalog-Table"];
        return;
      }
      tableStyles = await listTableStyleNames();
    } catch {
      tableStyles = [];
    }
    styleSelect.innerHTML = "";
    if (tableStyles.length === 0) {
      styleSelect.append(el("option", { value: "" }, ["（打开文档后可刷新样式）"]));
      return;
    }
    for (const name of tableStyles) {
      styleSelect.append(el("option", { value: name }, [name]));
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
    el("p", { className: "lede" }, ["模型与中转只在这里改，对话里专心处理版面。"]),
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
        placeholder: "gpt-4o / claude-… / gemini-…",
      }),
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
    chip("替换为真表", () => void handleUserText("替换为真表")),
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

  chatView.append(chatLog, thumb, chips, composerBar);

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
      `配置已保存：${next.provider} · model=${next.model || "（空）"} · key=${maskApiKey(next.apiKey)}`,
    );
    switchTab("chat");
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result || "");
      thumb.src = imageDataUrl;
      thumb.classList.remove("hidden");
      addMessage("system", "已载入补图。可以说「识别表格」。");
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
      thumb.src = imageDataUrl;
      thumb.classList.remove("hidden");
      if (cap.warnings.length) {
        addMessage("system", cap.warnings.join("；"));
      }
      addMessage("system", "选区图已导出。");
    }

    addMessage(
      "assistant",
      `② 正在调用模型识别（${s.model} → ${s.baseUrl}，超时 ${Math.round(s.timeoutMs / 1000)}s）…`,
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
    if (!opts?.quiet) {
      addMessage(
        "assistant",
        `识别到 ${draft.rows.length} 行 × ${draft.rows[0]?.length ?? 0} 列（表头 ${draft.headerRowCount} / 表尾 ${draft.footerRowCount}）。\n\n预览：\n${preview}${draft.rows.length > 8 ? "\n…" : ""}\n\n请选择表样式，然后说「替换为真表」；或直接说「转成表格」走全流程。`,
      );
    } else {
      addMessage(
        "assistant",
        `识别完成：${draft.rows.length} 行 × ${draft.rows[0]?.length ?? 0} 列。\n${preview}${draft.rows.length > 8 ? "\n…" : ""}`,
      );
    }
    return true;
  }

  function resolveStyleName(preferred?: string): string | null {
    const fromArg = (preferred || "").trim();
    if (fromArg) return fromArg;
    const fromSelect = (styleSelect.value || "").trim();
    if (fromSelect) return fromSelect;
    const suggested = (draft?.suggestedTableStyleName || "").trim();
    if (suggested && tableStyles.includes(suggested)) return suggested;
    if (tableStyles.length === 1) return tableStyles[0]!;
    return null;
  }

  async function requestReplace(styleName?: string): Promise<void> {
    const locked = getLockedSelection();
    if (!locked) {
      addMessage("assistant", "没有锁定选区，无法替换。");
      return;
    }
    if (!draft) {
      addMessage("assistant", "还没有识别结果。先说「识别表格」。");
      return;
    }
    const name = (styleName || styleSelect.value || "").trim();
    if (!name) {
      addMessage("assistant", "请先选择或指定一个文档里已有的表样式。");
      await refreshStylesSilent();
      return;
    }
    const host = getHost();
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
    pending = { type: "replace", styleName: name };
    addMessage(
      "assistant",
      `将创建真表并删除原矢量，样式「${name}」（可 Undo）。\n回复「确认」继续，或「取消」。`,
    );
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
    thumb.classList.add("hidden");
    addMessage("assistant", `完成：已用样式「${styleName}」生成真表，原矢量已删除。`);
  }

  /** One-shot: lock → recognize → replace (no extra confirm). */
  async function doAutoTable(styleName?: string, note?: string): Promise<void> {
    const s = loadSettings();
    if (!s.baseUrl || !s.apiKey || !s.model) {
      addMessage("assistant", "模型还没配好。请到「配置」填 Base URL / API Key / 识图 Model。");
      switchTab("config");
      return;
    }

    if (!getLockedSelection()) {
      addMessage("assistant", "开始全流程：先读取当前选区…");
      await doLock();
      if (!getLockedSelection()) return;
    } else {
      addMessage("assistant", "开始全流程：已有锁定选区，进入识别…");
    }

    await refreshStylesSilent();
    imageDataUrl = ""; // force fresh capture for auto run
    const ok = await doRecognize(note, { quiet: true });
    if (!ok || !draft) return;

    const name = resolveStyleName(styleName);
    if (!name) {
      addMessage(
        "assistant",
        tableStyles.length
          ? `识别已完成，但还不知道用哪个表样式。请在下方选择，或说「用「样式名」替换」。\n可用：\n${tableStyles.map((n) => `· ${n}`).join("\n")}`
          : "识别已完成，但文档里没有可用表样式。请先在 InDesign 建好表样式。",
      );
      return;
    }

    styleSelect.value = name;
    const host = getHost();
    const locked = getLockedSelection();
    if (!locked) {
      addMessage("assistant", "选区在识别后失效，请重新选中后再说「转成表格」。");
      return;
    }
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
    addMessage("assistant", `样式「${name}」预检通过，开始替换（可 Undo）…`);
    await runReplace(name);
  }

  async function handleUserText(raw: string): Promise<void> {
    if (busy) return;
    const text = raw.trim();
    if (!text) return;
    addMessage("user", text);
    composer.value = "";
    const intent = parseChatIntent(text);
    setBusy(true);
    try {
      if (pending && intent.kind !== "confirm" && intent.kind !== "cancel") {
        addMessage(
          "assistant",
          "还有待确认的替换。请先回复「确认」或「取消」。",
        );
        return;
      }

      switch (intent.kind) {
        case "confirm":
          if (!pending) {
            addMessage("assistant", "当前没有待确认的操作。");
            break;
          }
          {
            const job = pending;
            pending = null;
            await runReplace(job.styleName);
          }
          break;
        case "cancel":
          if (!pending) {
            addMessage("assistant", "没有可取消的待确认操作。");
            break;
          }
          pending = null;
          addMessage("system", "已取消。");
          break;
        case "help":
          addMessage(
            "assistant",
            "可以这样说：\n· 转成表格（全自动：读取→识别→替换）\n· 用「样式名」转成表格\n· 读取选区 / 识别表格 / 替换为真表（分步）\n· 有哪些表样式\n· 配置\n\n推荐：选中矢量伪表后直接说「转成表格」。",
          );
          break;
        case "config":
          switchTab("config");
          addMessage("assistant", "已打开配置。改完点保存，再回来对话。");
          break;
        case "clear":
          pending = null;
          chatLog.innerHTML = "";
          addMessage("assistant", "对话已清空。选中矢量表后，说「读取选区」开始。");
          break;
        case "status": {
          const locked = getLockedSelection();
          addMessage(
            "assistant",
            `运行时：${isInDesignRuntime() ? "InDesign" : "非宿主"}\n选区：${locked ? selectionSummary(locked.snapshot.selection) : "未锁定"}\n识别稿：${draft ? `${draft.rows.length} 行` : "无"}\n待确认：${pending ? pending.type : "无"}\n样式数：${tableStyles.length}`,
          );
          break;
        }
        case "styles":
          await refreshStylesSilent();
          addMessage(
            "assistant",
            tableStyles.length
              ? `文档表样式：\n${tableStyles.map((n) => `· ${n}`).join("\n")}`
              : "还没有读到表样式。请先打开文档并选中对象后再试。",
          );
          break;
        case "lock":
          await doLock();
          break;
        case "recognize":
          await doRecognize(intent.note);
          break;
        case "autoTable":
          await doAutoTable(intent.styleName, intent.note);
          break;
        case "replace":
          await requestReplace(intent.styleName);
          break;
        case "unknown":
          addMessage(
            "assistant",
            "我还没听懂。可以说「转成表格」走全流程，或说「帮助」。",
          );
          break;
      }
    } catch (e) {
      addMessage("assistant", `出错了：${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

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
  addMessage(
    "assistant",
    isInDesignRuntime()
      ? "你好。打开画册、选中矢量伪表后，直接说「转成表格」——我会自动读取、识别并替换。表样式可在下方先选好，或说「用「样式名」转成表格」。模型在「配置」。"
      : "当前不在 InDesign 面板环境。连上宿主后即可处理真表替换。",
  );
}
