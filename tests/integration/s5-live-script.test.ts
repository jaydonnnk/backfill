import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { loadLocalEnvFile, testEnv } from "@/env";
import { liveNegotiation } from "@/lib/negotiation/live";

// The live negotiation script, run end to end against the local server with the model's fetch faked,
// so the one live run is the only thing left unproven: the scratch database and role are made and
// dropped, every round and model call is reported, and the commitment takes the last counter.

function serverUrl(): string {
  if (!process.env.TEST_DATABASE_URL) loadLocalEnvFile();
  return testEnv().TEST_DATABASE_URL;
}

function scripted(prices: number[]): typeof fetch {
  return (async () => {
    const next = prices.shift();
    if (next === undefined) throw new Error("fake model: nothing scripted");
    const content = JSON.stringify({ priceCents: next, rationale: "scripted" });
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 40 } });
  }) as typeof fetch;
}

const meta = { baseUrl: "https://meta.test/v1", apiKey: "test-key", model: "muse-spark-1.3" };

describe("negotiation:live", () => {
  it("runs three rounds, holds on a proposal below the floor, commits at the last counter and cleans up", async () => {
    const lines: string[] = [];
    const summary = await liveNegotiation({ serverUrl: serverUrl(), meta, fetch: scripted([920, 899, 905]), out: (line) => lines.push(line) });
    expect(summary.rounds).toEqual([
      { round: 1, bidCents: 850, proposedCents: 920, verdict: "ok", status: "countered", counterCents: 920 },
      { round: 2, bidCents: 850, proposedCents: 899, verdict: "below_floor", status: "held", counterCents: 920 },
      { round: 3, bidCents: 850, proposedCents: 905, verdict: "ok", status: "countered", counterCents: 905 },
    ]);
    expect(summary.committed).toEqual({ ok: true, negotiatedPriceCents: 905 });
    // 300 tokens in at 1250 and 40 out at 4250 nano-USD each, three times.
    expect(summary.calls.map((c) => [c.attempt, c.ok, c.costNanoUsd])).toEqual([
      [1, true, 545_000],
      [1, true, 545_000],
      [1, true, 545_000],
    ]);
    expect([summary.costNanoUsd, summary.stoppedForCap]).toEqual([1_635_000, false]);
    expect(lines.at(-1)).toBe("total model cost $0.001635 (cap $0.100000)");

    const root = postgres(serverUrl(), { max: 1, onnotice: () => {} });
    try {
      const left = await root`
        select (select count(*)::int from pg_database where datname like 'backfill_live_s5_%') as databases,
               (select count(*)::int from pg_roles where rolname like 'backfill_live_rt_%') as roles`;
      expect(left).toEqual([{ databases: 0, roles: 0 }]);
    } finally {
      await root.end({ timeout: 5 });
    }
  });

  it("starts no round once the recorded cost reaches the cap", async () => {
    const summary = await liveNegotiation({ serverUrl: serverUrl(), meta, fetch: scripted([920, 910, 905]), out: () => {}, capNanoUsd: 1_090_000 });
    expect([summary.rounds.map((r) => r.counterCents), summary.costNanoUsd, summary.stoppedForCap]).toEqual([[920, 910], 1_090_000, true]);
    expect(summary.committed).toEqual({ ok: true, negotiatedPriceCents: 910 });
  });

  it("refuses a server that is not local before touching it", async () => {
    await expect(liveNegotiation({ serverUrl: "postgres://u@ep-x.neon.tech/neondb", meta, fetch: scripted([]) })).rejects.toThrow("must be a local PostgreSQL");
  });
});
