import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMetaProvider, LlmError, type LlmCallRecord, type StructuredRequest } from "@/integrations/meta/provider";

// The model is faked at the HTTP boundary: a fetch that returns scripted responses and keeps every
// request it was given.

type Scripted = { status: number; body: unknown } | Error;

function fakeFetch(script: Scripted[]) {
  const requests: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    const next = script.shift();
    if (!next) throw new Error("fake fetch: no scripted response left");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, requests };
}

function completion(content: string | null, usage = { prompt_tokens: 100, completion_tokens: 20 }) {
  return { status: 200, body: { choices: [{ message: { role: "assistant", content } }], usage } };
}

const schema = z.object({ reply: z.string().min(1).max(10) });

const request: StructuredRequest<z.infer<typeof schema>> = {
  model: "muse-spark-1.3",
  purpose: "test",
  system: "system text",
  prompt: "user text",
  schemaName: "Reply",
  schema,
  maxCompletionTokens: 256,
};

function setup(script: Scripted[]) {
  const fetch = fakeFetch(script);
  const records: LlmCallRecord[] = [];
  let clock = 0;
  const provider = createMetaProvider({
    baseUrl: "https://api.meta.ai/v1/",
    apiKey: "test-key",
    fetch: fetch.impl,
    record: async (record) => {
      records.push(record);
    },
    backoffMs: () => 0,
    // Each attempt reads the clock twice and takes 7 ms.
    now: () => (clock += 3.5),
  });
  return { provider, requests: fetch.requests, records };
}

describe("Meta LLMProvider", () => {
  it("sends one strict json_schema request and logs the call with its cost", async () => {
    const { provider, requests, records } = setup([completion('{"reply":"hello"}', { prompt_tokens: 100, completion_tokens: 20 })]);
    const result = await provider.generate(request);

    expect(result).toEqual({ value: { reply: "hello" }, attempts: 1, usage: { tokensIn: 100, tokensCachedIn: 0, tokensOut: 20 }, costNanoUsd: 100 * 1250 + 20 * 4250, latencyMs: 4 });
    expect(requests).toHaveLength(1);
    const [sent] = requests;
    expect(sent?.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect((sent?.init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(sent?.body).toMatchObject({
      model: "muse-spark-1.3",
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: "system text" },
        { role: "user", content: "user text" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "Reply", strict: true, schema: { type: "object", required: ["reply"], additionalProperties: false } },
      },
    });
    expect(sent?.body.response_format).not.toHaveProperty("json_schema.schema.$schema");
    expect(records).toEqual([
      { provider: "meta", model: "muse-spark-1.3", purpose: "test", attempt: 1, tokensIn: 100, tokensCachedIn: 0, tokensOut: 20, costNanoUsd: 210_000, latencyMs: 4, ok: true, httpStatus: 200, error: null, output: '{"reply":"hello"}' },
    ]);
  });

  it("bills cached prompt tokens at the cached rate", async () => {
    const { provider, records } = setup([
      { status: 200, body: { choices: [{ message: { content: '{"reply":"hi"}' } }], usage: { prompt_tokens: 100, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 60 } } } },
    ]);
    const result = await provider.generate(request);
    expect(result.costNanoUsd).toBe(40 * 1250 + 60 * 150);
    expect(records[0]).toMatchObject({ tokensIn: 100, tokensCachedIn: 60, costNanoUsd: 59_000 });
  });

  it("retries a reply that is not JSON, shows the model its error, and sums the billed usage", async () => {
    const { provider, requests, records } = setup([completion("not json", { prompt_tokens: 10, completion_tokens: 5 }), completion('{"reply":"ok"}', { prompt_tokens: 30, completion_tokens: 6 })]);
    const result = await provider.generate(request);

    expect(result.value).toEqual({ reply: "ok" });
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ tokensIn: 40, tokensCachedIn: 0, tokensOut: 11 });
    expect(result.costNanoUsd).toBe(40 * 1250 + 11 * 4250);
    expect(records.map((r) => [r.attempt, r.ok, r.error])).toEqual([
      [1, false, "the reply was not JSON"],
      [2, true, null],
    ]);
    expect(requests[1]?.body.messages).toEqual([
      { role: "system", content: "system text" },
      { role: "user", content: "user text" },
      { role: "assistant", content: "not json" },
      { role: "user", content: "That reply was invalid: the reply was not JSON. Reply again with only JSON that matches the schema." },
    ]);
  });

  it("rejects JSON that fails the Zod schema and gives up after maxAttempts", async () => {
    const tooLong = '{"reply":"far more than ten characters"}';
    const { provider, records } = setup([completion(tooLong), completion(tooLong), completion(tooLong)]);
    const error = await provider.generate(request).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).attempts).toBe(3);
    expect((error as LlmError).message).toBe("Model call failed after 3 attempts: reply: Too big: expected string to have <=10 characters");
    expect(records.map((r) => r.ok)).toEqual([false, false, false]);
    expect(records.every((r) => r.costNanoUsd === 210_000)).toBe(true);
  });

  it("treats an empty reply as invalid", async () => {
    const { provider, records } = setup([completion(null), completion('{"reply":"x"}')]);
    await provider.generate(request);
    expect(records[0]).toMatchObject({ ok: false, error: "the reply was empty", output: null });
  });

  it("does not retry a 400, and logs it with no tokens and no cost", async () => {
    const { provider, requests, records } = setup([{ status: 400, body: { error: { message: "bad" } } }, completion('{"reply":"x"}')]);
    await expect(provider.generate(request)).rejects.toThrow("Model call failed: HTTP 400");
    expect(requests).toHaveLength(1);
    expect(records).toEqual([expect.objectContaining({ attempt: 1, ok: false, httpStatus: 400, error: "HTTP 400", tokensIn: 0, tokensOut: 0, costNanoUsd: 0, output: null })]);
  });

  it("retries a 429, a 5xx and a network error", async () => {
    const { provider, records } = setup([{ status: 429, body: {} }, { status: 503, body: {} }, completion('{"reply":"x"}')]);
    const result = await provider.generate(request);
    expect(result.attempts).toBe(3);
    expect(records.map((r) => [r.httpStatus, r.error])).toEqual([
      [429, "HTTP 429"],
      [503, "HTTP 503"],
      [200, null],
    ]);
  });

  it("gives up after maxAttempts network errors, logging each attempt", async () => {
    const { provider, records } = setup([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await expect(provider.generate(request)).rejects.toThrow("Model call failed after 3 attempts: network error (TypeError)");
    expect(records.map((r) => [r.attempt, r.httpStatus, r.error])).toEqual([
      [1, null, "network error (TypeError)"],
      [2, null, "network error (TypeError)"],
      [3, null, "network error (TypeError)"],
    ]);
  });

  it("refuses an unpriced model before any request is sent or logged", async () => {
    const { provider, requests, records } = setup([completion('{"reply":"x"}')]);
    await expect(provider.generate({ ...request, model: "muse-spark-1.3-contributor" })).rejects.toThrow("No price for model muse-spark-1.3-contributor");
    expect(requests).toHaveLength(0);
    expect(records).toHaveLength(0);
  });
});
