import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { sceneWindow } from "@/domain/demo/scene";
import { WonderPlan } from "@/domain/onboarding/replan";
import type { Db } from "@/lib/db/client";
import { merchants, rules } from "@/lib/db/schema";
import { DEMO_MERCHANT_NAME, demoSnapshot, type DemoSnapshot } from "@/lib/demo/snapshot";
import { mintMerchant } from "@/lib/onboarding/links";
import { planPrompt, type ProposePlan } from "@/lib/onboarding/models";
import { replanSoldOut } from "@/lib/onboarding/service";
import { ToolReplies } from "@/lib/mcp/server";
import { BuyerDecision, type DecideBuyer, type OfferSeen } from "./buyer";
import { BUYERS, type BuyerIntent } from "./intents";

// The S7 scene, end to end: a fresh rule for Backfill Demo Cafe whose deadline is a few minutes
// ahead, 20 buyer agents that read it and commit through the MCP server, the deadline passing, each
// buyer's status call clearing the pool through the same server, and Muse Wonder re-planning the
// sellout. Record mode asks Muse Spark and Wonder and saves every request and reply; replay mode
// re-sends the recorded decisions through the same MCP and clearing path with no model call.

// One cover is a kopi and kaya toast set: S$6.80, 20% off is S$5.44. Capacity 16 against about 40
// covers of demand makes the sellout; no agent's cap of 4 reaches the pool's minimum of 8 alone.
export const SCENE_RULE = { listPriceCents: 680, discountBps: 2000, floorPriceCents: 500, capacityCovers: 16, minPoolCovers: 8, perAgentCapCovers: 4 } as const;
export const SCENE_ABOUT = "a kopi and kaya toast set with soft-boiled eggs at a cafe near Tanjong Pagar MRT, with seats and quiet desks";

export const Recording = z.strictObject({
  version: z.literal(1),
  recordedAt: z.iso.datetime(),
  sparkModel: z.string(),
  wonderModel: z.string(),
  buyers: z.array(
    z.strictObject({
      agentId: z.string(),
      intent: z.string(),
      request: z.strictObject({ system: z.string(), prompt: z.string() }),
      reply: BuyerDecision.nullable(),
      costNanoUsd: z.int().nonnegative(),
    }),
  ),
  wonder: z.strictObject({ prompt: z.string(), reply: WonderPlan.nullable() }).nullable(),
  // Every attempt the provider billed, failed ones included.
  costNanoUsd: z.int().nonnegative(),
});
export type Recording = z.infer<typeof Recording>;

// The MCP tools a buyer uses, each answering its structured content.
export type BuyerClient = { call: (name: string, args: Record<string, unknown>) => Promise<unknown>; close: () => Promise<void> };
export type ConnectBuyer = (agentId: string) => Promise<BuyerClient>;

export type Models =
  | { mode: "record"; spark: string; wonder: string; decide: DecideBuyer; propose: ProposePlan; spentNanoUsd: () => number; capNanoUsd: number }
  | { mode: "replay"; recording: Recording };

export type SceneOptions = {
  // The scene merchant's database, as an owner: it creates the rule and retires the old ones.
  db: Db;
  connect: ConnectBuyer;
  models: Models;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  leadMinutes: number;
  concurrency: number;
  // How long after the deadline the status calls start, for clock skew with the server.
  settleMs: number;
  buyers?: readonly BuyerIntent[];
  out?: (line: string) => void;
};

export type BuyerOutcome = { agentId: string; covers: number; reason: string | null; outcome: string };

export type SceneResult = { ruleId: string; visitDate: string; commitBy: string; buyers: BuyerOutcome[]; replan: string; recording: Recording | null; snapshot: DemoSnapshot };

