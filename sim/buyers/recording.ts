import { createHash } from "node:crypto";
import { z } from "zod";
import { singaporeInstant } from "@/domain/commitments/occurrence";
import { Offer } from "@/domain/offers/schema";
import { singaporeLocal } from "@/domain/singapore-time";
import { WonderPlan } from "@/domain/onboarding/replan";
import { termsSummary, type OfferView } from "@/lib/commitments/service";
import { BuyerDecision, buyerRequest, type OfferSeen } from "./buyer";
import { BUYERS, type BuyerIntent } from "./intents";

const PublicTerms = Offer.omit({ ruleId: true, merchantId: true, termsVersion: true });
export const SourceContext = z.strictObject({
  merchantName: z.string().min(1),
  about: z.string().min(1),
  offer: PublicTerms,
  visitDate: z.iso.date(),
}).refine((source) => {
  const noon = new Date(`${source.visitDate}T12:00:00+08:00`);
  return !Number.isNaN(noon.getTime()) && singaporeLocal(noon).weekday === source.offer.window.weekday;
}, { message: "source date does not match its weekday" });
export type SourceContext = z.infer<typeof SourceContext>;

const fields = {
  recordedAt: z.iso.datetime(),
  sparkModel: z.string(),
  wonderModel: z.string(),
  buyers: z.array(z.strictObject({
    agentId: z.string(),
    intent: z.string(),
    request: z.strictObject({ system: z.string(), prompt: z.string() }),
    reply: BuyerDecision.nullable(),
    error: z.string().nullable(),
    costNanoUsd: z.int().nonnegative(),
  })),
  wonder: z.strictObject({ prompt: z.string(), reply: WonderPlan.nullable() }).nullable(),
  costNanoUsd: z.int().nonnegative(),
};

// Only the committed V1 artifact has a verified source. All new recordings carry structured terms.
const LegacyRecording = z.strictObject({ version: z.literal(1), ...fields }).refine(
  (recording) => createHash("sha256").update(JSON.stringify(recording)).digest("hex") === "1d7055a98e5335bef6c3561322894083b78c2eb37de3d7e46689755488361d33",
  { message: "unverified legacy recording; record V2 with its source context" },
);

export function sourceOffer(source: SourceContext): OfferSeen {
  const window = source.offer.window;
  return {
    merchantName: source.merchantName,
    about: source.about,
    summary: termsSummary(source.merchantName, source.offer),
    visitDate: source.visitDate,
    commitBy: singaporeInstant(source.visitDate, window.commitByMinute).toISOString(),
    startsAt: singaporeInstant(source.visitDate, window.startMinute).toISOString(),
    endsAt: singaporeInstant(source.visitDate, window.endMinute).toISOString(),
    perAgentCapCovers: source.offer.perAgentCapCovers,
  };
}

export const RecordingV2 = z.strictObject({ version: z.literal(2), source: SourceContext, ...fields }).superRefine((recording, ctx) => {
  if (!SourceContext.safeParse(recording.source).success) return;
  const seen = new Set<string>();
  for (const buyer of recording.buyers) {
    const canonical = BUYERS.find((candidate) => candidate.agentId === buyer.agentId);
    if (canonical === undefined || seen.has(buyer.agentId)) ctx.addIssue({ code: "custom", message: "invalid or duplicate buyer identity" });
    seen.add(buyer.agentId);
    if (canonical !== undefined && canonical.intent !== buyer.intent) ctx.addIssue({ code: "custom", message: "buyer intent changed" });
    const expected = buyerRequest(buyer, sourceOffer(recording.source));
    if (buyer.request.system !== expected.system || buyer.request.prompt !== expected.prompt) ctx.addIssue({ code: "custom", message: "buyer request differs from its source context" });
  }
});
export type RecordingV2 = z.infer<typeof RecordingV2>;
export const Recording = z.union([LegacyRecording, RecordingV2]);
export type Recording = z.infer<typeof Recording>;

export function recordingSource(recording: Recording): SourceContext {
  return recording.version === 2 ? recording.source : SourceContext.parse({
    merchantName: "Backfill Demo Cafe",
    about: "a kopi and kaya toast set with soft-boiled eggs at a cafe near Tanjong Pagar MRT, with seats and quiet desks",
    visitDate: "2026-11-01",
    offer: { listPriceCents: 680, offerPriceCents: 544, discountBps: 2000, minPoolCovers: 8, perAgentCapCovers: 4, window: { weekday: 7, startMinute: 847, endMinute: 907, commitByMinute: 847 } },
  });
}

export function captureSource(terms: OfferView, about: string): SourceContext {
  const offer = PublicTerms.strip().parse(terms.offer);
  return SourceContext.parse({ merchantName: terms.merchantName, about, offer, visitDate: terms.nextOccurrence.visitDate });
}

export type ReplayTerms = { merchantName: string; about: string; offer: Omit<SourceContext["offer"], "window">; durationMinutes: number };

export function validateReplay(input: Recording, buyers: readonly BuyerIntent[], expected: ReplayTerms): SourceContext {
  const recording = Recording.parse(input);
  const source = recordingSource(recording);
  if (recording.buyers.length !== buyers.length || new Set(buyers.map((buyer) => buyer.agentId)).size !== buyers.length || buyers.some((buyer) => !recording.buyers.some((recorded) => recorded.agentId === buyer.agentId && recorded.intent === buyer.intent))) {
    throw new Error("recording buyer identities or intents do not match this scene");
  }
  if (source.merchantName !== expected.merchantName || source.about !== expected.about || Object.entries(expected.offer).some(([key, value]) => !Object.entries(source.offer).some(([sourceKey, sourceValue]) => sourceKey === key && sourceValue === value)) || source.offer.window.endMinute - source.offer.window.startMinute !== expected.durationMinutes || source.offer.window.commitByMinute !== source.offer.window.startMinute) {
    throw new Error("recording public offer economics or context changed");
  }
  return source;
}
