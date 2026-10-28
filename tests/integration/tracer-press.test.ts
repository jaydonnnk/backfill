import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMetaProvider } from "@/integrations/meta/provider";
import { connectDb, type Db } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { TRACER_PURPOSE } from "@/lib/tracer";
import { pressTracer } from "@/lib/tracer-press";
import { createTestDatabase, type TestDatabase } from "../support/db";

// The review of S1 reproduced 25 simultaneous presses all reaching the model. These tests press
// through the real gate, lock and llm_calls table, with the model faked at the HTTP boundary.

let t: TestDatabase;
let pool: { db: Db; close: () => Promise<void> };
const PRESSES = 12;

beforeAll(async () => {
  t = await createTestDatabase("tracer_press");
  // Enough connections for every press to hold its own transaction at the same time.
  pool = connectDb(t.url, PRESSES + 2);
});

afterAll(async () => {
  await pool?.close();
  await t?.drop();
});

function slowFakeModel() {
  let calls = 0;
  const fetch = (async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Sell the empty table."}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  }) as typeof globalThis.fetch;
  const provider = createMetaProvider({ baseUrl: "https://api.meta.ai/v1", apiKey: "k", fetch, record: llmCallRecorder(pool.db), backoffMs: () => 0 });
  return { provider, calls: () => calls };
}

describe("pressTracer", () => {
  it("lets exactly one of many simultaneous presses reach the model, then holds the cooldown", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const model = slowFakeModel();

    const statuses = await Promise.all(Array.from({ length: PRESSES }, () => pressTracer(pool.db, model.provider, "muse-spark-1.3")));

    expect(model.calls()).toBe(1);
    expect(statuses.filter((s) => s === "ok")).toHaveLength(1);
    expect(statuses.filter((s) => s !== "ok").every((s) => s === "busy" || s === "cooldown")).toBe(true);
    const [{ n }] = (await t.admin`select count(*)::int as n from llm_calls where purpose = ${TRACER_PURPOSE}`) as unknown as [{ n: number }];
    expect(n).toBe(1);

    // A later press, after the lock is free, is refused by the cooldown and never calls the model.
    expect(await pressTracer(pool.db, model.provider, "muse-spark-1.3")).toBe("cooldown");
    expect(model.calls()).toBe(1);
  });

  it("allows a press once the cooldown has passed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const model = slowFakeModel();
    const later = () => new Date(Date.now() + 61_000);
    expect(await pressTracer(pool.db, model.provider, "muse-spark-1.3", later)).toBe("ok");
    expect(model.calls()).toBe(1);
  });
});
