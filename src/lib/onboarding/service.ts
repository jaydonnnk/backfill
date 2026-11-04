import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { judgeDraft, judgePhoto, MenuDraft, ruleFromDraft, type RuleSettings } from "@/domain/onboarding/menu";
import { judgePlan, type WonderPlan } from "@/domain/onboarding/replan";
import { offerPriceCents } from "@/domain/offers/evaluate";
import type { MerchantRule } from "@/domain/offers/schema";
import { clockTime, constraintOf, settleDue, toRule, WEEKDAY_NAMES } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { clearingFills, clearings, menuDrafts, offerPublications, planApplications, rules, wonderPlans } from "@/lib/db/schema";
import { recentAttempts } from "@/lib/llm-calls";
import { takeLimits } from "@/lib/rate-limit";
import { type PlanMemory, type ProposePlan, type ReadMenu, WONDER_PLAN_PURPOSE } from "./models";

// Everything a merchant does through its secret link, against the database. The runtime role
// records drafts and plans, and publishes or applies only through publish_offer and
// apply_wonder_plan, which check again what is checked here.

export type Clock = () => Date;

const DAY_MS = 24 * 60 * 60 * 1000;
// Arbitrary constant naming the advisory lock: one planning pass at a time, so simultaneous requests
// cannot all pass the same daily-cap read.
const PLAN_LOCK_KEY = 4_151_007;
// Menu reads per day, across all merchants and per client, so nobody can run up spend or use up the day.
export const MENU_DAILY_CAP = 100;
export const MENU_CLIENT_DAILY_CAP = 10;
// Model attempts per rolling day, across all merchants, so a leaked link cannot run up spend.
export const PLAN_DAILY_CAP = 30;
// Sold-out occurrences planned per pass, oldest first.
const PLANS_PER_PASS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReadMenuResult =
  | { status: "ok" | "refused"; draftId: string }
  | { status: "empty" | "too_large" | "not_an_image" | "daily_cap" | "failed" };

// Reads one menu photo with Muse Spark and stores the draft, counted or not. The photo is hashed
// and dropped; it is never stored or logged.
export async function readMenu(db: Db, merchantId: string, bytes: Uint8Array, read: ReadMenu, model: string, clock: Clock = () => new Date(), client: string | null = null): Promise<ReadMenuResult> {
  void clock; // Retained for existing callers; rate-limit windows use the database clock.
  const photo = judgePhoto(bytes);
  if (!photo.ok) return { status: photo.reason };
  if (!(await takeLimits(db, "menu", client, MENU_CLIENT_DAILY_CAP, MENU_DAILY_CAP, DAY_MS / 1000))) return { status: "daily_cap" };
  // The model is asked outside any transaction: a call can take seconds, and the pool is small.
  const draft = await read({ mediaType: photo.mediaType, base64: Buffer.from(bytes).toString("base64") });
  if (draft === null) return { status: "failed" };
  const verdict = judgeDraft(draft);
  const [row] = await db
    .insert(menuDrafts)
    .values({
      merchantId,
      photoSha256: createHash("sha256").update(bytes).digest("hex"),
      photoBytes: bytes.length,
      photoType: photo.mediaType,
      model,
      draft,
      verdict: verdict.ok ? "ok" : verdict.reason,
      listPriceCents: verdict.ok ? verdict.listPriceCents : null,
    })
    .returning({ id: menuDrafts.id });
  if (!row) throw new Error("menu draft insert returned no row");
  return { status: verdict.ok ? "ok" : "refused", draftId: row.id };
}

export type DraftView = { id: string; draft: MenuDraft; verdict: string; listPriceCents: number | null; createdAt: Date; ruleId: string | null };

// One of the merchant's own drafts, with the rule it published if any; null for anyone else's.
export async function getDraft(db: Db, merchantId: string, draftId: string): Promise<DraftView | null> {
  if (!UUID.test(draftId)) return null;
  const [row] = await db
    .select({ d: menuDrafts, ruleId: offerPublications.ruleId })
    .from(menuDrafts)
    .leftJoin(offerPublications, eq(offerPublications.draftId, menuDrafts.id))
    .where(and(eq(menuDrafts.id, draftId), eq(menuDrafts.merchantId, merchantId)));
  if (!row) return null;
  return { id: row.d.id, draft: MenuDraft.parse(row.d.draft), verdict: row.d.verdict, listPriceCents: row.d.listPriceCents, createdAt: row.d.createdAt, ruleId: row.ruleId };
}

export type PublishResult =
  | { status: "published"; ruleId: string }
  | { status: "not_found" | "already_published" | "floor_above_offer_price" }
  | { status: "invalid_terms"; problems: string[] };

