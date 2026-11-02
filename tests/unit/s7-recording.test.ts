import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveBoard } from "@/app/demo/live-board";
import { connectDb } from "@/lib/db/client";
import type { DemoScene } from "@/lib/demo/snapshot";
import { buyerRequest } from "../../sim/buyers/buyer";
import { BUYERS } from "../../sim/buyers/intents";
import { Recording, recordingSource, sourceOffer, validateReplay, type RecordingV2, type ReplayTerms } from "../../sim/buyers/recording";
import { runScene, SCENE_ABOUT } from "../../sim/buyers/scene";

const frozen = (): unknown => JSON.parse(readFileSync(new URL("../../sim/buyers/recordings/scene.json", import.meta.url), "utf8"));
const expected: ReplayTerms = {
  merchantName: "Backfill Demo Cafe", about: SCENE_ABOUT,
  offer: { listPriceCents: 680, offerPriceCents: 544, discountBps: 2000, minPoolCovers: 8, perAgentCapCovers: 4 }, durationMinutes: 60,
};

function recording(): RecordingV2 {
  const legacy = Recording.parse(frozen());
  return { ...legacy, version: 2, source: recordingSource(legacy) };
}

function refreshRequests(recording: RecordingV2): void {
  for (const buyer of recording.buyers) buyer.request = buyerRequest(buyer, sourceOffer(recording.source));
}

describe("recording source validation", () => {
  it("accepts the committed V1 evidence without rewriting it", () => {
    expect(Recording.safeParse(frozen()).success).toBe(true);
  });

  it("refuses edited legacy evidence rather than trusting unstructured source prose", () => {
    const recording = Recording.parse(frozen());
    recording.buyers[0]!.intent = "Different intent";
    expect(Recording.safeParse(recording).success).toBe(false);
  });

  it("attaches the verified original Sunday window and its public economics", () => {
    const legacy = Recording.parse(frozen());
    const source = validateReplay(legacy, BUYERS, expected);
    expect(source).toEqual({
      merchantName: "Backfill Demo Cafe", about: SCENE_ABOUT, visitDate: "2026-11-01",
      offer: { ...expected.offer, window: { weekday: 7, startMinute: 847, endMinute: 907, commitByMinute: 847 } },
    });
    expect(sourceOffer(source)).toMatchObject({ startsAt: "2026-11-01T06:07:00.000Z", endsAt: "2026-11-01T07:07:00.000Z", commitBy: "2026-11-01T06:07:00.000Z" });
    for (const buyer of legacy.buyers) expect(buyer.request).toEqual(buyerRequest(buyer, sourceOffer(source)));
    expect(Recording.parse(recording()).version).toBe(2);
  });

  it.each(["unknown", "duplicate", "intent", "system", "prompt"])("refuses a V2 recording with changed %s before trusting its decisions", (fault) => {
    const r = recording();
    const buyer = r.buyers[0]!;
    if (fault === "unknown") buyer.agentId = "sim-buyer-99";
    if (fault === "duplicate") r.buyers[1] = structuredClone(buyer);
    if (fault === "intent") { buyer.intent = "Changed intent"; refreshRequests(r); }
    if (fault === "system") buyer.request.system = "Different system";
    if (fault === "prompt") buyer.request.prompt = "Different prompt";
    expect(Recording.safeParse(r).success).toBe(false);
  });

  it("refuses an incomplete replay and changed requested buyer identities or intents", () => {
    const r = recording();
    r.buyers.pop();
    expect(() => validateReplay(r, BUYERS, expected)).toThrow(/identities or intents/);
    expect(() => validateReplay(recording(), BUYERS.slice(0, 5), expected)).toThrow(/identities or intents/);
    expect(() => validateReplay(recording(), [...BUYERS.slice(1), BUYERS[1]!], expected)).toThrow(/identities or intents/);
    expect(() => validateReplay(recording(), BUYERS.map((b, i) => i === 0 ? { ...b, intent: "Changed intent" } : b), expected)).toThrow(/identities or intents/);
  });

  it.each(["merchantName", "about", "price", "paid", "discount", "pool", "cap", "duration", "deadline"])("refuses changed public %s even with matching regenerated requests", (fault) => {
    const r = recording();
    if (fault === "merchantName") r.source.merchantName = "Other cafe";
    if (fault === "about") r.source.about = "a different cover";
    if (fault === "price") r.source.offer.listPriceCents += 1;
    if (fault === "paid") r.source.offer.offerPriceCents += 1;
    if (fault === "discount") r.source.offer.discountBps += 1;
    if (fault === "pool") r.source.offer.minPoolCovers += 1;
    if (fault === "cap") r.source.offer.perAgentCapCovers += 1;
    if (fault === "duration") r.source.offer.window.endMinute += 1;
    if (fault === "deadline") r.source.offer.window.commitByMinute -= 1;
    refreshRequests(r);
    expect(() => validateReplay(r, BUYERS, expected)).toThrow(/public offer/);
  });

  it("keeps a new recording's valid source day and time instead of replacing them with a rehearsal window", () => {
    const r = recording();
    r.source.visitDate = "2026-11-03";
    r.source.offer.window = { weekday: 2, startMinute: 963, endMinute: 1023, commitByMinute: 963 };
    refreshRequests(r);
    expect(validateReplay(r, BUYERS, expected)).toEqual(r.source);
    expect(sourceOffer(r.source).startsAt).toBe("2026-11-03T08:03:00.000Z");
  });

  it("refuses inconsistent or invalid source dates without throwing from the boundary parser", () => {
    const r = recording();
    r.source.visitDate = "2026-11-03";
    refreshRequests(r);
    expect(Recording.safeParse(r).success).toBe(false);
    r.source.visitDate = "not-a-date";
    expect(() => Recording.safeParse(r)).not.toThrow();
    expect(Recording.safeParse(r).success).toBe(false);
  });

  it("validates replay before preparing a rule or opening MCP", async () => {
    const local = connectDb("postgres://unused@localhost/unused", 1);
    const select = vi.spyOn(local.db, "select").mockImplementation(() => { throw new Error("prepareScene reached"); });
    const connect = vi.fn();
    const r = recording();
    r.buyers.pop();
    try {
      const error: unknown = await runScene({ db: local.db, connect, models: { mode: "replay", recording: r }, now: () => new Date("2026-11-03T06:00:00.000Z"), sleep: async () => {}, leadMinutes: 2, concurrency: 1, settleMs: 0 }).catch((error: unknown) => error);
      expect(error instanceof Error ? error.message : "no error").toMatch(/recording buyer identities/);
      expect(select).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await local.close();
    }
  });
});

