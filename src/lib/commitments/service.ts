import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { clear } from "@/domain/clearing/clear";
import { ledgerEntry } from "@/domain/ledger/calculate";
import { nextOccurrence, type Occurrence, occurrenceOn, singaporeInstant } from "@/domain/commitments/occurrence";
import type { Commitment } from "@/domain/commitments/schema";
import { verifyCounterOffer } from "@/domain/negotiation/counter-offer";
import { evaluateCommitment, evaluatePool, meetsFloor, offerPriceCents, toOffer } from "@/domain/offers/evaluate";
import { MerchantRule, type Offer } from "@/domain/offers/schema";
import { MINUTES_PER_DAY, singaporeLocal } from "@/domain/singapore-time";
import type { Executor } from "@/lib/db/client";
import { agents, clearingFills, clearings, commitments, ledger, merchants, negotiationRounds, rules } from "@/lib/db/schema";

// Everything a buyer agent can do through the MCP server, against the database. Nothing returned
// here carries the hidden floor, the capacity or a reason that compares the floor with the price:
// a rule whose offer price is below its floor is "offer_unavailable", exactly like a missing rule.

export type Clock = () => Date;

// Namespace of the per-agent advisory lock (two-key form, so it never meets the tracer's one-key
// lock). One agent's submissions are serialised, so two at once cannot both pass its cap.
const AGENT_LOCK_NAMESPACE = 4_151_004;

type RuleRow = typeof rules.$inferSelect;
type CommitmentRow = typeof commitments.$inferSelect;

export function toRule(row: RuleRow): MerchantRule {
  return MerchantRule.parse({
    id: row.id,
    merchantId: row.merchantId,
    termsVersion: row.termsVersion,
    listPriceCents: row.listPriceCents,
    capacityCovers: row.capacityCovers,
    terms: {
      window: { weekday: row.weekday, startMinute: row.startMinute, endMinute: row.endMinute, commitByMinute: row.commitByMinute },
      discountBps: row.discountBps,
      minPoolCovers: row.minPoolCovers,
      perAgentCapCovers: row.perAgentCapCovers,
      floorPriceCents: row.floorPriceCents,
    },
  });
}

export function toCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    ruleId: row.ruleId,
    agentId: row.agentId,
    termsVersion: row.termsVersion,
    covers: row.covers,
    maxPricePerCoverCents: row.maxPricePerCoverCents,
    visitAt: row.visitAt,
    committedAt: row.committedAt,
    ...(row.negotiatedPriceCents === null ? {} : { negotiatedPriceCents: row.negotiatedPriceCents }),
  };
}

// A rule a buyer may see and commit to: its offer price meets its floor. Any other rule could never
// clear, and saying why would reveal that the floor is above the price.
export function available(rule: MerchantRule): boolean {
  return meetsFloor(rule.terms, offerPriceCents(rule));
}

export type OccurrenceView = { visitDate: string; commitBy: string; startsAt: string; endsAt: string };