// Publishes a counted draft as a rule with the merchant's terms. The list price is the draft's.
export async function publishDraft(db: Db, merchantId: string, draftId: string, settings: RuleSettings): Promise<PublishResult> {
  const draft = await getDraft(db, merchantId, draftId);
  if (!draft || draft.verdict !== "ok" || draft.listPriceCents === null) return { status: "not_found" };
  if (draft.ruleId !== null) return { status: "already_published" };
  const verdict = ruleFromDraft(draft.listPriceCents, settings, { ruleId: randomUUID(), merchantId });
  if (!verdict.ok) return verdict.reason === "invalid_terms" ? { status: "invalid_terms", problems: verdict.problems ?? [] } : { status: verdict.reason };
  const { rule } = verdict;
  const w = rule.terms.window;
  try {
    await db.execute(
      sql`select publish_offer(${merchantId}::uuid, ${draftId}::uuid, ${rule.id}::uuid, ${rule.capacityCovers}::integer, ${w.weekday}::smallint, ${w.startMinute}::smallint, ${w.endMinute}::smallint, ${w.commitByMinute}::smallint, ${rule.terms.discountBps}::integer, ${rule.terms.minPoolCovers}::integer, ${rule.terms.perAgentCapCovers}::integer, ${rule.terms.floorPriceCents}::integer)`,
    );
  } catch (err) {
    const constraint = constraintOf(err);
    if (constraint === "offer_publications_pkey" || constraint === "offer_publications_rule_once") return { status: "already_published" };
    if (constraint === "publish_offer_floor") return { status: "floor_above_offer_price" };
    throw err;
  }
  return { status: "published", ruleId: rule.id };
}

export const windowText = (rule: MerchantRule) => {
  const w = rule.terms.window;
  return `${WEEKDAY_NAMES[w.weekday - 1]} ${clockTime(w.startMinute)}-${clockTime(w.endMinute)}, commit by ${clockTime(w.commitByMinute)} Singapore time`;
};

export type OccurrenceRow = { ruleId: string; visitDate: string; unlocked: boolean; covers: number };
export type PlanRow = typeof wonderPlans.$inferSelect & { applied: boolean };

export type Dashboard = {
  rules: { rule: MerchantRule; offerPriceCents: number; published: boolean }[];
  drafts: { id: string; verdict: string; listPriceCents: number | null; createdAt: Date; ruleId: string | null }[];
  occurrences: (OccurrenceRow & { soldOut: boolean })[];
  plans: PlanRow[];
};

async function occurrencesOf(db: Db, ruleIds: string[]): Promise<OccurrenceRow[]> {
  if (ruleIds.length === 0) return [];
  const rows = await db
    .select({ ruleId: clearings.ruleId, visitDate: clearings.visitDate, unlocked: clearings.unlocked, covers: sql<number>`coalesce(sum(${clearingFills.covers}), 0)::integer` })
    .from(clearings)
    .leftJoin(clearingFills, and(eq(clearingFills.ruleId, clearings.ruleId), eq(clearingFills.visitDate, clearings.visitDate)))
    .where(inArray(clearings.ruleId, ruleIds))
    .groupBy(clearings.ruleId, clearings.visitDate, clearings.unlocked)
    .orderBy(asc(clearings.visitDate));
  return rows;
}

async function plansOf(db: Db, ruleIds: string[]): Promise<PlanRow[]> {
  if (ruleIds.length === 0) return [];
  const rows = await db
    .select({ p: wonderPlans, appliedAt: planApplications.appliedAt })
    .from(wonderPlans)
    .leftJoin(planApplications, eq(planApplications.planId, wonderPlans.id))
    .where(inArray(wonderPlans.ruleId, ruleIds))
    .orderBy(asc(wonderPlans.visitDate));
  return rows.map((r) => ({ ...r.p, applied: r.appliedAt !== null }));
}

// A sold-out occurrence filled every cover of the rule's capacity. Capacity only grows through a
// plan, and only a sellout is planned, so an occurrence with a plan sold out at its own capacity;
// one without a plan is judged against the current capacity.
const soldOut = (o: OccurrenceRow, rule: MerchantRule | undefined, planned: boolean) => o.unlocked && (planned || (rule !== undefined && o.covers >= rule.capacityCovers));

// Settles the merchant's due occurrences first, so a sellout shows without any buyer asking.
export async function dashboard(db: Db, merchantId: string, clock: Clock = () => new Date()): Promise<Dashboard> {
  await settleDue(db, merchantId, clock);
  const ruleRows = await db.select().from(rules).where(eq(rules.merchantId, merchantId)).orderBy(asc(rules.weekday), asc(rules.startMinute));
  const published = new Set((await db.select({ ruleId: offerPublications.ruleId }).from(offerPublications).where(eq(offerPublications.merchantId, merchantId))).map((r) => r.ruleId));
  const ruleList = ruleRows.map(toRule);
  const byId = new Map(ruleList.map((r) => [r.id, r]));
  const ids = ruleList.map((r) => r.id);
  const drafts = await db
    .select({ id: menuDrafts.id, verdict: menuDrafts.verdict, listPriceCents: menuDrafts.listPriceCents, createdAt: menuDrafts.createdAt, ruleId: offerPublications.ruleId })
    .from(menuDrafts)
    .leftJoin(offerPublications, eq(offerPublications.draftId, menuDrafts.id))
    .where(eq(menuDrafts.merchantId, merchantId))
    .orderBy(desc(menuDrafts.createdAt))
    .limit(5);
  const plans = await plansOf(db, ids);
  const planned = new Set(plans.map((p) => `${p.ruleId}/${p.visitDate}`));
  return {
    rules: ruleList.map((rule) => ({ rule, offerPriceCents: offerPriceCents(rule), published: published.has(rule.id) })),
    drafts,
    occurrences: (await occurrencesOf(db, ids)).map((o) => ({ ...o, soldOut: soldOut(o, byId.get(o.ruleId), planned.has(`${o.ruleId}/${o.visitDate}`)) })),
    plans,
  };
}

