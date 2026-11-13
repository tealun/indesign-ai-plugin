import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";
import { withTimeout } from "../util/timeout.js";
import {
  isLayoutAnalyzeOp,
  layoutAnalyzeSystemPrompt,
  layoutAnalyzeUserPrompt,
} from "./layoutAnalyzePrompt.js";

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

  let textPayload = JSON.stringify({
    op: request.op,
    snapshot: request.snapshot,
    userNote: request.userNote,
  });
  if (isLayoutAnalyzeOp(request.op)) {
    textPayload = `${layoutAnalyzeSystemPrompt()}\n\n${layoutAnalyzeUserPrompt(request)}`;
  } else if (request.op === "agent_turn" && request.userNote) {
    try {
      const p = JSON.parse(request.userNote) as { system?: string; user?: string };
      if (p.system && p.user) textPayload = `${p.system}\n\n${p.user}`;
    } catch {
      textPayload = request.userNote;
    }
  }
  const parts: Array<Record<string, unknown>> = [{ text: textPayload }];
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
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: settings.temperature },
        }),
        signal: controller.signal,
      }),
      settings.timeoutMs + 2_000,
      "调用识图模型",
    );
    const text = await withTimeout(res.text(), settings.timeoutMs, "读取模型响应");
    return { text, status: res.status };
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) {
      throw new Error(`调用识图模型超时（>${Math.round(settings.timeoutMs / 1000)}s）`);
    }
    throw e;
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
