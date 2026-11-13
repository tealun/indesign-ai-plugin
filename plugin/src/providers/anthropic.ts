import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";
import {
  recoverTableSystemPrompt,
  recoverTableTemperature,
  recoverTableUserPrompt,
} from "./recoverPrompt.js";
import { withTimeout } from "../util/timeout.js";

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
  let textPayload = JSON.stringify({
    op: request.op,
    snapshot: request.snapshot,
    userNote: request.userNote,
  });
  let temperature = settings.temperature;
  if (request.op === "recover_table") {
    textPayload = `${recoverTableSystemPrompt()}\n\n${recoverTableUserPrompt(request.userNote)}`;
    temperature = recoverTableTemperature(settings.temperature);
  } else if (request.op === "agent_turn" && request.userNote) {
    try {
      const p = JSON.parse(request.userNote) as { system?: string; user?: string };
      if (p.system && p.user) textPayload = `${p.system}\n\n${p.user}`;
    } catch {
      textPayload = request.userNote;
    }
  }
  content.push({
    type: "text",
    text: textPayload,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 4096,
          temperature,
          messages: [{ role: "user", content }],
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
