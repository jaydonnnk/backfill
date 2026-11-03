import { and, asc, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { nextOccurrence, singaporeInstant } from "@/domain/commitments/occurrence";
import { soloVsPooled } from "@/domain/demo/scene";
import { offerPriceCents, toOffer } from "@/domain/offers/evaluate";
import { MINUTES_PER_DAY, singaporeLocal } from "@/domain/singapore-time";
import { available, clockTime, deadlineOf, termsSummary, toCommitment, toRule } from "@/lib/commitments/service";
import { publicDemoLedger, type DemoLedger } from "./ledger";
import type { Db, Executor } from "@/lib/db/client";
import { TrailRecord, approvalStatus, type FinalTerms, type PublicTrail } from "./trail";
import { demoTrails, agents, clearingFills, clearings, commitments, merchants, planApplications, rules, wonderPlans } from "@/lib/db/schema";

// What the public demo screen shows: the scene merchant's current occurrence, each buyer alone
// against the pool, the stored clearing once there is one, Wonder's plan for a sellout, and the
// real Muse user's commitment from its own pool. Read only, so watching never clears anything.
// It never carries the hidden floor, and capacity only as a sellout and a plan's next capacity.

export const DEMO_MERCHANT_NAME = "Backfill Demo Cafe";
// The agent the user minted for their own Muse account's custom connector (S4, Day 0).
export const MUSE_AGENT_ID = "muse-user";

export type DemoBuyer = {
  agentId: string;
  label: string;
  covers: number;
  committedAt: string;
  // Whether this commitment alone would unlock the rule.
  soloUnlocks: boolean;
  outcome: "pending" | "filled" | "not_filled";
};

export type DemoPlan = { provenance: "recorded_replay" | "model" | "fixture" | "unavailable"; verdict: string; discountBps: number | null; capacityCovers: number | null; minPoolCovers: number | null; perAgentCapCovers: number | null; rationale: string | null; applied: boolean };

export type DemoScene = {
  id: string;
  events: { kind: "commitment" | "cleared" | "sold_out" | "plan"; at: string; label: string }[];
  merchantName: string;
  summary: string;
  listPriceCents: number;
  offerPriceCents: number;
  discountBps: number;
  minPoolCovers: number;
  visitDate: string;
  visitWindow?: string;
  commitBy: string;
  phase: "open" | "cleared";
  buyers: DemoBuyer[];
  trail?: PublicTrail[];
  pooled: { covers: number; unlocked: boolean; filledCovers: number; soldOut: boolean };
  plan: DemoPlan | null;
};

export type DemoMuse = {
  commitmentId: string;
  merchantName: string;
  visitDate: string;
  covers: number;
  status: "pending" | "cancelled" | "filled" | "not_filled";
  pooledCovers: number;
  minPoolCovers: number;
};

export type DemoSnapshot = { scene: DemoScene | null; muse: DemoMuse | null; ledger: DemoLedger | null };

async function liveCommitments(db: Executor, ruleId: string, visitDate: string) {
  return db
    .select({ c: commitments, label: agents.label })
    .from(commitments)
    .innerJoin(agents, eq(agents.id, commitments.agentId))
    .where(
      and(
        eq(commitments.ruleId, ruleId),
        gte(commitments.visitAt, singaporeInstant(visitDate, 0)),
        lt(commitments.visitAt, singaporeInstant(visitDate, MINUTES_PER_DAY)),
        isNull(commitments.cancelledAt),
      ),
    )
    .orderBy(asc(commitments.committedAt), asc(commitments.id));
}

async function storedClearing(db: Executor, ruleId: string, visitDate: string) {
  const [stored] = await db.select().from(clearings).where(and(eq(clearings.ruleId, ruleId), eq(clearings.visitDate, visitDate)));
  if (!stored) return null;
  const fills = await db.select().from(clearingFills).where(and(eq(clearingFills.ruleId, ruleId), eq(clearingFills.visitDate, visitDate)));
  return { clearedAt: stored.clearedAt, unlocked: stored.unlocked, fills: new Map(fills.map((f) => [f.commitmentId, f.covers])) };
}

async function sceneOf(db: Executor, now: Date): Promise<DemoScene | null> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.name, DEMO_MERCHANT_NAME)).orderBy(asc(merchants.id)).limit(1);
  if (!merchant) return null;
  const rule = (await db.select().from(rules).where(eq(rules.merchantId, merchant.id)).orderBy(asc(rules.id))).map(toRule).find(available);
  if (!rule) return null;
  const [latest] = await db.select({ visitAt: commitments.visitAt }).from(commitments).where(eq(commitments.ruleId, rule.id)).orderBy(desc(commitments.visitAt)).limit(1);
  const visitDate = latest ? singaporeLocal(latest.visitAt).date : nextOccurrence(rule.terms.window, now).visitDate;
  const rows = await liveCommitments(db, rule.id, visitDate);
  const { solo, pooled } = soloVsPooled(rule, visitDate, rows.map((r) => toCommitment(r.c)));
  const soloById = new Map(solo.map((s) => [s.commitmentId, s.unlocked]));
  const cleared = await storedClearing(db, rule.id, visitDate);
  const [plan] = await db
    .select({ p: wonderPlans, appliedAt: planApplications.appliedAt })
    .from(wonderPlans)
    .leftJoin(planApplications, eq(planApplications.planId, wonderPlans.id))
    .where(and(eq(wonderPlans.ruleId, rule.id), eq(wonderPlans.visitDate, visitDate)));
  const evidence = await db.select().from(demoTrails).where(and(eq(demoTrails.ruleId, rule.id), eq(demoTrails.visitDate, visitDate))).orderBy(asc(demoTrails.createdAt), asc(demoTrails.id));
  const finalOf = (c: typeof commitments.$inferSelect): FinalTerms => ({ partyId: c.agentId, ruleId: c.ruleId, termsVersion: c.termsVersion, visitDate: singaporeLocal(c.visitAt).date, covers: c.covers, pricePerCoverCents: c.acceptedPricePerCoverCents, totalCents: c.acceptedPricePerCoverCents === null ? null : c.covers * c.acceptedPricePerCoverCents });
  const resultOf = (id: string) => !cleared ? "pending" as const : cleared.fills.has(id) ? "filled" as const : "not_filled" as const;
  const trail: PublicTrail[] = [];
  const linked = new Set<string>();
  for (const e of evidence) {
    const parsed = TrailRecord.safeParse(e.record);
    const c = rows.find(r => r.c.id === e.commitmentId)?.c;
    // A disconnected or malformed record cannot provide request/output/approval for this party.
    if (!parsed.success || parsed.data.terms.ruleId !== e.ruleId || parsed.data.terms.partyId !== e.partyId || parsed.data.terms.visitDate !== e.visitDate || (e.commitmentId !== null && (!c || c.agentId !== e.partyId))) continue;
    const record = parsed.data;
    const final = c ? finalOf(c) : null;
    if (c) linked.add(c.id);
    trail.push({ id: e.id, terms: record.terms, request: record.request, output: record.output, provenance: record.provenance, approval: approvalStatus(record, final, c?.committedAt.toISOString() ?? null), commitmentId: c?.id ?? null, final, result: c ? resultOf(c.id) : "proposal_only" });
  }
  for (const { c } of rows) if (!linked.has(c.id)) trail.push({ id: c.id, terms: null, request: null, output: null, provenance: "unavailable", approval: "unavailable", commitmentId: c.id, final: finalOf(c), result: resultOf(c.id) });
  const covers = rows.reduce((sum, r) => sum + r.c.covers, 0);
  const filledCovers = cleared ? [...cleared.fills.values()].reduce((a, b) => a + b, 0) : 0;
  const offer = toOffer(rule);
  return {
    id: `${rule.id}:${visitDate}`,
    events: [
      ...rows.map(r => ({ kind: "commitment" as const, at: r.c.committedAt.toISOString(), label: `+${r.c.covers} covers committed` })),
      ...(cleared ? [{ kind: "cleared" as const, at: cleared.clearedAt.toISOString(), label: cleared.unlocked ? `Pool unlocked: ${filledCovers} covers filled` : "Cleared: minimum not met" }] : []),
      ...(cleared?.unlocked && filledCovers >= rule.capacityCovers ? [{ kind: "sold_out" as const, at: cleared.clearedAt.toISOString(), label: "Sold out" }] : []),
      ...(plan ? [{ kind: "plan" as const, at: plan.p.createdAt.toISOString(), label: plan.p.verdict === "ok" ? "Wonder plan ready" : "Wonder plan refused" }] : []),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    merchantName: merchant.name,
    summary: termsSummary(merchant.name, offer),
    listPriceCents: rule.listPriceCents,
    offerPriceCents: offerPriceCents(rule),
    discountBps: rule.terms.discountBps,
    minPoolCovers: rule.terms.minPoolCovers,
    visitDate,
    visitWindow: `${clockTime(rule.terms.window.startMinute)}–${clockTime(rule.terms.window.endMinute)}`,
    commitBy: deadlineOf(rule, visitDate).toISOString(),
    phase: cleared ? "cleared" : "open",
    trail,
    buyers: rows.map((r) => ({
      agentId: r.c.agentId,
      label: r.label,
      covers: r.c.covers,
      committedAt: r.c.committedAt.toISOString(),
      soloUnlocks: soloById.get(r.c.id) ?? false,
      outcome: !cleared ? "pending" : cleared.fills.has(r.c.id) ? "filled" : "not_filled",
    })),
    // Before the clearing, unlocked is what the engine would decide now; filled covers and the
    // sellout come only from the stored clearing, so capacity never shows while the pool is open.
    pooled: { covers, unlocked: cleared ? cleared.unlocked : pooled.unlocked, filledCovers, soldOut: cleared !== null && cleared.unlocked && filledCovers >= rule.capacityCovers },
    plan: plan
      ? {
          provenance: plan.p.model.startsWith("replay:") ? "recorded_replay" : plan.p.model.startsWith("fixture:") ? "fixture" : "unavailable",
          verdict: plan.p.verdict,
          discountBps: plan.p.discountBps,
          capacityCovers: plan.p.capacityCovers,
          minPoolCovers: plan.p.minPoolCovers,
          perAgentCapCovers: plan.p.perAgentCapCovers,
          rationale: null,
          applied: plan.appliedAt !== null,
        }
      : null,
  };
}

