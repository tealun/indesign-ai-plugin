import { listProviders } from "../providers/registry.js";
import { loadSettings, maskApiKey, saveSettings } from "../settings/store.js";
import type { ProviderSettings, ProviderType, TableDraft } from "../types/protocol.js";
import { PROTOCOL_VERSION } from "../types/protocol.js";
import { createStubHost } from "../executor/stubHost.js";
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

function persistForm(root: HTMLElement): ProviderSettings {
  const next = readForm(root);
  if (!(root.querySelector("#apiKey") as HTMLInputElement).value) {
    next.apiKey = loadSettings().apiKey;
  }
  saveSettings(next);
  return next;
}

function setStatus(root: HTMLElement, text: string): void {
  const status = root.querySelector("#status");
  if (status) status.textContent = text;
}

function renderDraftEditor(container: HTMLElement, draft: TableDraft): void {
  container.innerHTML = "";
  const meta = el("div", { className: "row" }, [
    el("label", {}, [
      "表头行数",
      el("input", {
        id: "hdr",
        type: "number",
        min: "1",
        value: String(draft.headerRowCount),
      }),
    ]),
    el("label", {}, [
      "表尾行数",
      el("input", {
        id: "ftr",
        type: "number",
        min: "0",
        value: String(draft.footerRowCount),
      }),
    ]),
  ]);
  const ta = el("textarea", {
    id: "draftTsv",
    rows: "10",
    placeholder: "制表符分隔：每行一表行",
  });
  ta.value = draft.rows.map((r) => r.join("\t")).join("\n");
  container.append(
    el("p", { className: "hint" }, ["可改数字与表格文本（TSV：列用 Tab 分隔）"]),
    meta,
    ta,
  );
}

function readDraftFromEditor(container: HTMLElement): TableDraft {
  const hdr = Number(
    (container.querySelector("#hdr") as HTMLInputElement | null)?.value || 1,
  );
  const ftr = Number(
    (container.querySelector("#ftr") as HTMLInputElement | null)?.value || 0,
  );
  const tsv =
    (container.querySelector("#draftTsv") as HTMLTextAreaElement | null)?.value ||
    "";
  const rows = tsv
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
  return {
    headerRowCount: hdr,
    footerRowCount: ftr,
    rows,
  };
}

function getHost() {
  return isInDesignRuntime() ? createIndesignHost() : createStubHost();
}

