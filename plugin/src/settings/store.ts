import type {
  OpenAiWireApi,
  ProviderSettings,
  ProviderType,
} from "../types/protocol.js";

const STORAGE_KEY = "indesign-ai.providerSettings.v1";

export const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "openai_compatible",
  baseUrl: "",
  apiKey: "",
  model: "",
  timeoutMs: 60_000,
  temperature: 0.2,
  wireApi: "chat_completions",
};

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

function normalizeWireApi(value: unknown): OpenAiWireApi {
  return value === "responses" ? "responses" : "chat_completions";
}

export function loadSettings(): ProviderSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      provider: (parsed.provider as ProviderType) || DEFAULT_SETTINGS.provider,
      timeoutMs: Number(parsed.timeoutMs) || DEFAULT_SETTINGS.timeoutMs,
      temperature:
        typeof parsed.temperature === "number"
          ? parsed.temperature
          : DEFAULT_SETTINGS.temperature,
      wireApi: normalizeWireApi(parsed.wireApi),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ProviderSettings): void {
  const payload: ProviderSettings = {
    provider: settings.provider,
    baseUrl: settings.baseUrl.trim(),
    apiKey: settings.apiKey,
    model: settings.model.trim(),
    timeoutMs: settings.timeoutMs,
    temperature: settings.temperature,
    wireApi: normalizeWireApi(settings.wireApi),
  };
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
}
