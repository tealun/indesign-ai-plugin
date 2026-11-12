import { getAdapter } from "../providers/registry.js";
import { openAiEndpointPath } from "../providers/openaiCompatible.js";
import type { ChatRequest, ProviderSettings, TableDraft } from "../types/protocol.js";
import type { LayoutCommand } from "../types/protocol.js";
import { formatProviderHttpError } from "./providerError.js";

function assertOk(
  status: number,
  text: string,
  settings: ProviderSettings,
  pathHint: string,
): void {
  if (status < 400) return;
  throw formatProviderHttpError(status, text, settings, pathHint);
}

function pathHintFor(settings: ProviderSettings): string {
  if (settings.provider === "anthropic") return "/v1/messages";
  if (settings.provider === "google_gemini") return "/:generateContent";
  return openAiEndpointPath(
    settings.wireApi === "responses" ? "responses" : "chat_completions",
  );
}

export async function directChatCommands(
  settings: ProviderSettings,
  request: ChatRequest,
): Promise<LayoutCommand[]> {
  const adapter = getAdapter(settings.provider);
  const raw = await adapter.chat(request, settings);
  assertOk(raw.status, raw.text, settings, pathHintFor(settings));
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
  assertOk(raw.status, raw.text, settings, pathHintFor(settings));
  return adapter.parseTableDraft(raw);
}
