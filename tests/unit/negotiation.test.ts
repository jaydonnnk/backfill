import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type CounterOffer, signCounterOffer, verifyCounterOffer } from "@/domain/negotiation/counter-offer";
import { judgeProposal, MAX_ROUNDS, maxConcessionCents, type RoundContext, settleRound, startRound } from "@/domain/negotiation/rules";
import { offerPriceCents } from "@/domain/offers/evaluate";
import { MerchantRule } from "@/domain/offers/schema";

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 becomes S$9.38, floor S$9.00. One
// concession step is 2.5% of the list price, 31 cents.
const rule = (floorPriceCents = 900): MerchantRule =>
  MerchantRule.parse({
    id: "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11",
    merchantId: "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05",
    termsVersion: 1,
    listPriceCents: 1250,
    capacityCovers: 20,
    terms: {
      window: { weekday: 2, startMinute: 14 * 60, endMinute: 17 * 60, commitByMinute: 12 * 60 },
      discountBps: 2500,
      minPoolCovers: 8,
      perAgentCapCovers: 4,
      floorPriceCents,
    },
  });
const OFFER = 938;
const STEP = 31;
const ctx = (overrides: Partial<RoundContext> = {}): RoundContext => ({ rule: rule(), round: 1, previousPriceCents: OFFER, bidCents: 850, ...overrides });

describe("the fixture", () => {
  it("has the offer price and the concession step the tests assume", () => {
    expect(offerPriceCents(rule())).toBe(OFFER);
    expect(maxConcessionCents(rule())).toBe(STEP);
  });
});

describe("judgeProposal", () => {
  it("accepts a proposal at each bound: the previous price, one full step down, the bid and the floor", () => {
    expect(judgeProposal(ctx(), OFFER)).toEqual({ ok: true });
    expect(judgeProposal(ctx(), OFFER - STEP)).toEqual({ ok: true });
    expect(judgeProposal(ctx({ bidCents: 920 }), 920)).toEqual({ ok: true });
    expect(judgeProposal(ctx({ previousPriceCents: 920 }), 900)).toEqual({ ok: true });
  });

  it("rejects a proposal a cent past each bound", () => {
    expect(judgeProposal(ctx(), OFFER + 1)).toEqual({ ok: false, reason: "rises" });
    expect(judgeProposal(ctx(), OFFER - STEP - 1)).toEqual({ ok: false, reason: "concedes_too_much" });
    expect(judgeProposal(ctx({ bidCents: 920 }), 919)).toEqual({ ok: false, reason: "below_bid" });
    expect(judgeProposal(ctx({ previousPriceCents: 920 }), 899)).toEqual({ ok: false, reason: "below_floor" });
  });
});

describe("startRound", () => {
  it("allows the last round and refuses the one after it", () => {
    expect(MAX_ROUNDS).toBe(3);
    expect(startRound(ctx({ round: 3 }))).toEqual({ ok: true, needsProposal: true });
    expect(startRound(ctx({ round: 4 }))).toEqual({ ok: false, reason: "round_limit" });
  });

  it("needs no proposal for a bid at the merchant's price, and needs one a cent below", () => {
    expect(startRound(ctx({ bidCents: OFFER }))).toEqual({ ok: true, needsProposal: false });
    expect(startRound(ctx({ bidCents: OFFER - 1 }))).toEqual({ ok: true, needsProposal: true });
  });
});

