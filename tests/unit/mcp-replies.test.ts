import { describe, expect, it } from "vitest";
import { ToolReplies, toolReply } from "@/lib/mcp/server";

// Every MCP reply is parsed by these schemas before it is sent. They are strict, so a reply that
// carries the hidden floor or the capacity, or a refusal that names the floor, cannot be sent.

const offer = {
  ruleId: "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11",
  merchantId: "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05",
  termsVersion: 1,
  listPriceCents: 1250,
  offerPriceCents: 938,
  discountBps: 2500,
  window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 },
  minPoolCovers: 8,
  perAgentCapCovers: 4,
};
const terms = {
  merchantName: "Ah Seng Kopitiam",
  offer,
  summary: "terms",
  nextOccurrence: { visitDate: "2026-11-03", commitBy: "2026-11-03T04:00:00.000Z", startsAt: "2026-11-03T06:00:00.000Z", endsAt: "2026-11-03T09:00:00.000Z" },
};
const commitment = {
  commitmentId: "00000000-0000-4000-8000-000000000001",
  ruleId: offer.ruleId,
  termsVersion: 1,
  visitDate: "2026-11-03",
  covers: 2,
  maxPricePerCoverCents: 938,
  committedAt: "2026-11-03T01:00:00.000Z",
  commitBy: "2026-11-03T04:00:00.000Z",
  status: "filled",
  pricePerCoverCents: 938,
};
const refused = (reply: unknown, schema: { safeParse: (v: unknown) => { success: boolean } }) => !schema.safeParse(reply).success;

describe("tool reply schemas", () => {
  it("accept the public shapes", () => {
    expect(refused({ ok: true, terms, binding: "b" }, ToolReplies.get_agent_terms)).toBe(false);
    expect(refused({ ok: true, offers: [terms], binding: "b" }, ToolReplies.list_offers)).toBe(false);
    expect(refused({ ok: true, commitment }, ToolReplies.get_commitment_status)).toBe(false);
    expect(refused({ ok: false, reason: "offer_unavailable", message: "m" }, ToolReplies.submit_commitment)).toBe(false);
  });

  it("refuse a floor or capacity anywhere in an offer, its terms or a commitment", () => {
    expect({
      offer: refused({ ok: true, terms: { ...terms, offer: { ...offer, floorPriceCents: 900 } }, binding: "b" }, ToolReplies.get_agent_terms),
      terms: refused({ ok: true, terms: { ...terms, capacityCovers: 20 }, binding: "b" }, ToolReplies.get_agent_terms),
      list: refused({ ok: true, offers: [{ ...terms, floorPriceCents: 900 }], binding: "b" }, ToolReplies.list_offers),
      listTop: refused({ ok: true, offers: [terms], binding: "b", capacityCovers: 20 }, ToolReplies.list_offers),
      commitment: refused({ ok: true, commitment: { ...commitment, floorPriceCents: 900 } }, ToolReplies.get_commitment_status),
      submitted: refused({ ok: true, replayed: false, commitment: { ...commitment, capacityCovers: 20 }, binding: "b" }, ToolReplies.submit_commitment),
      cancelled: refused({ ok: true, commitment: { ...commitment, remainingCapacity: 3 } }, ToolReplies.cancel_commitment),
    }).toEqual({ offer: true, terms: true, list: true, listTop: true, commitment: true, submitted: true, cancelled: true });
  });

  it("refuse a refusal that names the floor or carries extra detail", () => {
    expect(refused({ ok: false, reason: "below_floor", message: "m" }, ToolReplies.submit_commitment)).toBe(true);
    expect(refused({ ok: false, reason: "offer_unavailable", message: "m", floorPriceCents: 900 }, ToolReplies.get_agent_terms)).toBe(true);
  });
});

describe("toolReply", () => {
  it("sends a reply the schema accepts, and answers unavailable for one it refuses or a failure", async () => {
    const ok = await toolReply("get_agent_terms", "agent-a", async () => ({ ok: true, terms, binding: "b" }));
    const leaky = await toolReply("get_agent_terms", "agent-a", async () => ({ ok: true, terms: { ...terms, offer: { ...offer, floorPriceCents: 900 } }, binding: "b" }));
    const thrown = await toolReply("list_offers", "agent-a", async () => {
      throw new Error("select floor_price_cents from rules");
    });
    expect([ok.isError, ok.structuredContent]).toEqual([false, { ok: true, terms, binding: "b" }]);
    const unavailable = { ok: false, reason: "unavailable", message: expect.stringMatching(/^The server could not answer just now/) };
    expect([leaky.isError, leaky.structuredContent]).toEqual([true, unavailable]);
    expect([thrown.isError, thrown.structuredContent]).toEqual([true, unavailable]);
    expect(JSON.stringify([leaky.content, thrown.content])).not.toMatch(/floor/);
  });
});
