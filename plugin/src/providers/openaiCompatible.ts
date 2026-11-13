import type { ChatRequest, OpenAiWireApi, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";
import {
  recoverTableSystemPrompt,
  recoverTableTemperature,
  recoverTableUserPrompt,
} from "./recoverPrompt.js";
import { withTimeout } from "../util/timeout.js";

function parseAgentNote(
  userNote?: string,
): { system: string; user: string } | null {
  if (!userNote) return null;
  try {
    const data = JSON.parse(userNote) as { system?: string; user?: string };
    if (typeof data.system === "string" && typeof data.user === "string") {
      return { system: data.system, user: data.user };
    }
  } catch {
    /* not agent payload */
  }
  return null;
}

function recoverPrompt(request: ChatRequest): string {
  if (request.op === "agent_turn") {
    return parseAgentNote(request.userNote)?.user ?? request.userNote ?? "";
  }
  if (request.op === "recover_table") {
    return recoverTableUserPrompt(request.userNote);
  }
  return JSON.stringify({
    op: request.op,
    snapshot: request.snapshot,
    userNote: request.userNote,
  });
}

function systemPromptFor(request: ChatRequest): string {
  if (request.op === "agent_turn") {
    return (
      parseAgentNote(request.userNote)?.system ??
      "You are an InDesign layout agent. Output JSON only."
    );
  }
  if (request.op === "recover_table") {
    return recoverTableSystemPrompt();
  }
  return "You extract InDesign table structure. Output JSON only. Never output scripts.";
}

function temperatureFor(request: ChatRequest, settings: ProviderSettings): number {
  if (request.op === "recover_table") {
    return recoverTableTemperature(settings.temperature);
  }
  return settings.temperature;
}

function extractChatCompletionsText(httpBody: string): string {
  try {
    const data = JSON.parse(httpBody) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
      error?: { message?: string };
    };
    if (data.error?.message) {
      throw new Error(data.error.message);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((p) => (typeof p === "string" ? p : p.text || ""))
        .join("\n");
    }
  } catch (e) {
    if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
  }
  return httpBody;
}

/** Parse OpenAI Responses API body (`/v1/responses`). */
export function extractResponsesText(httpBody: string): string {
  try {
    const data = JSON.parse(httpBody) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
        text?: string;
      }>;
      error?: { message?: string };
    };
    if (data.error?.message) {
      throw new Error(data.error.message);
    }
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      return data.output_text;
    }
    const chunks: string[] = [];
    for (const item of data.output ?? []) {
      if (typeof item.text === "string") chunks.push(item.text);
      for (const part of item.content ?? []) {
        if (typeof part.text === "string") chunks.push(part.text);
      }
    }
    if (chunks.length) return chunks.join("\n");
  } catch (e) {
    if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
  }
  return httpBody;
}

function resolveWireApi(settings: ProviderSettings): OpenAiWireApi {
  return settings.wireApi === "responses" ? "responses" : "chat_completions";
}

export function openAiEndpointPath(wireApi: OpenAiWireApi): string {
  return wireApi === "responses" ? "/responses" : "/chat/completions";
}

function buildChatCompletionsBody(request: ChatRequest, settings: ProviderSettings): unknown {
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: recoverPrompt(request) },
  ];
  if (request.imageDataUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: request.imageDataUrl },
    });
  }
  return {
    model: settings.model,
    temperature: temperatureFor(request, settings),
    messages: [
      {
        role: "system",
        content: systemPromptFor(request),
      },
      { role: "user", content: userContent },
    ],
  };
}

function buildResponsesBody(request: ChatRequest, settings: ProviderSettings): unknown {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: [systemPromptFor(request), recoverPrompt(request)].join("\n\n"),
    },
  ];
  if (request.imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: request.imageDataUrl,
    });
  }
  return {
    model: settings.model,
    temperature: temperatureFor(request, settings),
    input: [{ role: "user", content }],
  };
}

async function chatOpenAICompatible(
  request: ChatRequest,
  settings: ProviderSettings,
): Promise<ProviderRawResponse> {
  if (!settings.baseUrl.trim()) {
    throw new Error("请填写 Base URL");
  }
  if (!settings.apiKey.trim()) {
    throw new Error("请填写 API Key");
  }
  if (!settings.model.trim()) {
    throw new Error("请填写 Model");
  }

  const wireApi = resolveWireApi(settings);
  const base = settings.baseUrl.replace(/\/$/, "");
  const url = `${base}${openAiEndpointPath(wireApi)}`;
  const body =
    wireApi === "responses"
      ? buildResponsesBody(request, settings)
      : buildChatCompletionsBody(request, settings);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      settings.timeoutMs + 2_000,
      "调用识图模型",
    );
    const text = await withTimeout(res.text(), settings.timeoutMs, "读取模型响应");
    return { text, status: res.status };
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) {
      throw new Error(
        `调用识图模型超时（>${Math.round(settings.timeoutMs / 1000)}s）。请检查中转站/网络，或在配置里加大超时。`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function sniffExtract(httpBody: string): string {
  // Prefer Responses shape when present; else chat completions.
  try {
    const data = JSON.parse(httpBody) as {
      output?: unknown;
      output_text?: string;
      choices?: unknown;
    };
    if (data.output != null || typeof data.output_text === "string") {
      return extractResponsesText(httpBody);
    }
    if (data.choices != null) return extractChatCompletionsText(httpBody);
  } catch {
    /* fall through */
  }
  const fromChat = extractChatCompletionsText(httpBody);
  if (fromChat !== httpBody) return fromChat;
  return extractResponsesText(httpBody);
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  id: "openai_compatible",
  supportsVision: true,
  chat: chatOpenAICompatible,
  parseLayoutCommands: (raw) => parseCommandsFromText(sniffExtract(raw.text)),
  parseTableDraft: (raw) => parseTableDraftFromText(sniffExtract(raw.text)),
};