describe("settleRound", () => {
  it("throws past the round limit rather than settling", () => {
    expect(() => settleRound(ctx({ round: 4 }), 920)).toThrow("round past the limit");
  });

  it("accepts a bid at the merchant's price at that price, whatever the model said", () => {
    expect(settleRound(ctx({ bidCents: 950 }), null)).toEqual({ status: "accepted", counterCents: OFFER });
  });

  it("counters at a valid proposal and accepts one equal to the bid", () => {
    expect(settleRound(ctx(), 920)).toEqual({ status: "countered", counterCents: 920, proposal: { cents: 920, verdict: { ok: true } } });
    expect(settleRound(ctx({ bidCents: 920 }), 920)).toEqual({ status: "accepted", counterCents: 920, proposal: { cents: 920, verdict: { ok: true } } });
  });

  it("holds at the previous price when the model proposes it, gives nothing, or proposes outside the limits", () => {
    expect(settleRound(ctx(), OFFER)).toMatchObject({ status: "held", counterCents: OFFER });
    expect(settleRound(ctx(), null)).toEqual({ status: "held", counterCents: OFFER });
    expect(settleRound(ctx(), OFFER + 1)).toEqual({ status: "held", counterCents: OFFER, proposal: { cents: OFFER + 1, verdict: { ok: false, reason: "rises" } } });
  });

  it("holds below-floor proposals exactly like any other hold, so the outcome names no floor", () => {
    const belowFloor = settleRound(ctx({ previousPriceCents: 920 }), 899);
    const modelHold = settleRound(ctx({ previousPriceCents: 920 }), 920);
    expect(belowFloor).toEqual({ status: "held", counterCents: 920, proposal: { cents: 899, verdict: { ok: false, reason: "below_floor" } } });
    expect({ status: belowFloor.status, counterCents: belowFloor.counterCents }).toEqual({ status: modelHold.status, counterCents: modelHold.counterCents });
  });

  it("closes when the previous price is below a floor raised mid-negotiation, and holds at the floor itself", () => {
    expect(settleRound(ctx({ rule: rule(921), previousPriceCents: 920 }), 920)).toEqual({ status: "closed" });
    expect(settleRound(ctx({ rule: rule(920), previousPriceCents: 920 }), 920)).toMatchObject({ status: "held", counterCents: 920 });
  });

  it("closes when the previous price is above the offer price", () => {
    expect(settleRound(ctx({ previousPriceCents: OFFER + 1 }), OFFER)).toEqual({ status: "closed" });
  });
});

const SECRET = "s".repeat(32);
const offer: CounterOffer = {
  v: 1,
  negotiationId: "11111111-1111-4111-8111-111111111111",
  round: 2,
  agentId: "agent-a",
  ruleId: "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11",
  termsVersion: 1,
  visitDate: "2026-11-03",
  covers: 2,
  priceCents: 907,
};

describe("signed counter-offers", () => {
  it("verifies a token it signed and gives the offer back", () => {
    expect(verifyCounterOffer(SECRET, signCounterOffer(SECRET, offer))).toEqual(offer);
  });

  it("refuses a token signed with another secret", () => {
    expect(verifyCounterOffer(SECRET, signCounterOffer("t".repeat(32), offer))).toBeNull();
  });

  it("refuses a token whose payload was changed, even to a valid offer", () => {
    const [, signature] = signCounterOffer(SECRET, offer).split(".");
    const cheaper = Buffer.from(JSON.stringify({ ...offer, priceCents: 1 })).toString("base64url");
    expect(verifyCounterOffer(SECRET, `${cheaper}.${signature}`)).toBeNull();
  });

  it("refuses a signature with a character Buffer would skip, and a token with extra parts", () => {
    const token = signCounterOffer(SECRET, offer);
    const [payload, signature] = token.split(".") as [string, string];
    expect(verifyCounterOffer(SECRET, `${payload}.${signature}!`)).toBeNull();
    expect(verifyCounterOffer(SECRET, `${token}.x`)).toBeNull();
  });

  it("refuses a well-signed payload that is not a valid offer", () => {
    // Signed by hand with the same HMAC, so only the offer's shape decides.
    const handSigned = (value: unknown) => {
      const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    };
    expect(verifyCounterOffer(SECRET, handSigned(offer))).toEqual(offer);
    expect(verifyCounterOffer(SECRET, handSigned({ ...offer, round: MAX_ROUNDS + 1 }))).toBeNull();
    expect(verifyCounterOffer(SECRET, handSigned({ ...offer, floorPriceCents: 900 }))).toBeNull();
  });

  it("refuses to sign or verify with a secret shorter than 32 characters", () => {
    expect(() => signCounterOffer("s".repeat(31), offer)).toThrow("too short");
    expect(() => verifyCounterOffer("s".repeat(31), signCounterOffer(SECRET, offer))).toThrow("too short");
  });

  it("never signs a field the offer does not name", () => {
    expect(() => signCounterOffer(SECRET, { ...offer, floorPriceCents: 900 } as CounterOffer)).toThrow(/floorPriceCents/);
  });
});
