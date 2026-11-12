import type { ChatRequest, ProviderSettings } from "../types/protocol.js";
import type { ProviderAdapter, ProviderRawResponse } from "./types.js";
import { parseCommandsFromText, parseTableDraftFromText } from "./parseJson.js";

function extractMessageText(httpBody: string): string {
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

  const base = settings.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        request.op === "recover_table"
          ? [
              "Recognize the table in the image.",
              "Return ONLY JSON:",
              '{"tableDraft":{"headerRowCount":1,"footerRowCount":0,"suggestedTableStyleName":"","rows":[["col1","col2"],["a","b"]]}}',
              "rules:",
              "- rows include header and footer rows",
              "- headerRowCount>=1, footerRowCount>=0, at least one body row",
              "- ignore merged cells",
              "- keep cell text faithful to the image language",
              request.userNote ? `userNote: ${request.userNote}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          : JSON.stringify({
              op: request.op,
              snapshot: request.snapshot,
              userNote: request.userNote,
            }),
    },
  ];
  if (request.imageDataUrl) {
    userContent.push({
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
              "You extract InDesign table structure. Output JSON only. Never output scripts.",
          },
          { role: "user", content: userContent },
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
  parseLayoutCommands: (raw) => parseCommandsFromText(extractMessageText(raw.text)),
  parseTableDraft: (raw) => parseTableDraftFromText(extractMessageText(raw.text)),
};
