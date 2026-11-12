import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";

async function chatGemini(
  request: ChatRequest,
  settings: ProviderSettings,
): Promise<ProviderRawResponse> {
  const base = (settings.baseUrl || "https://generativelanguage.googleapis.com").replace(
    /\/$/,
    "",
  );
  const model = settings.model || "gemini-2.0-flash";
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;

  const parts: Array<Record<string, unknown>> = [
    {
      text: JSON.stringify({
        op: request.op,
        snapshot: request.snapshot,
        userNote: request.userNote,
      }),
    },
  ];
  if (request.imageDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(request.imageDataUrl);
    if (match) {
      parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2],
        },
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: settings.temperature },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    return { text, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export const geminiAdapter: ProviderAdapter = {
  id: "google_gemini",
  supportsVision: true,
  chat: chatGemini,
  parseLayoutCommands: (raw) => {
    const data = JSON.parse(raw.text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? raw.text;
    return parseCommandsFromText(text);
  },
  parseTableDraft: (raw) => {
    const data = JSON.parse(raw.text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? raw.text;
    return parseTableDraftFromText(text);
  },
};