async function museOf(db: Executor): Promise<DemoMuse | null> {
  const [row] = await db
    .select({ c: commitments, merchantName: merchants.name, rule: rules })
    .from(commitments)
    .innerJoin(rules, eq(rules.id, commitments.ruleId))
    .innerJoin(merchants, eq(merchants.id, rules.merchantId))
    .where(eq(commitments.agentId, MUSE_AGENT_ID))
    .orderBy(desc(commitments.committedAt))
    .limit(1);
  if (!row) return null;
  const rule = toRule(row.rule);
  const visitDate = singaporeLocal(row.c.visitAt).date;
  const pool = await liveCommitments(db, rule.id, visitDate);
  const cleared = await storedClearing(db, rule.id, visitDate);
  const status = row.c.cancelledAt ? "cancelled" : !cleared ? "pending" : cleared.fills.has(row.c.id) ? "filled" : "not_filled";
  return {
    commitmentId: row.c.id,
    merchantName: row.merchantName,
    visitDate,
    covers: row.c.covers,
    status,
    pooledCovers: pool.reduce((sum, r) => sum + r.c.covers, 0),
    minPoolCovers: rule.terms.minPoolCovers,
  };
}

export async function demoSnapshot(db: Db, now: Date = new Date()): Promise<DemoSnapshot> {
  return db.transaction(async tx => ({ scene: await sceneOf(tx, now), muse: await museOf(tx), ledger: await publicDemoLedger(tx, DEMO_MERCHANT_NAME) }), { isolationLevel: "repeatable read", accessMode: "read only" });
}
