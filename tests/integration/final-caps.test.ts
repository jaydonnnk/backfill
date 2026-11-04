import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb } from "@/lib/db/client";
import { mcpPostHandler } from "@/lib/mcp/http";
import { negotiate } from "@/lib/negotiation/service";
import { cappedProposal } from "@/lib/negotiation/merchant-agent";
import { mintMerchant } from "@/lib/onboarding/links";
import { registerMerchant } from "@/lib/onboarding/registration";
import { readMenu } from "@/lib/onboarding/service";
import { takeLimits, takeRateLimit } from "@/lib/rate-limit";
import { createTestDatabase, type TestDatabase } from "../support/db";

vi.mock("@/lib/db/client", async (original) => ({
  ...await original<typeof import("@/lib/db/client")>(),
  webDb: () => app.db,
}));
vi.mock("@/env", async (original) => ({
  ...await original<typeof import("@/env")>(),
  webEnv: () => ({ META_BASE_URL: "https://meta.test/v1", META_API_KEY: "test", META_MODEL_SPARK: "muse-spark-1.3", NEGOTIATION_SIGNING_SECRET: "s".repeat(32) }),
}));

let t: TestDatabase;
let app: ReturnType<typeof connectDb>;
let observer: postgres.Sql;
const role = `cp_${randomBytes(6).toString("hex")}`;
const PHOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const MENU = { currency: "SGD" as const, items: [{ name: "Kopi", priceCents: 300 }], cover: { itemIndexes: [0], description: "one kopi" } };
const later = () => new Date();