function occurrenceView(o: Occurrence): OccurrenceView {
  return { visitDate: o.visitDate, commitBy: o.commitBy.toISOString(), startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() };
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const clockTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const dollars = (cents: number) => `S$${(cents / 100).toFixed(2)}`;

// The terms in one plain sentence, built from the public Offer only.
export function termsSummary(merchantName: string, offer: Pick<Offer, "window" | "discountBps" | "listPriceCents" | "offerPriceCents" | "minPoolCovers" | "perAgentCapCovers">): string {
  const w = offer.window;
  return (
    `${merchantName}: ${offer.discountBps / 100}% off, ${dollars(offer.listPriceCents)} becomes ${dollars(offer.offerPriceCents)} per cover, ` +
    `${WEEKDAY_NAMES[w.weekday - 1]} ${clockTime(w.startMinute)}-${clockTime(w.endMinute)} Singapore time. ` +
    `It unlocks only if at least ${offer.minPoolCovers} covers are committed before ${clockTime(w.commitByMinute)} that day; ` +
    `one agent may hold at most ${offer.perAgentCapCovers} covers.`
  );
}

export type OfferView = { merchantName: string; offer: Offer; summary: string; nextOccurrence: OccurrenceView };

function offerView(merchantName: string, rule: MerchantRule, now: Date): OfferView {
  const offer = toOffer(rule);
  return { merchantName, offer, summary: termsSummary(merchantName, offer), nextOccurrence: occurrenceView(nextOccurrence(rule.terms.window, now)) };
}

export type AgentScope = "standard" | "sandbox";
const visibleTo = (scope: AgentScope) => (scope === "sandbox" ? "sandbox" : "listed");

export async function agentScope(db: Executor, agentId: string): Promise<AgentScope> {
  const [row] = await db.select({ scope: agents.scope }).from(agents).where(eq(agents.id, agentId));
  return row?.scope ?? "standard";
}

export async function listOffers(db: Executor, clock: Clock = () => new Date(), scope: AgentScope = "standard"): Promise<OfferView[]> {
  const now = clock();
  const rows = await db.select({ rule: rules, merchantName: merchants.name }).from(rules).innerJoin(merchants, and(eq(rules.merchantId, merchants.id), eq(merchants.visibility, visibleTo(scope)))).orderBy(asc(merchants.name), asc(rules.id));
  return rows.map((r) => ({ name: r.merchantName, rule: toRule(r.rule) })).filter((r) => available(r.rule)).map((r) => offerView(r.name, r.rule, now));
}

export async function getAgentTerms(db: Executor, ruleId: string, clock: Clock = () => new Date(), scope: AgentScope = "standard"): Promise<OfferView | null> {
  const [row] = await db.select({ rule: rules, merchantName: merchants.name }).from(rules).innerJoin(merchants, and(eq(rules.merchantId, merchants.id), eq(merchants.visibility, visibleTo(scope)))).where(eq(rules.id, ruleId));
  if (!row) return null;
  const rule = toRule(row.rule);
  return available(rule) ? offerView(row.merchantName, rule, clock()) : null;
}

export type SubmitInput = {
  ruleId: string;
  termsVersion: number;
  visitDate: string;
  covers: number;
  maxPricePerCoverCents: number;
  idempotencyKey: string;
  // A signed counter-offer from negotiate_offer (S5); the commitment then takes its price per cover.
  counterOffer?: string;
};

export type SubmitRefusal =
  | "offer_unavailable"
  | "stale_terms"
  | "not_on_offer_weekday"
  | "past_deadline"
  | "over_agent_cap"
  | "max_price_below_offer_price"
  | "idempotency_key_reused"
  | "occurrence_cleared"
  | "counter_offer_invalid"
  | "counter_offer_used"
  | "max_price_below_counter_price";

export type CommitmentStatus = "pending" | "cancelled" | "filled" | "not_filled";

export type CommitmentView = {
  commitmentId: string;
  ruleId: string;
  termsVersion: number;
  visitDate: string;
  covers: number;
  maxPricePerCoverCents: number;
  // The price per cover a counter-offer agreed, when the commitment took one.
  negotiatedPriceCents?: number;
  committedAt: string;
  commitBy: string;
  status: CommitmentStatus;
  // Pending only: the covers pooled so far for this occurrence, and the public minimum.
  pooledCovers?: number;
  minPoolCovers?: number;
  // Filled only: the price each cover clears at.
  pricePerCoverCents?: number;
};

export type SubmitResult = { ok: true; replayed: boolean; commitment: CommitmentView } | { ok: false; reason: SubmitRefusal };

// The single row a query must return, such as a commitment's rule, which a foreign key guarantees.
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("expected one row");
  return row;
}

// The constraint a Postgres error names, whether drizzle wrapped it or not.
export function constraintOf(err: unknown): string | undefined {
  for (const candidate of [err, (err as { cause?: unknown } | undefined)?.cause]) {
    const name = (candidate as { constraint_name?: unknown } | undefined)?.constraint_name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

class Refused extends Error {
  constructor(readonly reason: SubmitRefusal) {
    super(reason);
  }
}

export function deadlineOf(rule: MerchantRule, visitDate: string): Date {
  return singaporeInstant(visitDate, rule.terms.window.commitByMinute);
}

// One occurrence's live commitments, in no particular order (clearing sorts them itself).
async function occurrenceCommitments(db: Executor, ruleId: string, visitDate: string): Promise<Commitment[]> {
  const rows = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.ruleId, ruleId),
        gte(commitments.visitAt, singaporeInstant(visitDate, 0)),
        lt(commitments.visitAt, singaporeInstant(visitDate, MINUTES_PER_DAY)),
        isNull(commitments.cancelledAt),
      ),
    );
  return rows.map(toCommitment);
}

