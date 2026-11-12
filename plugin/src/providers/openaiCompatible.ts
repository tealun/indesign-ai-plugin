import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";

async function chatOpenAICompatible(
  request: ChatRequest,
  settings: ProviderSettings,
): Promise<ProviderRawResponse> {
  const base = settings.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: JSON.stringify({
        op: request.op,
        snapshot: request.snapshot,
        userNote: request.userNote,
        instruction:
          request.op === "recover_table"
            ? "Return JSON with tableDraft {headerRowCount,footerRowCount,rows,suggestedTableStyleName}. Ignore merges."
            : "Return JSON with commands whitelist only.",
      }),
    },
  ];
  if (request.imageDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: request.imageDataUrl },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature,
        messages: [
          {
            role: "system",
            content:
              "You are an InDesign layout assistant. Output JSON only. Never output executable scripts.",
          },
          { role: "user", content },
        ],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    return { text, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  id: "openai_compatible",
  supportsVision: true,
  chat: chatOpenAICompatible,
  parseLayoutCommands: (raw) => parseCommandsFromText(raw.text),
  parseTableDraft: (raw) => parseTableDraftFromText(raw.text),
};
