import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProviderHttpError } from "./providerError.js";

describe("formatProviderHttpError", () => {
  it("includes status, url, model and 404 hint", () => {
    const err = formatProviderHttpError(
      404,
      '{"error":{"message":"model_not_found"}}',
      {
        provider: "openai_compatible",
        baseUrl: "https://www.api.web3-ai.club/v1",
        apiKey: "sk-test",
        model: "gpt-5.5",
        timeoutMs: 60_000,
        temperature: 0.2,
      },
      "/chat/completions",
    );
    assert.match(err.message, /HTTP 404/);
    assert.match(err.message, /gpt-5\.5/);
    assert.match(err.message, /chat\/completions/);
    assert.match(err.message, /model_not_found/);
  });
});