export type ReplanResult = { status: "planned"; planned: number } | { status: "busy" | "daily_cap" };

// Plans each sold-out occurrence of the merchant's rules that has no plan yet, with Muse Wonder as
// the merchant's agent. Its memory is the rule's fill history and its own past plans, read from
// Postgres for every call. A plan is stored with its verdict whether or not it counted, once per
// occurrence, so a reload never pays for the same sellout twice.
export async function replanSoldOut(db: Db, merchant: { id: string; name: string }, propose: ProposePlan, model: string, clock: Clock = () => new Date()): Promise<ReplanResult> {
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${PLAN_LOCK_KEY}) as locked`);
    if (!lock?.locked) return { status: "busy" };
    const board = await dashboard(db, merchant.id, clock);
    const planned = new Set(board.plans.map((p) => `${p.ruleId}/${p.visitDate}`));
    const todo = board.occurrences.filter((o) => o.soldOut && !planned.has(`${o.ruleId}/${o.visitDate}`)).slice(0, PLANS_PER_PASS);
    let count = 0;
    for (const occurrence of todo) {
      if ((await recentAttempts(tx, WONDER_PLAN_PURPOSE, new Date(clock().getTime() - DAY_MS))).count >= PLAN_DAILY_CAP) return { status: "daily_cap" };
      const rule = board.rules.find((r) => r.rule.id === occurrence.ruleId)?.rule;
      if (!rule) continue;
      const memory: PlanMemory = {
        merchantName: merchant.name,
        listPriceCents: rule.listPriceCents,
        capacityCovers: rule.capacityCovers,
        discountBps: rule.terms.discountBps,
        minPoolCovers: rule.terms.minPoolCovers,
        perAgentCapCovers: rule.terms.perAgentCapCovers,
        window: windowText(rule),
        soldOutDate: occurrence.visitDate,
        fills: board.occurrences.filter((o) => o.ruleId === rule.id).map(({ visitDate, unlocked, covers }) => ({ visitDate, unlocked, covers })),
        plans: board.plans
          .filter((p) => p.ruleId === rule.id)
          .map((p) => ({ visitDate: p.visitDate, verdict: p.verdict, applied: p.applied, discountBps: p.discountBps, capacityCovers: p.capacityCovers })),
      };
      const plan = await propose(memory);
      await tx
        .insert(wonderPlans)
        .values({ ruleId: rule.id, visitDate: occurrence.visitDate, termsVersion: rule.termsVersion, model, ...planColumns(rule, plan) })
        .onConflictDoNothing({ target: [wonderPlans.ruleId, wonderPlans.visitDate] });
      count += 1;
    }
    return { status: "planned", planned: count };
  });
}

function planColumns(rule: MerchantRule, plan: WonderPlan | null) {
  if (plan === null) return { verdict: "no_proposal" };
  const verdict = judgePlan(rule, plan);
  return {
    discountBps: plan.discountBps,
    capacityCovers: plan.capacityCovers,
    minPoolCovers: plan.minPoolCovers,
    perAgentCapCovers: plan.perAgentCapCovers,
    rationale: plan.rationale,
    verdict: verdict.ok ? "ok" : verdict.reason,
  };
}

export type ApplyResult = { status: "applied"; termsVersion: number } | { status: "not_found" | "refused" | "stale" | "pending" | "already_applied" };

const APPLY_REFUSALS: Record<string, Exclude<ApplyResult["status"], "applied">> = {
  apply_wonder_plan_owner: "not_found",
  apply_wonder_plan_verdict: "refused",
  apply_wonder_plan_bounds: "refused",
  apply_wonder_plan_stale: "stale",
  apply_wonder_plan_pending: "pending",
  plan_applications_pkey: "already_applied",
};

// The merchant applies a plan: the rule takes its terms, and the terms version moves on. Due
// occurrences are settled first, so only a commitment still before its deadline counts as pending.
export async function applyPlan(db: Db, merchantId: string, planId: string, clock: Clock = () => new Date()): Promise<ApplyResult> {
  if (!UUID.test(planId)) return { status: "not_found" };
  await settleDue(db, merchantId, clock);
  try {
    const [row] = await db.execute<{ version: number }>(sql`select apply_wonder_plan(${merchantId}::uuid, ${planId}::uuid) as version`);
    return { status: "applied", termsVersion: Number(row?.version) };
  } catch (err) {
    const refusal = APPLY_REFUSALS[constraintOf(err) ?? ""];
    if (refusal) return { status: refusal };
    throw err;
  }
}