// A binding commitment at the offer's current terms. Every check that can fail is made here, at
// once, so the buyer learns at submit time rather than at clearing: a max price below the offer
// price is refused even though clearing would only drop it. The same idempotency key from the same
// agent returns the commitment it made the first time, or is refused if the arguments differ.
// With a counter-offer, the commitment takes its price instead of the offer price. The token must be
// signed with the negotiation secret, name this agent and these arguments, and be its negotiation's
// latest round, at or above the current floor; every other token is counter_offer_invalid, so the
// reply never says whether the floor moved.
export async function submitCommitment(
  db: Executor,
  agentId: string,
  input: SubmitInput,
  clock: Clock = () => new Date(),
  negotiationSecret?: string,
): Promise<SubmitResult> {
  let counter = null;
  if (input.counterOffer !== undefined) {
    if (!negotiationSecret) throw new Error("no negotiation signing secret");
    counter = verifyCounterOffer(negotiationSecret, input.counterOffer);
    const matches =
      counter !== null &&
      counter.agentId === agentId &&
      counter.ruleId === input.ruleId &&
      counter.termsVersion === input.termsVersion &&
      counter.visitDate === input.visitDate &&
      counter.covers === input.covers;
    if (!matches) return { ok: false, reason: "counter_offer_invalid" };
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${AGENT_LOCK_NAMESPACE}, hashtext(${agentId}))`);
      const [existing] = await tx
        .select()
        .from(commitments)
        .where(and(eq(commitments.agentId, agentId), eq(commitments.idempotencyKey, input.idempotencyKey)));
      if (existing) {
        const same =
          existing.ruleId === input.ruleId &&
          existing.termsVersion === input.termsVersion &&
          singaporeLocal(existing.visitAt).date === input.visitDate &&
          existing.covers === input.covers &&
          existing.maxPricePerCoverCents === input.maxPricePerCoverCents &&
          existing.negotiationId === (counter?.negotiationId ?? null);
        if (!same) throw new Refused("idempotency_key_reused");
        return { ok: true as const, replayed: true, commitment: await viewOf(tx, existing) };
      }

      // Hold availability through insertion so a scene cannot retire an accepted offer.
      await tx.execute(sql`select lock_rule_for_clearing(${input.ruleId})`);
      const [joined] = await tx.select({ rule: rules }).from(rules).innerJoin(merchants, and(eq(rules.merchantId, merchants.id), eq(merchants.visibility, visibleTo(await agentScope(tx, agentId))))).where(eq(rules.id, input.ruleId));
      const rule = joined && toRule(joined.rule);
      if (!rule || !available(rule)) throw new Refused("offer_unavailable");
      const occurrence = occurrenceOn(rule.terms.window, input.visitDate);
      if (!occurrence) throw new Refused("not_on_offer_weekday");

      const now = clock();
      const price = offerPriceCents(rule);
      // What the agent already holds that could clear, each commitment at its own price.
      const held = (await occurrenceCommitments(tx, rule.id, input.visitDate))
        .filter((c) => c.agentId === agentId && c.termsVersion === rule.termsVersion && c.maxPricePerCoverCents >= (c.negotiatedPriceCents ?? price))
        .reduce((sum, c) => sum + c.covers, 0);
      const candidate: Commitment = {
        id: randomUUID(),
        ruleId: rule.id,
        agentId,
        termsVersion: input.termsVersion,
        covers: input.covers,
        maxPricePerCoverCents: input.maxPricePerCoverCents,
        visitAt: occurrence.startsAt,
        committedAt: now,
      };
      const verdict = evaluateCommitment(rule, candidate, held);
      if (!verdict.ok) {
        // The rule is available, so its offer price meets the floor; reaching below_floor is a bug,
        // and it is never named to a buyer.
        if (verdict.reason === "below_floor") throw new Error("available rule refused below its floor");
        throw new Refused(verdict.reason === "outside_window" ? "not_on_offer_weekday" : verdict.reason);
      }
      if (counter) {
        const [latest] = await tx
          .select()
          .from(negotiationRounds)
          .where(eq(negotiationRounds.negotiationId, counter.negotiationId))
          .orderBy(desc(negotiationRounds.round))
          .limit(1);
        if (!latest || latest.round !== counter.round || latest.counterCents !== counter.priceCents || !meetsFloor(rule.terms, counter.priceCents)) {
          throw new Refused("counter_offer_invalid");
        }
        if (input.maxPricePerCoverCents < counter.priceCents) throw new Refused("max_price_below_counter_price");
      } else if (input.maxPricePerCoverCents < price) throw new Refused("max_price_below_offer_price");

      const negotiated = counter ? { negotiationId: counter.negotiationId, negotiatedPriceCents: counter.priceCents } : {};
      const row = one(await tx.insert(commitments).values({ ...candidate, ...negotiated, idempotencyKey: input.idempotencyKey }).returning());
      return { ok: true as const, replayed: false, commitment: await viewOf(tx, row) };
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    const constraint = constraintOf(err);
    if (constraint === "commitments_scope") return { ok: false, reason: "offer_unavailable" };
    if (constraint === "commitments_terms_current") return { ok: false, reason: "stale_terms" };
    if (constraint === "commitments_occurrence_cleared") return { ok: false, reason: "occurrence_cleared" };
    if (constraint === "commitments_negotiation_once") return { ok: false, reason: "counter_offer_used" };
    if (constraint === "commitments_negotiated_match") return { ok: false, reason: "counter_offer_invalid" };
    throw err;
  }
}

// Each filled commitment's covers and its own price per cover.
type StoredClearing = { unlocked: boolean; filled: Map<string, { covers: number; pricePerCoverCents: number }> };

// The stored outcome of one occurrence, written by the first call after its deadline. The rule is
// held FOR UPDATE, through lock_rule_for_clearing since the runtime role cannot update rules. That
// waits for any commitment insert holding the rule FOR SHARE, so every commitment made before the
// clearing is in it, and any insert after it is refused by its trigger.
async function ensureClearing(db: Executor, ruleId: string, visitDate: string): Promise<StoredClearing> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select lock_rule_for_clearing(${ruleId})`);
    const ruleRow = one(await tx.select().from(rules).where(eq(rules.id, ruleId)));
    const read = async (): Promise<StoredClearing | null> => {
      const [stored] = await tx.select().from(clearings).where(and(eq(clearings.ruleId, ruleId), eq(clearings.visitDate, visitDate)));
      if (!stored) return null;
      const fills = await tx.select().from(clearingFills).where(and(eq(clearingFills.ruleId, ruleId), eq(clearingFills.visitDate, visitDate)));
      return { unlocked: stored.unlocked, filled: new Map(fills.map((f) => [f.commitmentId, { covers: f.covers, pricePerCoverCents: f.pricePerCoverCents }])) };
    };
    const stored = await read();
    if (stored) return stored;
    const result = clear(toRule(ruleRow), visitDate, await occurrenceCommitments(tx, ruleId, visitDate));
    await tx.insert(clearings).values({ ruleId, visitDate, termsVersion: result.termsVersion, unlocked: result.unlocked, pricePerCoverCents: result.pricePerCoverCents });
    if (result.fills.length > 0) await tx.insert(clearingFills).values(result.fills.map((f) => ({ commitmentId: f.commitmentId, ruleId, visitDate, covers: f.covers, pricePerCoverCents: f.pricePerCoverCents })));
    if (result.fills.length > 0) await tx.insert(ledger).values(result.fills.map((fill) => ledgerEntry({
      commitmentId: fill.commitmentId, merchantId: ruleRow.merchantId, ruleId,
      covers: fill.covers, listPriceCents: ruleRow.listPriceCents, pricePerCoverCents: fill.pricePerCoverCents,
    })));
    return (await read())!;
  });
}

