import type { ProviderType } from "../types/protocol.js";
import type { ProviderAdapter } from "./types.js";
import { openaiCompatibleAdapter } from "./openaiCompatible.js";
import { anthropicAdapter } from "./anthropic.js";
import { geminiAdapter } from "./gemini.js";

const adapters: Record<ProviderType, ProviderAdapter> = {
  openai_compatible: openaiCompatibleAdapter,
  custom_openai_compatible: openaiCompatibleAdapter,
  anthropic: anthropicAdapter,
  google_gemini: geminiAdapter,
};

export function getAdapter(provider: ProviderType): ProviderAdapter {
  return adapters[provider];
}

export function listProviders(): { id: ProviderType; label: string; vision: boolean }[] {
  return [
    { id: "openai_compatible", label: "OpenAI Compatible / 中转 / DeepSeek", vision: true },
    { id: "custom_openai_compatible", label: "Custom OpenAI Compatible", vision: true },
    { id: "anthropic", label: "Anthropic Claude", vision: true },
    { id: "google_gemini", label: "Google Gemini", vision: true },
  ];
}
