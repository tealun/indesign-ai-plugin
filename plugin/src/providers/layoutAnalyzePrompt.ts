import type { ChatRequest } from "../types/protocol.js";
import { M0_COMMAND_TYPES } from "../types/protocol.js";

/** System + user prompts for analyze_and_plan / apply_commands (M0 layout). */
export function layoutAnalyzeSystemPrompt(): string {
  return [
    "You are an InDesign layout assistant for book/magazine interiors.",
    "Return ONLY one JSON object (no markdown fence):",
    '{"commands":[ /* LayoutCommand whitelist only */ ],"rationale":"short Chinese reason"}',
    "Whitelist command types:",
    M0_COMMAND_TYPES.join(", "),
    "Rules:",
    "- Prefer minimal changes on the locked selection textFrame ids from snapshot.",
    "- targetId must be a selection id string from snapshot.selection[].id.",
    "- createParaStyle/createCharStyle names must be new; apply* uses those names.",
    "- bounds unit is always pt; do not invent scripts or unknown types.",
    "- If nothing safe to change, return {\"commands\":[],\"rationale\":\"…\"}.",
  ].join("\n");
}

export function layoutAnalyzeUserPrompt(request: ChatRequest): string {
  return JSON.stringify(
    {
      op: request.op || "analyze_and_plan",
      snapshot: request.snapshot,
      styleProfile: request.styleProfile,
      userNote: request.userNote || "",
    },
    null,
    0,
  );
}

export function isLayoutAnalyzeOp(op: ChatRequest["op"] | undefined): boolean {
  return op === "analyze_and_plan" || op === "apply_commands";
}