// Clears every occurrence of the merchant's rules that has a live commitment, no clearing yet and a
// deadline already passed. Otherwise an occurrence is cleared only when a buyer asks for its status,
// and one no buyer asks about would stay pending for ever, hiding its sellout and blocking every
// terms change on its rule.
export async function settleDue(db: Executor, merchantId: string, clock: Clock = () => new Date()): Promise<void> {
  const due = await db.execute<{ rule_id: string; visit_date: string }>(sql`
    select distinct c.rule_id, (c.visit_at at time zone 'Asia/Singapore')::date::text as visit_date
    from commitments c join rules r on r.id = c.rule_id
    where r.merchant_id = ${merchantId} and c.cancelled_at is null
      and not exists (select 1 from clearings k where k.rule_id = c.rule_id and k.visit_date = (c.visit_at at time zone 'Asia/Singapore')::date)`);
  const now = clock();
  for (const { rule_id: ruleId, visit_date: visitDate } of due) {
    const rule = toRule(one(await db.select().from(rules).where(eq(rules.id, ruleId))));
    if (now >= deadlineOf(rule, visitDate)) await ensureClearing(db, ruleId, visitDate);
  }
}

async function viewOf(db: Executor, row: CommitmentRow): Promise<CommitmentView> {
  const rule = toRule(one(await db.select().from(rules).where(eq(rules.id, row.ruleId))));
  const visitDate = singaporeLocal(row.visitAt).date;
  const commitBy = deadlineOf(rule, visitDate);
  const base = {
    commitmentId: row.id,
    ruleId: row.ruleId,
    termsVersion: row.termsVersion,
    visitDate,
    covers: row.covers,
    maxPricePerCoverCents: row.maxPricePerCoverCents,
    ...(row.negotiatedPriceCents === null ? {} : { negotiatedPriceCents: row.negotiatedPriceCents }),
    committedAt: row.committedAt.toISOString(),
    commitBy: commitBy.toISOString(),
  };
  if (row.cancelledAt) return { ...base, status: "cancelled" };
  // Every live commitment at the current terms version is at or above the offer price (submit
  // refuses one below it); ones at an older version are refused stale_terms here.
  const pool = evaluatePool(rule, visitDate, await occurrenceCommitments(db, rule.id, visitDate));
  return { ...base, status: "pending", pooledCovers: pool.totalCovers, minPoolCovers: rule.terms.minPoolCovers };
}

