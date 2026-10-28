import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMetaProvider, type LlmCallRecord } from "@/integrations/meta/provider";
import { latestOkCall, llmCallRecorder, recentAttempts } from "@/lib/llm-calls";
import { runTracer, TRACER_PURPOSE } from "@/lib/tracer";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase("llm_calls");
});

afterAll(async () => {
  await t?.drop();
});

const record = (overrides: Partial<LlmCallRecord> = {}): LlmCallRecord => ({
  provider: "meta",
  model: "muse-spark-1.3",
  purpose: "integration",
  attempt: 1,
  tokensIn: 100,
  tokensCachedIn: 0,
  tokensOut: 20,
  costNanoUsd: 210_000,
  latencyMs: 12,
  ok: true,
  httpStatus: 200,
  error: null,
  output: '{"reply":"hi"}',
  ...overrides,
});

describe("llm_calls", () => {
  it("logs every tracer attempt with its cost, and the page reads back the reply that passed", async () => {
    const replies = ["not json", '{"reply":"Sell it: an empty table earns nothing."}'];
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }], usage: { prompt_tokens: 80, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } } }), {
        status: 200,
      })) as typeof fetch;
    const provider = createMetaProvider({ baseUrl: "https://api.meta.ai/v1", apiKey: "k", fetch: fakeFetch, record: llmCallRecorder(t.db), backoffMs: () => 0 });

    const result = await runTracer(provider, "muse-spark-1.3");

    const rows = await t.admin`select attempt, ok, tokens_in, tokens_cached_in, tokens_out, cost_nano_usd, error from llm_calls where purpose = ${TRACER_PURPOSE} order by id`;
    const perAttempt = 60 * 1250 + 20 * 150 + 30 * 4250;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { attempt: 1, ok: false, tokens_in: 80, tokens_cached_in: 20, tokens_out: 30, cost_nano_usd: String(perAttempt), error: "the reply was not JSON" },
      { attempt: 2, ok: true, tokens_in: 80, tokens_cached_in: 20, tokens_out: 30, cost_nano_usd: String(perAttempt), error: null },
    ]);
    expect(result.costNanoUsd).toBe(2 * perAttempt);

    const latest = await latestOkCall(t.db, TRACER_PURPOSE);
    expect(latest).toMatchObject({ attempt: 2, ok: true, costNanoUsd: perAttempt, output: '{"reply":"Sell it: an empty table earns nothing."}' });
    expect(latest?.createdAt).toBeInstanceOf(Date);
  });

  it("returns the newest successful call, skipping a newer failure", async () => {
    await llmCallRecorder(t.db)(record({ purpose: "latest", output: "first" }));
    await llmCallRecorder(t.db)(record({ purpose: "latest", output: "second" }));
    await llmCallRecorder(t.db)(record({ purpose: "latest", ok: false, httpStatus: 500, output: null, error: "HTTP 500" }));
    expect((await latestOkCall(t.db, "latest"))?.output).toBe("second");
    expect(await latestOkCall(t.db, "no-such-purpose")).toBeNull();
  });

  it("counts recent attempts, failed ones included, since the given time", async () => {
    await t.admin`insert into llm_calls (provider, model, purpose, attempt, tokens_in, tokens_cached_in, tokens_out, cost_nano_usd, latency_ms, ok, created_at)
      values ('meta', 'muse-spark-1.3', 'window', 1, 0, 0, 0, 0, 0, true, now() - interval '2 days'),
             ('meta', 'muse-spark-1.3', 'window', 1, 0, 0, 0, 0, 0, false, now() - interval '1 hour'),
             ('meta', 'muse-spark-1.3', 'window', 2, 0, 0, 0, 0, 0, true, now() - interval '10 minutes')`;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await recentAttempts(t.db, "window", since);
    expect(recent.count).toBe(2);
    expect(Date.now() - (recent.lastAt?.getTime() ?? 0)).toBeGreaterThan(9 * 60 * 1000);
    expect(Date.now() - (recent.lastAt?.getTime() ?? 0)).toBeLessThan(11 * 60 * 1000);
    expect(await recentAttempts(t.db, "empty-window", since)).toEqual({ count: 0, lastAt: null });
  });

  it("rejects rows the provider can never produce", async () => {
    const insert = llmCallRecorder(t.db);
    // Caught, so a missing constraint fails on the assertion rather than on an unrejected promise.
    const refusedBy = async (row: LlmCallRecord) => {
      const err = await insert(row).then(() => null, (e: unknown) => e);
      return (err as { cause?: { constraint_name?: string } } | null)?.cause?.constraint_name ?? "accepted";
    };
    expect(await refusedBy(record({ purpose: "bad", tokensCachedIn: 101 }))).toBe("llm_calls_tokens_nonnegative");
    expect(await refusedBy(record({ purpose: "bad", costNanoUsd: -1 }))).toBe("llm_calls_cost_nonnegative");
    expect(await refusedBy(record({ purpose: "bad", attempt: 0 }))).toBe("llm_calls_attempt_positive");
    expect(await refusedBy(record({ purpose: "bad", latencyMs: -1 }))).toBe("llm_calls_latency_nonnegative");
    const [{ n }] = (await t.admin`select count(*)::int as n from llm_calls where purpose = 'bad'`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });
});