beforeAll(async () => {
  t = await createTestDatabase("final_caps");
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = role;
  app = connectDb(url.toString(), 6);
  observer = postgres(t.url, { max: 1, onnotice: () => {} });
});
beforeEach(async () => { await t.admin`truncate rate_limits`; await t.admin`update merchants set created_at = now() - interval '2 hours'`; });
afterAll(async () => {
  await observer?.end({ timeout: 5 });
  await app?.close();
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${role}`); }
  finally { await root.end({ timeout: 5 }); }
});

describe("menu reads", () => {
  it("lets two reads run at once", async () => {
    const m = await mintMerchant(t.db, "Two Reads");
    let entered!: () => void;
    let release!: () => void;
    const inside = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = readMenu(app.db, m.id, PHOTO, async () => { entered(); await gate; return MENU; }, "m");
    await inside;
    let second;
    try {
      second = await readMenu(app.db, m.id, PHOTO, async () => MENU, "m");
    } finally { release(); }
    expect([(await first).status, second.status]).toEqual(["ok", "ok"]);
  });
  it("holds no transaction open during the model call", async () => {
    const m = await mintMerchant(t.db, "No Tx");
    let open = -1;
    await readMenu(app.db, m.id, PHOTO, async () => {
      const [row] = await observer`select count(*)::int as n from pg_stat_activity where usename = ${role} and xact_start is not null`;
      open = row?.n ?? -1;
      return MENU;
    }, "m");
    expect(open).toBe(0);
  });
  it("stops one client at 10 a day while another still reads", async () => {
    const m = await mintMerchant(t.db, "Client Cap");
    for (let i = 0; i < 10; i++) expect((await readMenu(app.db, m.id, PHOTO, async () => MENU, "m", later, "client-a")).status).toBe("ok");
    expect(await readMenu(app.db, m.id, PHOTO, async () => MENU, "m", later, "client-a")).toEqual({ status: "daily_cap" });
    expect((await readMenu(app.db, m.id, PHOTO, async () => MENU, "m", later, "client-b")).status).toBe("ok");
  });
  it("stops everyone at 100 a day", async () => {
    const m = await mintMerchant(t.db, "Global Cap");
    for (let i = 0; i < 100; i++) expect((await readMenu(app.db, m.id, PHOTO, async () => MENU, "m")).status).toBe("ok");
    expect(await readMenu(app.db, m.id, PHOTO, async () => MENU, "m", later, "client-c")).toEqual({ status: "daily_cap" });
  });
});

describe("signups", () => {
  it("stops one client at 5 an hour", async () => {
    for (let i = 0; i < 5; i++) expect((await registerMerchant(app.db, `Spam ${i}`, "client-a")).status).toBe("created");
    expect((await registerMerchant(app.db, "Spam 6", "client-a")).status).toBe("rate_limited");
    expect((await registerMerchant(app.db, "Other", "client-b")).status).toBe("created");
  });
  it("holds an unknown client only by the global cap", async () => {
    for (let i = 0; i < 100; i++) expect((await registerMerchant(app.db, `Unknown ${i}`, null)).status).toBe("created");
    expect(await registerMerchant(app.db, "Over global", null)).toEqual({ status: "rate_limited" });
  });
});

describe("/mcp body limit", () => {
  const LIMIT = 64_000;
  const list = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
  const send = (body: BodyInit, auth: string, extra: Record<string, string> = {}) => mcpPostHandler(() => app.db, later, () => null)(new Request("http://x/mcp", { method: "POST", duplex: "half", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: auth, ...extra }, body } as RequestInit));
  const padded = (size: number) => list + " ".repeat(size - list.length);
  let token = "";
  beforeAll(async () => { token = (await mintAgent(t.db, "cp-agent", "x")).token; });

  it("answers a body of exactly the limit", async () => {
    const body = padded(LIMIT);
    expect(body.length).toBe(LIMIT);
    expect((await send(body, `Bearer ${token}`)).status).toBe(200);
  });
  it("refuses one byte more", async () => {
    expect((await send(padded(LIMIT + 1), `Bearer ${token}`)).status).toBe(413);
  });
  it("refuses an oversize stream with an understated length", async () => {
    const stream = new Blob([padded(LIMIT + 1)]).stream();
    expect((await send(stream, `Bearer ${token}`, { "content-length": "10" })).status).toBe(413);
  });
  it("answers 401, not 413, to an unauthenticated oversize request", async () => {
    expect((await send(padded(LIMIT + 1), "Bearer nope")).status).toBe(401);
  });
});

describe("negotiation model cap", () => {
  it("gives no proposal once the day's 200 calls are used, so the round holds", async () => {
    let calls = 0;
    const propose = cappedProposal(app.db, async () => { calls += 1; return 500; });
    const input = { merchantName: "m", listPriceCents: 680, offerPriceCents: 544, previousPriceCents: 544, bidCents: 500, covers: 2, round: 1, maxRounds: 3, maxConcessionCents: 17 };
    expect(await propose(input)).toBe(500);
    for (let i = 0; i < 199; i++) await takeRateLimit(app.db, "negotiation:all", "all", 200, 86400);
    expect(await propose(input)).toBeNull();
    expect(calls).toBe(1);
    const merchant = await mintMerchant(t.db, "Capped negotiation");
    const agent = await mintAgent(t.db, "capped-buyer", "synthetic");
    const [rule] = await t.admin`insert into rules (merchant_id, list_price_cents, capacity_covers, weekday, start_minute, end_minute, commit_by_minute, discount_bps, min_pool_covers, per_agent_cap_covers, floor_price_cents)
      values (${merchant.id}, 680, 20, 2, 840, 1020, 720, 2000, 4, 4, 500) returning id`;
    const result = await negotiate(app.db, { secret: "s".repeat(32), propose, clock: () => new Date("2026-11-03T09:00:00+08:00") }, agent.id,
      { ruleId: String(rule?.id), termsVersion: 1, visitDate: "2026-11-03", covers: 2, bidCents: 500 });
    expect(result).toMatchObject({ ok: true, negotiation: { status: "held", merchantPriceCents: 544 } });
    expect(calls).toBe(1);
  });
});

describe("takeLimits", () => {
  it("does not spend the global allowance when a known client is exhausted", async () => {
    expect(await takeLimits(app.db, "direct", "a", 1, 2, 3600)).toBe(true);
    expect(await takeLimits(app.db, "direct", "a", 1, 2, 3600)).toBe(false);
    expect(await takeLimits(app.db, "direct", "b", 1, 2, 3600)).toBe(true);
    expect(await takeLimits(app.db, "direct", "c", 1, 2, 3600)).toBe(false);
  });
  it("skips the per-client allowance for null while enforcing the shared limit", async () => {
    expect(await takeLimits(app.db, "unknown", null, 1, 2, 3600)).toBe(true);
    expect(await takeLimits(app.db, "unknown", null, 1, 2, 3600)).toBe(true);
    expect(await takeLimits(app.db, "unknown", null, 1, 2, 3600)).toBe(false);
  });
});

it("the hosted negotiation route makes at most one provider attempt per reserved call", async () => {
  const { POST } = await import("@/app/mcp/route");
  const merchant = await mintMerchant(t.db, "Hosted cap");
  const agent = await mintAgent(t.db, "hosted-cap-buyer", "synthetic");
  const visitDate = "2099-11-03";
  const weekday = new Date(visitDate).getUTCDay() || 7;
  const [rule] = await t.admin`insert into rules (merchant_id, list_price_cents, capacity_covers, weekday, start_minute, end_minute, commit_by_minute, discount_bps, min_pool_covers, per_agent_cap_covers, floor_price_cents)
    values (${merchant.id}, 680, 20, ${weekday}, 840, 1020, 720, 2000, 4, 4, 500) returning id`;
  for (let i = 0; i < 199; i++) await takeRateLimit(app.db, "negotiation:all", "all", 200, 86400);
  let attempts = 0;
  vi.stubGlobal("fetch", async () => { attempts++; return new Response("{}", { status: 500 }); });
  const request = () => new Request("http://backfill.test/mcp", {
    method: "POST", headers: { authorization: `Bearer ${agent.token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "negotiate_offer", arguments: { ruleId: rule?.id, termsVersion: 1, visitDate, covers: 2, bidCents: 500 } } }),
  });
  try {
    const first = await POST(request());
    expect(await first.json()).toMatchObject({ result: { structuredContent: { ok: true, negotiation: { status: "held" } } } });
    const second = await POST(request());
    expect(await second.json()).toMatchObject({ result: { structuredContent: { ok: true, negotiation: { status: "held" } } } });
    expect(attempts).toBe(1);
  } finally { vi.unstubAllGlobals(); }
});