export type StatusResult = { ok: true; commitment: CommitmentView } | { ok: false; reason: "not_found" };

// An agent sees only its own commitments; another agent's id answers not_found, like a missing one.
// Before the deadline the status is pending with the pool so far; from the deadline on, the first
// read clears the occurrence and stores the result, and every read after returns that result.
export async function getCommitmentStatus(db: Executor, agentId: string, commitmentId: string, clock: Clock = () => new Date()): Promise<StatusResult> {
  const [row] = await db.select().from(commitments).where(and(eq(commitments.id, commitmentId), eq(commitments.agentId, agentId)));
  if (!row) return { ok: false, reason: "not_found" };
  const view = await viewOf(db, row);
  if (view.status === "cancelled" || clock() < new Date(view.commitBy)) return { ok: true, commitment: view };
  const cleared = await ensureClearing(db, row.ruleId, view.visitDate);
  const fill = cleared.filled.get(row.id);
  const settled: CommitmentView = { ...view };
  delete settled.pooledCovers;
  delete settled.minPoolCovers;
  if (fill === undefined) return { ok: true, commitment: { ...settled, status: "not_filled" } };
  return { ok: true, commitment: { ...settled, status: "filled", pricePerCoverCents: fill.pricePerCoverCents } };
}

export type CancelResult = { ok: true; commitment: CommitmentView } | { ok: false; reason: "not_found" | "binding" };

// Cancels an agent's own commitment before its deadline. From the deadline on, or once the
// occurrence is cleared, the commitment is binding. Cancelling a cancelled commitment returns it.
export async function cancelCommitment(db: Executor, agentId: string, commitmentId: string, clock: Clock = () => new Date()): Promise<CancelResult> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(commitments)
        .where(and(eq(commitments.id, commitmentId), eq(commitments.agentId, agentId)))
        .for("update");
      if (!row) return { ok: false as const, reason: "not_found" as const };
      if (row.cancelledAt) return { ok: true as const, commitment: await viewOf(tx, row) };
      const now = clock();
      const rule = toRule(one(await tx.select().from(rules).where(eq(rules.id, row.ruleId))));
      if (now >= deadlineOf(rule, singaporeLocal(row.visitAt).date)) return { ok: false as const, reason: "binding" as const };
      const cancelled = one(await tx.update(commitments).set({ cancelledAt: now }).where(eq(commitments.id, row.id)).returning());
      return { ok: true as const, commitment: await viewOf(tx, cancelled) };
    });
  } catch (err) {
    if (constraintOf(err) === "commitments_occurrence_cleared") return { ok: false, reason: "binding" };
    throw err;
  }
}
