import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The webhook route with its edges faked: the settings, Next's after(), the database and the service.

const state = vi.hoisted(() => ({
  config: null as null | { appSecret: string; verifyToken: string; accessToken: string; phoneNumberId: string; baseUrl: string },
  afters: [] as (() => Promise<unknown>)[],
  processed: [] as unknown[][],
}));

vi.mock("@/env", () => ({
  webEnv: () => ({ META_BASE_URL: "https://api.meta.test/v1", META_API_KEY: "k", META_MODEL_WONDER: "wonder" }),
  whatsappEnv: () => state.config,
}));
vi.mock("next/server", () => ({ after: (run: () => Promise<unknown>) => void state.afters.push(run) }));
vi.mock("@/lib/db/client", () => ({ webDb: () => ({}) }));
vi.mock("@/lib/whatsapp/service", () => ({
  processInbound: async (...args: unknown[]) => void state.processed.push(args),
}));

const { GET, POST } = await import("@/app/api/whatsapp/route");

const SECRET = "app-secret";
const CONFIG = { appSecret: SECRET, verifyToken: "verify-me", accessToken: "t", phoneNumberId: "1234567890", baseUrl: "https://graph.test/v1" };
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.A", from: "6591234567", type: "text", text: { body: "make it 20% off" } }] } }] }] });
const post = (body: string, signature: string | null) => POST(new Request("https://backfill.test/api/whatsapp", { method: "POST", body, headers: signature ? { "x-hub-signature-256": signature } : {} }));

beforeEach(() => {
  state.config = CONFIG;
  state.afters = [];
  state.processed = [];
});

describe("GET /api/whatsapp", () => {
  const url = (q: string) => new Request(`https://backfill.test/api/whatsapp?${q}`);

  it("echoes the challenge for the right verify token, and refuses any other", async () => {
    const ok = await GET(url("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=987"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("987");
    expect((await GET(url("hub.mode=subscribe&hub.verify_token=nope&hub.challenge=987"))).status).toBe(403);
    expect((await GET(url(""))).status).toBe(403);
  });

  it("does not exist without the WhatsApp settings", async () => {
    state.config = null;
    expect((await GET(url("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=987"))).status).toBe(404);
  });
});

describe("POST /api/whatsapp", () => {
  it("answers 200 at once and handles the messages after the response", async () => {
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(state.processed).toHaveLength(0);
    await state.afters[0]?.();
    expect(state.processed).toHaveLength(1);
    expect(state.processed[0]?.[1]).toEqual([{ wamid: "wamid.A", from: "6591234567", text: "make it 20% off" }]);
  });

  it("refuses a missing, wrong or tampered signature before reading anything", async () => {
    expect((await post(payload, null)).status).toBe(403);
    expect((await post(payload, `sha256=${"0".repeat(64)}`)).status).toBe(403);
    expect((await post(`${payload} `, sign(payload))).status).toBe(403);
    expect(state.afters).toHaveLength(0);
  });

  it("refuses a signed body that is not JSON, and does not exist without the settings", async () => {
    expect((await post("not json", sign("not json"))).status).toBe(400);
    state.config = null;
    expect((await post(payload, sign(payload))).status).toBe(404);
    expect(state.afters).toHaveLength(0);
  });

  it("takes a signed delivery receipt with no messages and handles none", async () => {
    const receipt = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] });
    expect((await post(receipt, sign(receipt))).status).toBe(200);
    await state.afters[0]?.();
    expect(state.processed[0]?.[1]).toEqual([]);
  });
});