describe("demo replay labels", () => {
  const scene: DemoScene = {
    id: "fixture", events: [], merchantName: "Backfill Demo Cafe", summary: "", ...expected.offer, visitDate: "2026-11-03", commitBy: "2026-11-03T06:03:00.000Z", phase: "cleared", buyers: [], pooled: { covers: 20, unlocked: true, filledCovers: 16, soldOut: true }, plan: null,
  };

  it("keeps requested diners separate from confirmed seats and missing savings", () => {
    const crowded: DemoScene = { ...scene, buyers: [{ agentId: "group", label: "Group", covers: 20, committedAt: "2026-11-03T05:00:00Z", soloUnlocks: true, outcome: "filled" }] };
    const html = renderToStaticMarkup(createElement(LiveBoard, { initial: { scene: crowded, muse: null, ledger: null } }));
    expect(html).toContain("20 diners requested seats; 16 could be confirmed.");
    expect(html).toContain("16 diners confirmed");
    expect(html).toContain("Savings unavailable");
  });

  it("does not call an open group confirmed even when the minimum is reached", () => {
    const open: DemoScene = { ...scene, phase: "open", buyers: [{ agentId: "group", label: "Group", covers: 8, committedAt: "2026-11-03T05:00:00Z", soloUnlocks: true, outcome: "pending" }] };
    const html = renderToStaticMarkup(createElement(LiveBoard, { initial: { scene: open, muse: null, ledger: null } }));
    expect(html).toContain("Minimum reached. Waiting for confirmation.");
    expect(html).not.toContain("diners confirmed");
    expect(html).not.toContain("The group unlocked the offer.");
  });

  it("shows the failed group outcome without claiming a discount", () => {
    const failed: DemoScene = { ...scene, pooled: { covers: 2, unlocked: false, filledCovers: 0, soldOut: false } };
    const html = renderToStaticMarkup(createElement(LiveBoard, { initial: { scene: failed, muse: null, ledger: null } }));
    expect(html).toContain("No bookings were confirmed for this group.");
    expect(html).not.toContain("The group unlocked the offer.");
  });

  it("labels simulated buyers and unknown provenance before a plan exists", () => {
    const html = renderToStaticMarkup(createElement(LiveBoard, { initial: { scene, muse: null, ledger: null } }));
    expect(html).toContain("Watch how it works");
    expect(html).toContain("aria-label=\"Group booking progress\"");
    expect(html).toContain("Simulated buyers.");
    expect(html).toContain("Buyer decision provenance is unknown");
    expect(html).toContain("No Wonder plan stored yet");
  });

  it("labels a stored replay plan and the possible shifted rehearsal window", () => {
    const plan = { provenance: "recorded_replay", verdict: "ok", discountBps: 1500, capacityCovers: 24, minPoolCovers: 12, perAgentCapCovers: 4, rationale: "recorded rationale", applied: false } satisfies NonNullable<DemoScene["plan"]>;
    const html = renderToStaticMarkup(createElement(LiveBoard, { initial: { scene: { ...scene, plan }, muse: null, ledger: null } }));
    expect(html).toContain("recorded Wonder plan replayed");
    expect(html).toContain("Recorded replay:");
    expect(html).toContain("shifted day and time");
    expect(html).toContain("not made afresh");
  });
});
