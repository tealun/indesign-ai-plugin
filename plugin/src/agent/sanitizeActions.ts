/**
 * Recover-only action shaping (99_07 F17). Always re-filter with the active
 * agent's allowlist after calling this — never inject past the whitelist.
 */

import type { AgentAction } from "./types.js";

export type ReplaceSanitizeInput = {
  actions: AgentAction[];
  userText: string;
  /** True when a TableDraft already exists in the session. */
  hasDraft: boolean;
  /** Preferred style for injected replace_table. */
  styleName: string;
};

export type ReplaceSanitizeResult = {
  actions: AgentAction[];
  skippedVision: boolean;
};

const REPLACE_RE = /(替换|成真表|落地|写入真表)/;
const REDO_VISION_RE = /(重新识别|再识别|识错|重做识别)/;

/**
 * If draft exists and user asked to replace (not redo vision), drop
 * recognize/lock and ensure a replace_table action is present when style known.
 */
export function sanitizeActionsForReplace(
  input: ReplaceSanitizeInput,
): ReplaceSanitizeResult {
  const { actions, userText, hasDraft, styleName } = input;
  const wantsReplace = REPLACE_RE.test(userText);
  const wantsRedoVision = REDO_VISION_RE.test(userText);
  if (!hasDraft || !wantsReplace || wantsRedoVision) {
    return { actions, skippedVision: false };
  }

  let next = actions.filter(
    (a) => a.type !== "recognize_table" && a.type !== "lock_selection",
  );
  const hasReplace = next.some((a) => a.type === "replace_table");
  if (!hasReplace && styleName.trim()) {
    next = [
      ...next,
      { type: "replace_table", styleName: styleName.trim() },
    ];
  }
  return {
    actions: next,
    skippedVision: next.length !== actions.length || !hasReplace,
  };
}

/** Only table_recover may run replace sanitize (F17 / EV-2026-11-13-02). */
export function maySanitizeReplaceForAgent(agentId: string): boolean {
  return agentId === "m0t.table_recover";
}
