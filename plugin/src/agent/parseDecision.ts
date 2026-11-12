import { extractJsonObject } from "../providers/parseJson.js";
import {
  AGENT_ACTION_TYPES,
  type AgentAction,
  type AgentActionType,
  type AgentDecision,
} from "./types.js";

function isActionType(v: unknown): v is AgentActionType {
  return typeof v === "string" && (AGENT_ACTION_TYPES as string[]).includes(v);
}

function parseAction(raw: unknown): AgentAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isActionType(o.type)) return null;
  if (o.type === "replace_table") {
    const styleName = String(o.styleName || "").trim();
    if (!styleName) return null;
    return { type: "replace_table", styleName };
  }
  if (o.type === "none") return { type: "none" };
  if (o.type === "lock_selection") return { type: "lock_selection" };
  if (o.type === "recognize_table") return { type: "recognize_table" };
  if (o.type === "list_styles") return { type: "list_styles" };
  if (o.type === "open_config") return { type: "open_config" };
  return null;
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
  return { reply, actions };
}