export function mountPanel(root: HTMLElement): void {
  const settings = loadSettings();
  root.innerHTML = "";
  root.className = "panel-root";

  let imageDataUrl = "";
  let draft: TableDraft | null = null;
  let tableStyles: string[] = [];

  const status = el("p", { id: "status", className: "status" }, [
    isInDesignRuntime()
      ? `可用版 · protocol ${PROTOCOL_VERSION} · InDesign 已连接`
      : `预览模式 · protocol ${PROTOCOL_VERSION} · 未连接 InDesign（仅 stub）`,
  ]);

  const thumb = el("img", {
    id: "thumb",
    className: "thumb hidden",
    alt: "选区预览",
  }) as HTMLImageElement;

  const draftBox = el("div", { id: "draftBox", className: "card hidden" });
  const styleSelect = el("select", { id: "tableStyle" });

  const providerOptions = listProviders().map((p) =>
    el(
      "option",
      { value: p.id, ...(p.id === settings.provider ? { selected: "selected" } : {}) },
      [`${p.label}${p.vision ? " · vision" : ""}`],
    ),
  );

  const settingsCard = el("details", { className: "card", open: "true" }, [
    el("summary", {}, ["1. 模型设置（中转 URL + Key）"]),
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
      `API Key${settings.apiKey ? `（已保存 ${maskApiKey(settings.apiKey)}）` : ""}`,
      el("input", {
        id: "apiKey",
        type: "password",
        placeholder: settings.apiKey ? "留空保持原 Key" : "sk-...",
      }),
    ]),
    el("label", {}, [
      "Model（需支持识图）",
      el("input", {
        id: "model",
        type: "text",
        value: settings.model,
        placeholder: "gpt-4o / claude-... / gemini-...",
      }),
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
    el("button", { id: "saveSettings", className: "primary" }, ["保存设置"]),
  ]);

  const workflow = el("div", { className: "card" }, [
    el("h2", {}, ["2. 矢量表 → 真表"]),
    el("p", { className: "hint" }, [
      "在页面选中矢量伪表组合 → 读取选区 → 确认外发截图 → 识别 → 核对后替换",
    ]),
    el("div", { className: "actions" }, [
      el("button", { id: "btnLock" }, ["① 读取选区"]),
      el("button", { id: "btnCapture", className: "primary" }, ["② 导出并识别"]),
    ]),
    thumb,
    el("label", { className: "paste" }, [
      "或粘贴/选择补图（识别不准时）",
      el("input", { id: "pasteFile", type: "file", accept: "image/*" }),
    ]),
    el("label", {}, ["表样式（文档已有）", styleSelect]),
    draftBox,
    el("div", { className: "actions" }, [
      el("button", { id: "btnReplace", className: "primary" }, ["③ 确认替换为真表"]),
    ]),
  ]);

  async function refreshStyles(): Promise<void> {
    styleSelect.innerHTML = "";
    try {
      tableStyles = isInDesignRuntime()
        ? await listTableStyleNames()
        : ["Catalog-Table"];
    } catch (e) {
      tableStyles = [];
      setStatus(root, `读取表样式失败: ${String(e)}`);
    }
    if (tableStyles.length === 0) {
      styleSelect.append(el("option", { value: "" }, ["（文档中未找到表样式）"]));
      return;
    }
    for (const name of tableStyles) {
      styleSelect.append(el("option", { value: name }, [name]));
    }
  }

  root.append(
    el("header", { className: "hero" }, [
      el("h1", {}, ["InDesign AI"]),
      el("p", {}, ["M0-T 可用版 · 矢量伪表转真表"]),
    ]),
    settingsCard,
    workflow,
    status,
  );

  void refreshStyles();

  root.querySelector("#saveSettings")?.addEventListener("click", () => {
    const s = persistForm(root);
    setStatus(root, `设置已保存 · ${s.provider} · ${maskApiKey(s.apiKey)}`);
  });

  root.querySelector("#btnLock")?.addEventListener("click", async () => {
    try {
      const snapshot = await readSelectionSnapshot();
      if (snapshot.selection.length === 0) {
        setStatus(root, "请先在 InDesign 中选中矢量伪表（组合或图形）");
        return;
      }
      const ub = unionBounds(snapshot.selection);
      lockSelection(snapshot, ub);
      setStatus(
        root,
        `已锁定选区: ${selectionSummary(snapshot.selection)} · 页 ${snapshot.pageIndex + 1} · ${ub.w.toFixed(1)}×${ub.h.toFixed(1)} pt`,
      );
      await refreshStyles();
    } catch (e) {
      setStatus(root, `读取选区失败: ${String(e)}`);
    }
  });

  root.querySelector("#pasteFile")?.addEventListener("change", async (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result || "");
      thumb.src = imageDataUrl;
      thumb.classList.remove("hidden");
      setStatus(root, "已载入补图，可点击「导出并识别」或仅用补图识别");
    };
    reader.readAsDataURL(file);
  });

  root.querySelector("#btnCapture")?.addEventListener("click", async () => {
    try {
      const locked = getLockedSelection();
      if (!locked) {
        setStatus(root, "请先点击「读取选区」");
        return;
      }
      const settingsNow = persistForm(root);
      if (!settingsNow.baseUrl || !settingsNow.apiKey || !settingsNow.model) {
        setStatus(root, "请先填写并保存 Base URL / API Key / Model");
        return;
      }

      const okSend = confirm(
        `即将把选区图像发送到：\n${settingsNow.baseUrl}\n\n用于表格识别。是否继续？`,
      );
      if (!okSend) {
        setStatus(root, "已取消外发");
        return;
      }

      setStatus(root, "正在导出选区图…");
      if (!imageDataUrl) {
        const cap = await exportSelectionPng();
        if (!cap.dataUrl) {
          setStatus(root, `导出失败: ${cap.warnings.join("; ") || "无图像"}`);
          return;
        }
        imageDataUrl = cap.dataUrl;
        thumb.src = imageDataUrl;
        thumb.classList.remove("hidden");
        if (cap.warnings.length) {
          setStatus(root, `导出完成（${cap.warnings.join("；")}），正在识别…`);
        } else {
          setStatus(root, "导出完成，正在调用视觉模型…");
        }
      } else {
        setStatus(root, "使用当前图像调用视觉模型…");
      }

      draft = await directRecoverTable(settingsNow, {
        op: "recover_table",
        snapshot: locked.snapshot,
        imageDataUrl,
      });
      const v = validateTableDraft(draft);
      if (!v.ok) {
        setStatus(root, `识别结果不合法: ${v.error.message}`);
        return;
      }
      draft = v.draft;
      if (draft.suggestedTableStyleName) {
        const opt = Array.from(styleSelect.options).find(
          (o) => o.value === draft!.suggestedTableStyleName,
        );
        if (opt) styleSelect.value = draft.suggestedTableStyleName;
      }
      draftBox.classList.remove("hidden");
      renderDraftEditor(draftBox, draft);
      setStatus(
        root,
        `识别成功：${draft.rows.length} 行 × ${draft.rows[0]?.length ?? 0} 列。请核对后选择表样式并替换。`,
      );
    } catch (e) {
      setStatus(root, `识别失败: ${String(e)}`);
    }
  });

  root.querySelector("#btnReplace")?.addEventListener("click", async () => {
    try {
      const locked = getLockedSelection();
      if (!locked) {
        setStatus(root, "缺少锁定选区，请重新读取选区并识别");
        return;
      }
      if (!draft && draftBox.classList.contains("hidden")) {
        setStatus(root, "请先完成识别或手动填写表格");
        return;
      }
      const edited = draftBox.classList.contains("hidden")
        ? draft!
        : readDraftFromEditor(draftBox);
      const styleName = styleSelect.value;
      const host = getHost();

      setStatus(root, "预检中…");
      const pre = await preflightTableReplace({
        draft: edited,
        tableStyleName: styleName,
        locked,
        host,
      });
      if (!pre.ok) {
        setStatus(root, `预检失败（未改文档）: ${pre.error.message}`);
        return;
      }

      const built = buildTableReplaceCommands({
        pageIndex: locked.pageIndex,
        bounds: locked.unionBounds,
        draft: edited,
        tableStyleName: styleName,
        selectionIds: locked.ids,
      });
      if (!built.ok) {
        setStatus(root, `生成指令失败: ${built.error.message}`);
        return;
      }

      const confirmReplace = confirm(
        "将创建真表并删除原矢量选区。可在 InDesign 中 Undo。是否继续？",
      );
      if (!confirmReplace) {
        setStatus(root, "已取消替换");
        return;
      }

      setStatus(root, "正在写入真表…");
      const report = await runCommandBatch({
        requestId: crypto.randomUUID(),
        commands: built.commands,
        host,
      });
      if (!report.ok) {
        const err = report.results.find((r) => !r.ok)?.error?.message || "未知错误";
        setStatus(
          root,
          `替换未完成: ${err}。原矢量应仍在；可用 Undo 清理残留新框/表。`,
        );
        return;
      }
      clearLockedSelection();
      imageDataUrl = "";
      draft = null;
      draftBox.classList.add("hidden");
      thumb.classList.add("hidden");
      setStatus(root, "完成：真表已创建并套用表样式，原矢量已删除。");
    } catch (e) {
      setStatus(root, `替换失败: ${String(e)}`);
    }
  });
}
