/** Local frequency for「常用 Agent」ordering. Not a billing meter. */

const STORAGE_KEY = "indesign-ai.agentUsage.v1";

export type AgentUsageMap = Record<
  string,
  { useCount: number; lastUsedAt: string }
>;

function loadRaw(): AgentUsageMap {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AgentUsageMap;
  } catch {
    return {};
  }
}

function saveRaw(map: AgentUsageMap): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function recordAgentOpen(agentId: string): void {
  const map = loadRaw();
  const prev = map[agentId] || { useCount: 0, lastUsedAt: "" };
  map[agentId] = {
    useCount: prev.useCount + 1,
    lastUsedAt: new Date().toISOString(),
  };
  saveRaw(map);
}

export function sortAgentsByUsage<T extends { id: string }>(agents: T[]): T[] {
  const map = loadRaw();
  return [...agents].sort((a, b) => {
    const ua = map[a.id]?.useCount || 0;
    const ub = map[b.id]?.useCount || 0;
    if (ub !== ua) return ub - ua;
    const ta = map[a.id]?.lastUsedAt || "";
    const tb = map[b.id]?.lastUsedAt || "";
    return tb.localeCompare(ta);
  });
}
