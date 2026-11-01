import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMetaProvider, type LLMProvider } from "@/integrations/meta/provider";
import { wonderMerchant, type PlanMemory } from "@/lib/onboarding/models";
import { BuyerDecision, sparkBuyer } from "../../sim/buyers/buyer";
import { mapLimit } from "../../sim/buyers/scene";

const offer = { merchantName: "Test Cafe", about: "a kopi set", summary: "Afternoon kopi", visitDate: "2026-11-03", commitBy: "2026-11-03T06:03:00.000Z", startsAt: "2026-11-03T06:03:00.000Z", endsAt: "2026-11-03T07:03:00.000Z", perAgentCapCovers: 4 };
const memory: PlanMemory = {
  merchantName: "Test Cafe", listPriceCents: 680, capacityCovers: 16, discountBps: 2000,
  minPoolCovers: 8, perAgentCapCovers: 4, window: "Tuesday afternoon", soldOutDate: "2026-11-03",
  fills: [{ visitDate: "2026-11-03", unlocked: true, covers: 16 }], plans: [],
};
const decision = { covers: 2, reason: "The offer fits two people." };
const plan = { discountBps: 1500, capacityCovers: 24, minPoolCovers: 8, perAgentCapCovers: 4, rationale: "All 16 covers sold out." };
const fatal = { name: "LlmRecordingError", message: "Model call recording failed" };

// Exercise real provider and queue behavior. Only HTTP is fake; the recorder's missing directory
// produces an actual filesystem write error, and completed decisions would persist on disk.
async function recordingFailure(content: unknown, work: (provider: LLMProvider, index: number) => Promise<unknown>, status = 200) {
  const dir = mkdtempSync(join(tmpdir(), "s7-record-error-"));
  const path = join(dir, "decisions.jsonl");
  writeFileSync(path, "");
  let fetches = 0;
  const fakeFetch: typeof fetch = async () => {
    fetches++;
    return Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }, { status });
  };
  const provider = createMetaProvider({
    baseUrl: "https://meta.invalid/v1", apiKey: "test-key", fetch: fakeFetch, backoffMs: () => 0,
    record: async record => { writeFileSync(join(dir, "missing", "call.json"), JSON.stringify(record)); },
  });
  try {
    const terminal: unknown = await mapLimit([0, 1], 1, async index => {
      const result = await work(provider, index);
      appendFileSync(path, `${JSON.stringify({ index, result })}\n`);
      return result;
    }).then(() => null, (error: unknown) => error);
    return {
      terminal: terminal instanceof Error ? { name: terminal.name, message: terminal.message } : terminal,
      fetches,
      decisions: readFileSync(path, "utf8"),
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("fatal recording errors through the real Meta provider", () => {
  it.each([
    { name: "valid reply", content: decision, status: 200 },
    { name: "invalid reply", content: "not JSON", status: 200 },
    { name: "retryable HTTP failure", content: null, status: 503 },
  ])("stops the provider queue after a recorder failure on a $name", async ({ content, status }) => {
    const result = await recordingFailure(content, provider => provider.generate({
      model: "muse-spark-1.3", purpose: "sim_buyer", system: "system", prompt: "prompt",
      schemaName: "BuyerDecision", schema: BuyerDecision, maxCompletionTokens: 2048,
    }), status);
    expect(result).toEqual({ terminal: fatal, fetches: 1, decisions: "" });
  });

  it("sparkBuyer rejects a recording failure before a queued buyer sends or persists a decision", async () => {
    const result = await recordingFailure(decision, (provider, index) => sparkBuyer(provider, "muse-spark-1.3")({ agentId: `sim-buyer-${index}`, intent: "Kopi for two" }, offer));
    expect(result).toEqual({ terminal: fatal, fetches: 1, decisions: "" });
  });

  it("wonderMerchant rejects a recording failure before queued work sends or persists a plan", async () => {
    const result = await recordingFailure(plan, provider => wonderMerchant(provider, "muse-wonder-1.0")(memory));
    expect(result).toEqual({ terminal: fatal, fetches: 1, decisions: "" });
  });

  it("keeps ordinary model failures as null replies in both wrappers", async () => {
    const records: string[] = [];
    const fakeFetch: typeof fetch = async () => Response.json({}, { status: 401 });
    const provider = createMetaProvider({
      baseUrl: "https://meta.invalid/v1", apiKey: "test-key", fetch: fakeFetch,
      record: async record => { records.push(record.purpose); },
    });
    const buyer = await sparkBuyer(provider, "muse-spark-1.3")({ agentId: "sim-buyer-01", intent: "Kopi for two" }, offer);
    const proposed = await wonderMerchant(provider, "muse-wonder-1.0")(memory);
    expect(buyer).toMatchObject({ reply: null, error: "LlmError: Model call failed: HTTP 401", costNanoUsd: 0 });
    expect(proposed).toBeNull();
    expect(records).toEqual(["sim_buyer", "wonder_plan"]);
  });
});
