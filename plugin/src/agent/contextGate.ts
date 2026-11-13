/**
 * Pure gates for what runtimeContext may carry per Agent (99_07 F1/F4/F7/F12).
 */

export const LIVE_SELECTION_AGENT_IDS = new Set([
  "m0.copy_compare",
  "m0.proofread",
  "m0.table_normalize",
  "m0t.table_recover",
]);

export function shouldInjectCompareDocument(agentId: string): boolean {
  return agentId === "m0.copy_compare";
}

export function shouldReadClipboard(agentId: string): boolean {
  return agentId === "m0.copy_compare";
}

export function shouldHarvestLiveSelection(agentId: string): boolean {
  return LIVE_SELECTION_AGENT_IDS.has(agentId);
}

export function filterActionsByAllowlist<T extends { type: string }>(
  actions: T[],
  allowed: readonly string[],
): { kept: T[]; dropped: T[] } {
  const set = new Set(allowed);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const a of actions) {
    if (set.has(a.type)) kept.push(a);
    else dropped.push(a);
  }
  return { kept, dropped };
}
