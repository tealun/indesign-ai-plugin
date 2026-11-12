import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractResponsesText, openAiEndpointPath } from "./openaiCompatible.js";

describe("OpenAI Responses wire", () => {
  it("maps endpoint path", () => {
    assert.equal(openAiEndpointPath("responses"), "/responses");
    assert.equal(openAiEndpointPath("chat_completions"), "/chat/completions");
  });

  it("extracts output_text", () => {
    const text = extractResponsesText(
      JSON.stringify({ output_text: '{"tableDraft":{"rows":[["a"]]}}' }),
    );
    assert.match(text, /tableDraft/);
  });

  it("extracts nested output message content", () => {
    const text = extractResponsesText(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"ok":true}' }],
          },
        ],
      }),
    );
    assert.equal(text, '{"ok":true}');
  });
});
