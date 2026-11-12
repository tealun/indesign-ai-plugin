import { parseAgentDecision } from "../agent/parseDecision.js";
import { buildAgentSystemPrompt, buildAgentUserPayload } from "../agent/systemPrompt.js";
import type { AgentDecision, AgentTurnPayload } from "../agent/types.js";
import { getAdapter } from "../providers/registry.js";
import { openAiEndpointPath } from "../providers/openaiCompatible.js";
import type { ProviderSettings } from "../types/protocol.js";
import { formatProviderHttpError } from "./providerError.js";

function pathHintFor(settings: ProviderSettings): string {
  if (settings.provider === "anthropic") return "/v1/messages";
  if (settings.provider === "google_gemini") return "/:generateContent";
  return openAiEndpointPath(
    settings.wireApi === "responses" ? "responses" : "chat_completions",
  );
}

/**
 * Conversational turn: model sees runtime context + recent history and returns
 * whitelist actions. Host executes; model must not emit scripts.
 */
export async function directAgentTurn(
  settings: ProviderSettings,
  payload: AgentTurnPayload,
): Promise<AgentDecision> {
  const adapter = getAdapter(settings.provider);
  const raw = await adapter.chat(
    {
      op: "agent_turn",
      userNote: JSON.stringify({
        system: buildAgentSystemPrompt(),
        user: buildAgentUserPayload(payload),
      }),
    },
    settings,
  );
  if (raw.status >= 400) {
    throw formatProviderHttpError(
      raw.status,
      raw.text,
      settings,
      pathHintFor(settings),
    );
  }
  // Prefer message text extraction via table draft path sniff — adapters return raw HTTP.
  // openaiCompatible parseTableDraft uses sniffExtract internally; here call chat text via recover parse:
  const text = extractAdapterText(raw.text);
  return parseAgentDecision(text);
}

function extractAdapterText(httpBody: string): string {
  try {
    const data = JSON.parse(httpBody) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }>; text?: string }>;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      content?: Array<{ text?: string }>;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      return data.output_text;
    }
    if (data.output) {
      const chunks: string[] = [];
      for (const item of data.output) {
        if (typeof item.text === "string") chunks.push(item.text);
        for (const part of item.content ?? []) {
          if (typeof part.text === "string") chunks.push(part.text);
        }
      }
      if (chunks.length) return chunks.join("\n");
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === "string" ? p : p.text || "")).join("\n");
    }
    if (data.content?.[0]?.text) return data.content.map((c) => c.text || "").join("\n");
    const g = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (g) return g;
  } catch {
    /* fall through */
  }
  return httpBody;
}
