import { getAdapter } from "../providers/registry.js";
import type { ChatRequest, ProviderSettings, TableDraft } from "../types/protocol.js";
import type { LayoutCommand } from "../types/protocol.js";

export async function directChatCommands(
  settings: ProviderSettings,
  request: ChatRequest,
): Promise<LayoutCommand[]> {
  const adapter = getAdapter(settings.provider);
  const raw = await adapter.chat(request, settings);
  if (raw.status === 401 || raw.status === 403) {
    throw new Error("PROVIDER_AUTH");
  }
  if (raw.status >= 400) {
    throw new Error(`PROVIDER_HTTP:${raw.status}`);
  }
  return adapter.parseLayoutCommands(raw);
}

export async function directRecoverTable(
  settings: ProviderSettings,
  request: ChatRequest,
): Promise<TableDraft> {
  const adapter = getAdapter(settings.provider);
  if (!adapter.supportsVision) {
    throw new Error("provider does not support vision");
  }
  const raw = await adapter.chat({ ...request, op: "recover_table" }, settings);
  if (raw.status === 401 || raw.status === 403) {
    throw new Error("PROVIDER_AUTH");
  }
  if (raw.status >= 400) {
    throw new Error(`PROVIDER_HTTP:${raw.status}`);
  }
  return adapter.parseTableDraft(raw);
}
