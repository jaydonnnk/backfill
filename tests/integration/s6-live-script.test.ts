import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { loadLocalEnvFile, testEnv } from "@/env";
import type { MenuDraft } from "@/domain/onboarding/menu";
import type { WonderPlan } from "@/domain/onboarding/replan";
import { DEFAULT_PHOTO, floorHidden, liveOnboarding } from "@/lib/onboarding/live";

// The live onboarding script, run end to end against the local server with both models' fetch
// faked, so the live run is the only thing left unproven: the scratch database and role are made
// and dropped, the synthetic menu photo goes to Spark, the draft publishes with a floor buyers never
// see, the sellout is planned by Wonder without the floor, and every model call is reported.

function serverUrl(): string {
  if (!process.env.TEST_DATABASE_URL) loadLocalEnvFile();
  return testEnv().TEST_DATABASE_URL;
}

const PHOTO = new Uint8Array(readFileSync(DEFAULT_PHOTO));
const MENU: MenuDraft = {
  currency: "SGD",
  items: [
    { name: "Hainanese Chicken Rice", priceCents: 650 },
    { name: "Laksa", priceCents: 780 },
    { name: "Kopi C", priceCents: 180 },
    { name: "Teh Tarik", priceCents: 220 },
  ],
  cover: { itemIndexes: [0, 3], description: "Chicken rice and a teh tarik" },
};
const PLAN: WonderPlan = { discountBps: 2000, capacityCovers: 6, minPoolCovers: 3, perAgentCapCovers: 2, rationale: "Sold out at 4 covers; add two and trim the discount." };

type Sent = { name: string; body: { messages: { content: unknown }[] } };

// Answers each request by its schema name, with fixed token counts, and records what was sent.
function fakeModels(sent: Sent[]): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Sent["body"] & { response_format: { json_schema: { name: string } } };
    const name = body.response_format.json_schema.name;
    sent.push({ name, body });
    const [value, usage] = name === "MenuDraft" ? [MENU, { prompt_tokens: 2000, completion_tokens: 300 }] : [PLAN, { prompt_tokens: 800, completion_tokens: 200 }];
    return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }], usage });
  }) as typeof fetch;
}

const meta = { baseUrl: "https://meta.test/v1", apiKey: "test-key", spark: "muse-spark-1.3", wonder: "muse-wonder-1.0" };

describe("onboarding:live", () => {
  it("reads the menu photo, publishes with a hidden floor, plans the sellout, applies the plan and cleans up", async () => {
    const sent: Sent[] = [];
    const lines: string[] = [];
    const summary = await liveOnboarding({ serverUrl: serverUrl(), meta, photo: PHOTO, fetch: fakeModels(sent), out: (line) => lines.push(line) });

    expect(sent.map((s) => s.name)).toEqual(["MenuDraft", "WonderPlan"]);
    expect(sent[0]?.body.messages[1]?.content).toEqual([expect.objectContaining({ type: "text" }), { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from(PHOTO).toString("base64")}` } }]);
    // S$8.70 at 25% off is S$6.53; the floor is 70% of S$8.70, S$6.09, and neither Wonder nor a buyer sees it.
    expect(JSON.stringify(sent[1]?.body)).not.toMatch(/floor|609|6\.09/i);
    expect(summary).toMatchObject({
      read: "ok",
      draft: { cover: "Chicken rice and a teh tarik", verdict: "ok", listPriceCents: 870 },
      published: { listPriceCents: 870, offerPriceCents: 653, floorPriceCents: 609, floorHiddenFromBuyers: true },
      soldOut: { visitDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), filled: 4 },
      plan: { verdict: "ok", discountBps: 2000, capacityCovers: 6, minPoolCovers: 3, perAgentCapCovers: 2, rationale: PLAN.rationale },
      applied: "applied",
      stoppedForCap: false,
    });
    // 2000 in at 1250 and 300 out at 4250 nano-USD; then 800 in at 4000 and 200 out at 20000.
    expect(summary.calls.map((c) => [c.purpose, c.model, c.attempt, c.ok, c.costNanoUsd])).toEqual([
      ["menu_vision", "muse-spark-1.3", 1, true, 3_775_000],
      ["wonder_plan", "muse-wonder-1.0", 1, true, 7_200_000],
    ]);
    expect(summary.costNanoUsd).toBe(10_975_000);
    expect(lines).toContain("floor hidden from buyers: yes");
    expect(lines.at(-1)).toBe("total model cost $0.010975 (cap $1.000000)");
    expect(lines.join("\n")).not.toContain(Buffer.from(PHOTO).toString("base64").slice(0, 64));

    const root = postgres(serverUrl(), { max: 1, onnotice: () => {} });
    try {
      const { database, login, ranAs } = summary.scratch;
      expect(ranAs).toBe(login);
      const left = await root`
        select (select count(*)::int from pg_database where datname = ${database}) as databases,
               (select count(*)::int from pg_roles where rolname = ${login}) as roles`;
      expect(left).toEqual([{ databases: 0, roles: 0 }]);
    } finally {
      await root.end({ timeout: 5 });
    }
  });

  it("starts no model step once the recorded cost reaches the cap", async () => {
    const sent: Sent[] = [];
    const summary = await liveOnboarding({ serverUrl: serverUrl(), meta, photo: PHOTO, fetch: fakeModels(sent), out: () => {}, capNanoUsd: 3_775_000 });
    expect(sent.map((s) => s.name)).toEqual(["MenuDraft"]);
    expect([summary.read, summary.soldOut?.filled, summary.plan, summary.costNanoUsd, summary.stoppedForCap]).toEqual(["ok", 4, null, 3_775_000, true]);

    const none = await liveOnboarding({ serverUrl: serverUrl(), meta, photo: PHOTO, fetch: fakeModels(sent), out: () => {}, capNanoUsd: 0 });
    expect([sent.length, none.read, none.stoppedForCap]).toEqual([1, "not run", true]);
  });

  it("reports a floor that reaches the buyers' view, by name or by price, but not one spelled by an id", () => {
    const id = "6090a000-0000-4000-8000-000000000609";
    expect(floorHidden({ ruleId: id, offerPriceCents: 653 }, 609)).toBe(true);
    expect(floorHidden({ ruleId: id, offerPriceCents: 609 }, 609)).toBe(false);
    expect(floorHidden({ ruleId: id, floorPriceCents: 1 }, 609)).toBe(false);
  });

  it("refuses a server that is not local before touching it", async () => {
    // A .invalid host never resolves, so even without the check nothing would leave this machine.
    const refused = await liveOnboarding({ serverUrl: "postgres://u@ep-x.neon.invalid/neondb", meta, photo: PHOTO, fetch: fakeModels([]) }).then(
      () => null,
      (err: Error) => err.message,
    );
    expect(refused).toBe("the server URL must be a local PostgreSQL");
  });
});
