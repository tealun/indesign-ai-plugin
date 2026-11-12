import { extractJsonObject } from "../providers/parseJson.js";
import type { ExperienceScope } from "./memory/types.js";
import {
  AGENT_ACTION_TYPES,
  type AgentAction,
  type AgentActionType,
  type AgentDecision,
  type AgentLessonDraft,
} from "./types.js";

function isActionType(v: unknown): v is AgentActionType {
  return typeof v === "string" && (AGENT_ACTION_TYPES as string[]).includes(v);
}

function isScope(v: unknown): v is ExperienceScope {
  return v === "agent" || v === "user" || v === "project" || v === "task";
}

function parseAction(raw: unknown): AgentAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isActionType(o.type)) return null;
  if (o.type === "replace_table" || o.type === "apply_table_style") {
    const styleName = String(o.styleName || "").trim();
    if (!styleName) return null;
    return { type: o.type, styleName };
  }
  if (o.type === "propose_grep") {
    const find = String(o.find || o.pattern || "").trim();
    if (!find) return null;
    // Keep whitespace-only replacements (e.g. collapse spaces → single space).
    const hasChange =
      typeof o.changeTo === "string" || typeof o.replace === "string";
    const changeTo = hasChange
      ? String(o.changeTo ?? o.replace ?? "")
      : undefined;
    const flags = String(o.flags || "").trim();
    const note = String(o.note || "").trim();
    return {
      type: "propose_grep",
      find,
      ...(changeTo !== undefined ? { changeTo } : {}),
      ...(flags ? { flags } : {}),
      ...(note ? { note } : {}),
    };
  }
  if (o.type === "none") return { type: "none" };
  if (o.type === "lock_selection") return { type: "lock_selection" };
  if (o.type === "recognize_table") return { type: "recognize_table" };
  if (o.type === "list_styles") return { type: "list_styles" };
  if (o.type === "open_config") return { type: "open_config" };
  return null;
}

function parseLessons(raw: unknown): AgentLessonDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLessonDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isScope(o.scope)) continue;
    const text = String(o.text || "").trim();
    if (!text) continue;
    const taskId = String(o.taskId || "").trim();
    out.push(taskId ? { scope: o.scope, text, taskId } : { scope: o.scope, text });
  }
  return out.slice(0, 6);
}

export function parseAgentDecision(text: string): AgentDecision {
  const data = extractJsonObject(text) as Record<string, unknown>;
  const reply =
    typeof data.reply === "string" && data.reply.trim()
      ? data.reply.trim()
      : typeof data.message === "string"
        ? data.message.trim()
        : "好的。";
  const actionsRaw = Array.isArray(data.actions)
    ? data.actions
    : data.action
      ? [data.action]
      : [];
  const actions: AgentAction[] = [];
  for (const item of actionsRaw) {
    const a = parseAction(item);
    if (a && a.type !== "none") actions.push(a);
  }
  const taskId = String(data.taskId || "").trim() || undefined;
  const lessons = parseLessons(data.lessons);
  return {
    reply,
    actions,
    ...(taskId ? { taskId } : {}),
    ...(lessons.length ? { lessons } : {}),
  };
}
