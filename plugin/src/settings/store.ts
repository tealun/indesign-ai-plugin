import type {
  AiConnectionMode,
  OpenAiWireApi,
  ProviderSettings,
  ProviderType,
} from "../types/protocol.js";

const STORAGE_KEY = "indesign-ai.providerSettings.v1";

export const DEFAULT_SETTINGS: ProviderSettings = {
  connectionMode: "byok",
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

export function normalizeConnectionMode(_value: unknown): AiConnectionMode {
  // plugin_default is reserved in the type union for a future hosted path.
  // Until that ships, always coerce to byok so a stale localStorage value cannot
  // trap the panel in a non-runnable mode.
  return "byok";
}

export type SettingsReady =
  | { ok: true; settings: ProviderSettings }
  | { ok: false; reason: string };

/**
 * Resolve settings that are safe to call a model with.
 * Phase 1: only `byok` (same as manual 中转配置) is runnable.
 */
export function resolveReadySettings(
  input?: ProviderSettings,
): SettingsReady {
  const settings = input ?? loadSettings();
  // connectionMode is coerced to byok on load/save; keep a defensive branch
  // if a caller constructs settings without going through normalize.
  if (settings.connectionMode === "plugin_default") {
    return {
      ok: false,
      reason:
        "「插件默认模型」尚未开放。请在「配置」使用「自配模型」，填写中转 Base URL / API Key / Model。",
    };
  }
  if (!settings.baseUrl.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    return {
      ok: false,
      reason:
        "自配模型未完成：请到「配置」填写 Base URL / API Key / 识图 Model（Wire API 按你的中转选 Responses 或 Chat Completions）。",
    };
  }
  return { ok: true, settings };
}

export function loadSettings(): ProviderSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      connectionMode: normalizeConnectionMode(parsed.connectionMode),
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
    connectionMode: normalizeConnectionMode(settings.connectionMode),
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
