import { describe, expect, it } from "vitest";
import { sceneWindow } from "@/domain/demo/scene";
import { createMetaProvider, type LlmCallRecord } from "@/integrations/meta/provider";
import { sparkBuyer } from "../../sim/buyers/buyer";

const buyer = { agentId: "sim-buyer-01", intent: "Kopi for two" };
const offer = { merchantName: "Backfill Demo Cafe", about: "a kopi set", summary: "Afternoon kopi for a pooled booking", visitDate: "2026-11-03", commitBy: "2026-11-03T06:03:00.000Z", startsAt: "2026-11-03T06:03:00.000Z", endsAt: "2026-11-03T07:03:00.000Z", perAgentCapCovers: 4 };
const request = {
  system: "You are a buyer agent for one person in Singapore. You commit to a pooled off-peak offer only when it fits the person's intent. A commitment is binding from its deadline on. Reply only with JSON matching the schema.",
  prompt: "The person you act for wants: Kopi for two.\nOffer from Backfill Demo Cafe: Afternoon kopi for a pooled booking\nOne cover is a kopi set.\nNext visit: 3 Nov 2026, 2:03 pm to 3 Nov 2026, 3:03 pm, commit by 3 Nov 2026, 2:03 pm (Singapore time).\nYou may commit at most 4 covers. Decide how many covers to commit, or 0 if the offer does not fit.",
};

function setup(contents: string[]) {
  const requests: { url: string; body: unknown }[] = [];
  const records: LlmCallRecord[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const content = contents.shift();
    if (content === undefined) throw new Error("No scripted response left");
    return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } });
  };
  const provider = createMetaProvider({
    baseUrl: "https://meta.invalid/v1",
    apiKey: "test-key",
    fetch: fakeFetch,
    record: async (record) => { records.push(record); },
    backoffMs: () => 0,
  });
  return { decide: sparkBuyer(provider, "muse-spark-1.3"), requests, records };
}

describe("sparkBuyer through the Meta provider", () => {
  it("returns the validated decision and bills failed retries while preserving its request and token cap", async () => {
    const { decide, requests, records } = setup(['{"covers":2,', '{"covers":-1,"reason":"No"}', '{"covers":2,"reason":"The afternoon offer fits two people."}']);

    expect(await decide(buyer, offer)).toEqual({ request, reply: { covers: 2, reason: "The afternoon offer fits two people." }, error: null, costNanoUsd: 63_000 });
    expect(requests[0]).toMatchObject({
      url: "https://meta.invalid/v1/chat/completions",
      body: {
        model: "muse-spark-1.3",
        messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
        reasoning_effort: "low",
        response_format: { type: "json_schema", json_schema: { name: "BuyerDecision", strict: true } },
      },
    });
    for (const sent of requests) expect(sent.body).toMatchObject({ max_completion_tokens: 2048 });
    expect(records.map(({ attempt, purpose, ok, costNanoUsd }) => [attempt, purpose, ok, costNanoUsd])).toEqual([
      [1, "sim_buyer", false, 21_000],
      [2, "sim_buyer", false, 21_000],
      [3, "sim_buyer", true, 21_000],
    ]);
    expect(records[0]?.error).toBe("the reply was not JSON");
    expect(records[1]?.error).toContain("covers:");
  });

  it("keeps a null decision and an explicit error after truncated and invalid replies exhaust retries", async () => {
    const { decide, records } = setup(['{"covers":2,', '{"covers":-1,"reason":"No"}', '{"covers":2,']);

    expect(await decide(buyer, offer)).toEqual({ request, reply: null, error: "LlmError: Model call failed after 3 attempts: the reply was not JSON", costNanoUsd: 0 });
    expect(records.map(({ attempt, ok, costNanoUsd }) => [attempt, ok, costNanoUsd])).toEqual([[1, false, 21_000], [2, false, 21_000], [3, false, 21_000]]);
    expect(records[1]?.error).toContain("covers:");
  });
});

it("refuses a positive fractional scene lead", () => {
  expect(() => sceneWindow(new Date("2026-11-03T14:00:00+08:00"), 1.5)).toThrow("leadMinutes must be a positive integer");
});