// Creates the merchant on first use, retires its earlier rules by raising their hidden floor to
// the list price (so they leave list_offers like any rule below its floor; the floor is not a
// public term, so no terms version moves) and adds today's scene rule.
export async function prepareScene(db: Db, now: Date, leadMinutes: number): Promise<{ merchant: { id: string; name: string }; ruleId: string; visitDate: string }> {
  const window = sceneWindow(now, leadMinutes);
  if (window === null) throw new Error("too late in the Singapore day: no scene window fits before midnight");
  const [found] = await db.select({ id: merchants.id, name: merchants.name }).from(merchants).where(eq(merchants.name, DEMO_MERCHANT_NAME)).orderBy(asc(merchants.id)).limit(1);
  const merchant = found ?? { id: (await mintMerchant(db, DEMO_MERCHANT_NAME)).id, name: DEMO_MERCHANT_NAME };
  const ruleId = await db.transaction(async (tx) => {
    const old = await tx.select({ id: rules.id, list: rules.listPriceCents }).from(rules).where(eq(rules.merchantId, merchant.id));
    for (const r of old) await tx.update(rules).set({ floorPriceCents: r.list }).where(and(eq(rules.id, r.id), eq(rules.merchantId, merchant.id)));
    const { weekday, startMinute, endMinute, commitByMinute } = window;
    const [row] = await tx
      .insert(rules)
      .values({ merchantId: merchant.id, weekday, startMinute, endMinute, commitByMinute, ...SCENE_RULE })
      .returning({ id: rules.id });
    return row!.id;
  });
  return { merchant, ruleId, visitDate: window.visitDate };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runScene(o: SceneOptions): Promise<SceneResult> {
  const out = o.out ?? (() => {});
  const buyers = o.buyers ?? BUYERS;
  const { merchant, ruleId, visitDate } = await prepareScene(o.db, o.now(), o.leadMinutes);
  out(`scene rule ${ruleId} for ${visitDate}`);

  const recorded = o.models.mode === "replay" ? new Map(o.models.recording.buyers.map((b) => [b.agentId, b])) : null;
  const records: Recording["buyers"] = [];
  const committed = new Map<string, string>();

  const outcomes = await mapLimit(buyers, o.concurrency, async (buyer): Promise<BuyerOutcome> => {
    const client = await o.connect(buyer.agentId);
    try {
      const list = ToolReplies.list_offers.parse(await client.call("list_offers", {}));
      if (!list.offers.some((v) => v.offer.ruleId === ruleId)) return { agentId: buyer.agentId, covers: 0, reason: null, outcome: "offer_not_listed" };
      const read = ToolReplies.get_agent_terms.parse(await client.call("get_agent_terms", { ruleId }));
      if (!read.ok) return { agentId: buyer.agentId, covers: 0, reason: null, outcome: `refused_${read.reason}` };
      const { terms } = read;
      const offer: OfferSeen = { merchantName: terms.merchantName, about: SCENE_ABOUT, summary: terms.summary, ...terms.nextOccurrence, perAgentCapCovers: terms.offer.perAgentCapCovers };
      let reply: BuyerDecision | null;
      if (o.models.mode === "record") {
        if (o.models.spentNanoUsd() >= o.models.capNanoUsd) return { agentId: buyer.agentId, covers: 0, reason: null, outcome: "stopped_for_cap" };
        const decided = await o.models.decide(buyer, offer);
        records.push({ agentId: buyer.agentId, intent: buyer.intent, ...decided });
        reply = decided.reply;
      } else {
        reply = recorded!.get(buyer.agentId)?.reply ?? null;
      }
      if (reply === null) return { agentId: buyer.agentId, covers: 0, reason: null, outcome: "no_reply" };
      if (reply.covers === 0) return { agentId: buyer.agentId, covers: 0, reason: reply.reason, outcome: "declined" };
      const submitted = ToolReplies.submit_commitment.parse(
        await client.call("submit_commitment", {
        ruleId,
        termsVersion: terms.offer.termsVersion,
        visitDate: terms.nextOccurrence.visitDate,
        covers: reply.covers,
        maxPricePerCoverCents: terms.offer.offerPriceCents,
          idempotencyKey: `scene-${ruleId}-${buyer.agentId}`,
        }),
      );
      if (!submitted.ok) return { agentId: buyer.agentId, covers: reply.covers, reason: reply.reason, outcome: `refused_${submitted.reason}` };
      committed.set(buyer.agentId, submitted.commitment.commitmentId);
      out(`${buyer.agentId} committed ${reply.covers}`);
      return { agentId: buyer.agentId, covers: reply.covers, reason: reply.reason, outcome: "pending" };
    } finally {
      await client.close();
    }
  });

  const snapshotBefore = await demoSnapshot(o.db, o.now());
  const commitBy = snapshotBefore.scene?.commitBy ?? new Date(o.now()).toISOString();
  const wait = new Date(commitBy).getTime() + o.settleMs - o.now().getTime();
  if (wait > 0) {
    out(`waiting ${Math.ceil(wait / 1000)} s for the deadline`);
    await o.sleep(wait);
  }

  // Each committed buyer asks for its status, which clears the occurrence on the server.
  await mapLimit(outcomes, o.concurrency, async (b) => {
    const id = committed.get(b.agentId);
    if (!id) return;
    const client = await o.connect(b.agentId);
    try {
      const status = ToolReplies.get_commitment_status.parse(await client.call("get_commitment_status", { commitmentId: id }));
      b.outcome = status.ok ? status.commitment.status : `refused_${status.reason}`;
    } finally {
      await client.close();
    }
  });

  let wonder: Recording["wonder"] = null;
  const propose: ProposePlan =
    o.models.mode === "record"
      ? async (memory) => {
          if (o.models.mode !== "record" || o.models.spentNanoUsd() >= o.models.capNanoUsd) return null;
          const reply = await o.models.propose(memory);
          wonder = { prompt: planPrompt(memory), reply };
          return reply;
        }
      : async () => (o.models.mode === "replay" ? (o.models.recording.wonder?.reply ?? null) : null);
  const replan = await replanSoldOut(o.db, merchant, propose, o.models.mode === "record" ? o.models.wonder : `replay:${o.models.recording.wonderModel}`, o.now);
  out(`re-plan: ${replan.status}${replan.status === "planned" ? ` ${replan.planned}` : ""}`);

  const recording: Recording | null =
    o.models.mode === "record"
      ? Recording.parse({
          version: 1,
          recordedAt: o.now().toISOString(),
          sparkModel: o.models.spark,
          wonderModel: o.models.wonder,
          buyers: [...records].sort((a, b) => (a.agentId < b.agentId ? -1 : 1)),
          wonder,
          costNanoUsd: o.models.spentNanoUsd(),
        })
      : null;
  return { ruleId, visitDate, commitBy, buyers: outcomes, replan: replan.status, recording, snapshot: await demoSnapshot(o.db, o.now()) };
}
