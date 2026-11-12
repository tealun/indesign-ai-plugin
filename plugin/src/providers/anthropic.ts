import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";

async function chatAnthropic(
  request: ChatRequest,
  settings: ProviderSettings,
): Promise<ProviderRawResponse> {
  const base = (settings.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const url = `${base}/v1/messages`;
  const content: Array<Record<string, unknown>> = [];
  if (request.imageDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(request.imageDataUrl);
    if (match) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1],
          data: match[2],
        },
      });
    }
  }
  content.push({
    type: "text",
    text: JSON.stringify({
      op: request.op,
      snapshot: request.snapshot,
      userNote: request.userNote,
    }),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 4096,
        temperature: settings.temperature,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    return { text, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  supportsVision: true,
  chat: chatAnthropic,
  parseLayoutCommands: (raw) => {
    const data = JSON.parse(raw.text) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content?.find((c) => c.type === "text")?.text ?? raw.text;
    return parseCommandsFromText(text);
  },
  parseTableDraft: (raw) => {
    const data = JSON.parse(raw.text) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      data.content?.find((c) => c.type === "text")?.text ?? raw.text;
    return parseTableDraftFromText(text);
  },
};
