import { randomInt } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { changed, judgeOwnerChange, LINK_CODE_ALPHABET, LINK_CODE_LENGTH, type OwnerChange, readIntent } from "@/domain/whatsapp/owner-change";
import { percent } from "@/domain/onboarding/replan";
import { offerPriceCents } from "@/domain/offers/evaluate";
import type { MerchantRule } from "@/domain/offers/schema";
import { tokenSha256 } from "@/lib/agents/tokens";
import { constraintOf, dollars, settleDue, toRule } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { merchants, ownerChangeOutcomes, ownerChanges, rules, whatsappInbound, whatsappLinkCodes, whatsappLinks } from "@/lib/db/schema";
import { recentAttempts } from "@/lib/llm-calls";
import { log } from "@/lib/log";
import { windowText } from "@/lib/onboarding/service";
import { OWNER_CHANGE_PURPOSE, type ProposeOwnerChange } from "./owner-model";
import type { InboundMessage } from "./cloud";

// The owner's WhatsApp number as a way to change a live offer, against the database. The runtime
// role records codes, inbound ids and proposed changes; it links a number, applies a change and
// cancels one only through claim_whatsapp_link, apply_owner_change and cancel_owner_change, which
// check again what is checked here. Every inbound message gets exactly one reply, or none.

export type Clock = () => Date;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const LINK_CODE_TTL_MS = 10 * MINUTE_MS;
export const CONFIRM_WINDOW_MS = 15 * MINUTE_MS;
// Arbitrary constant naming the advisory lock: one owner-change model call at a time.
const OWNER_LOCK_KEY = 4_151_008;
// Model attempts per rolling day, across all merchants, so a leaked or spammed number cannot run up spend.
export const OWNER_CHANGE_DAILY_CAP = 30;
const MESSAGE_TEXT_LIMIT = 500;

// A one-time code the owner sends from their phone as "LINK <code>". Only its hash is stored.
export async function newLinkCode(db: Db, merchantId: string, clock: Clock = () => new Date()): Promise<{ code: string; expiresAt: Date }> {
  const code = Array.from({ length: LINK_CODE_LENGTH }, () => LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)]).join("");
  const now = clock();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  await db.insert(whatsappLinkCodes).values({ codeSha256: tokenSha256(code), merchantId, createdAt: now, expiresAt });
  return { code, expiresAt };
}

// The number currently linked to a merchant (its latest link, if no later one moved that number
// elsewhere), as its last four digits for the merchant page.
export async function linkedPhoneEnding(db: Db, merchantId: string): Promise<string | null> {
  const [row] = await db.select({ phone: whatsappLinks.phone }).from(whatsappLinks).where(eq(whatsappLinks.merchantId, merchantId)).orderBy(desc(whatsappLinks.linkedAt)).limit(1);
  if (!row) return null;
  return (await merchantForPhone(db, row.phone)) === merchantId ? row.phone.slice(-4) : null;
}

// The merchant a number is linked to: its latest link, unless that merchant has since linked another
// number. One statement, so the timestamps are compared inside Postgres at full precision.
async function merchantForPhone(db: Db, phone: string): Promise<string | null> {
  const [row] = await db.execute<{ merchant_id: string }>(sql`
    with latest as (select merchant_id, linked_at from whatsapp_links where phone = ${phone} order by linked_at desc limit 1)
    select merchant_id from latest
    where not exists (select 1 from whatsapp_links x where x.merchant_id = latest.merchant_id and x.linked_at > latest.linked_at)`);
  return row?.merchant_id ?? null;
}

type Pending = { id: string };

// The merchant's latest proposal, if it counted, is unresolved and is still within its window.
async function pendingChange(db: Db, merchantId: string, now: Date): Promise<Pending | null> {
  const [row] = await db
    .select({ id: ownerChanges.id, verdict: ownerChanges.verdict, expiresAt: ownerChanges.expiresAt, outcome: ownerChangeOutcomes.outcome })
    .from(ownerChanges)
    .leftJoin(ownerChangeOutcomes, eq(ownerChangeOutcomes.changeId, ownerChanges.id))
    .where(and(eq(ownerChanges.merchantId, merchantId), isNotNull(ownerChanges.wamid)))
    .orderBy(desc(ownerChanges.createdAt))
    .limit(1);
  return row && row.verdict === "ok" && row.outcome === null && row.expiresAt > now ? { id: row.id } : null;
}

const REFUSAL_TEXT: Record<string, string> = {
  not_understood: "",
  no_proposal: "I could not work out that change just now. Try again in a moment, or change it on your merchant page.",
  unchanged: "Those are already your terms, so nothing would change.",
  discount_out_of_range: "A discount must be between 1% and 99%.",
  capacity_out_of_range: `Capacity must be between 1 and 10,000 covers.`,
  min_pool_out_of_range: "The minimum pool must be at least 1 and no more than your capacity.",
  cap_out_of_range: "The per-agent cap must be at least 1 and no more than your capacity.",
  below_floor: "That would price a cover below your floor, so I will not publish it.",
};

function preview(name: string, rule: MerchantRule, change: OwnerChange): string {
  const next = changed(rule, change);
  const lines: string[] = [];
  if (change.discountBps !== rule.terms.discountBps) {
    lines.push(`Discount ${percent(rule.terms.discountBps)} off to ${percent(change.discountBps)} off (${dollars(offerPriceCents(rule))} to ${dollars(offerPriceCents(next))} per cover)`);
  }
  if (change.capacityCovers !== rule.capacityCovers) lines.push(`Capacity ${rule.capacityCovers} to ${change.capacityCovers} covers`);
  if (change.minPoolCovers !== rule.terms.minPoolCovers) lines.push(`Minimum pool ${rule.terms.minPoolCovers} to ${change.minPoolCovers} covers`);
  if (change.perAgentCapCovers !== rule.terms.perAgentCapCovers) lines.push(`Per-agent cap ${rule.terms.perAgentCapCovers} to ${change.perAgentCapCovers} covers`);
  return [`Change for ${name}:`, ...lines.map((l) => `- ${l}`), "Reply YES within 15 minutes to publish it, or NO to cancel."].join("\n");
}

const APPLY_REFUSAL_TEXT: Record<string, string> = {
  apply_owner_change_owner: "I could not find that change.",
  apply_owner_change_verdict: "That change cannot be published.",
  apply_owner_change_expired: "That change expired. Send it again if you still want it.",
  apply_owner_change_superseded: "A newer message replaced that change. Reply YES to the newest one.",
  apply_owner_change_stale: "Your offer changed since that was proposed, so I did not publish it. Send it again.",
  apply_owner_change_bounds: "That change is outside the allowed bounds, so I did not publish it.",
  apply_owner_change_pending: "Buyers have commitments waiting on this offer. Try again after they clear.",
  owner_change_outcomes_pkey: "That change was already decided.",
};

async function confirm(db: Db, merchantId: string, name: string, now: Date): Promise<string> {
  const pending = await pendingChange(db, merchantId, now);
  if (!pending) return "Nothing is waiting for your confirmation. Tell me what to change, for example: make it 20% off.";
  // Only a commitment still before its deadline should block the change, so settle the rest first.
  await settleDue(db, merchantId, () => now);
  try {
    const [row] = await db.execute<{ version: number }>(sql`select apply_owner_change(${merchantId}::uuid, ${pending.id}::uuid) as version`);
    return `Done. ${name}'s offer is updated and buyers see the new terms now (terms version ${Number(row?.version)}).`;
  } catch (err) {
    const constraint = constraintOf(err) ?? "";
    // Two confirmations can race: the loser sees the rule already moved on, or the outcome taken.
    if ((constraint === "apply_owner_change_stale" || constraint === "owner_change_outcomes_pkey") && (await outcomeOf(db, pending.id)) === "applied") return "That change is already live.";
    const text = APPLY_REFUSAL_TEXT[constraint];
    if (text) return text;
    throw err;
  }
}

async function outcomeOf(db: Db, changeId: string): Promise<string | null> {
  const [row] = await db.select({ outcome: ownerChangeOutcomes.outcome }).from(ownerChangeOutcomes).where(eq(ownerChangeOutcomes.changeId, changeId));
  return row?.outcome ?? null;
}

async function cancel(db: Db, merchantId: string, now: Date): Promise<string> {
  const pending = await pendingChange(db, merchantId, now);
  if (!pending) return "Nothing is waiting for your confirmation.";
  await db.execute(sql`select cancel_owner_change(${merchantId}::uuid, ${pending.id}::uuid)`);
  return "Cancelled. Your offer is unchanged.";
}

export type OwnerDeps = { propose: ProposeOwnerChange; model: string };

// Reads an instruction with Muse Wonder and stores the proposal, counted or not. Nothing changes
// until the owner replies YES.
async function instruct(db: Db, merchant: { id: string; name: string }, message: InboundMessage & { text: string }, deps: OwnerDeps, now: Date): Promise<string> {
  const ruleRows = await db.select().from(rules).where(eq(rules.merchantId, merchant.id));
  if (ruleRows.length === 0) return "You have no published offer yet. Publish one on your merchant page first.";
  const [only, ...rest] = ruleRows;
  if (!only || rest.length > 0) return "You have more than one offer, so change them on your merchant page.";
  const rule = toRule(only);
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${OWNER_LOCK_KEY}) as locked`);
    if (!lock?.locked) return "I am busy with another change. Send that again in a moment.";
    if ((await recentAttempts(tx, OWNER_CHANGE_PURPOSE, new Date(now.getTime() - DAY_MS))).count >= OWNER_CHANGE_DAILY_CAP) {
      return "Today's limit for changes by message is reached. Change it on your merchant page, or try tomorrow.";
    }
    const proposal = await deps.propose(message.text, {
      merchantName: merchant.name,
      listPriceCents: rule.listPriceCents,
      capacityCovers: rule.capacityCovers,
      discountBps: rule.terms.discountBps,
      minPoolCovers: rule.terms.minPoolCovers,
      perAgentCapCovers: rule.terms.perAgentCapCovers,
      window: windowText(rule),
    });
    const verdict = proposal === null ? ({ ok: false, reason: "no_proposal" } as const) : judgeOwnerChange(rule, proposal);
    const numbers =
      proposal === null || (!verdict.ok && verdict.reason === "not_understood")
        ? {}
        : { discountBps: proposal.discountBps, capacityCovers: proposal.capacityCovers, minPoolCovers: proposal.minPoolCovers, perAgentCapCovers: proposal.perAgentCapCovers };
    await tx.insert(ownerChanges).values({
      merchantId: merchant.id,
      ruleId: rule.id,
      termsVersion: rule.termsVersion,
      wamid: message.wamid,
      messageText: message.text.slice(0, MESSAGE_TEXT_LIMIT),
      model: deps.model,
      verdict: verdict.ok ? "ok" : verdict.reason,
      createdAt: now,
      expiresAt: new Date(now.getTime() + CONFIRM_WINDOW_MS),
      ...numbers,
    });
    if (proposal !== null && verdict.ok) return preview(merchant.name, rule, proposal);
    if (proposal !== null && !verdict.ok && verdict.reason === "not_understood") return proposal.reply;
    return REFUSAL_TEXT[verdict.ok ? "no_proposal" : verdict.reason] ?? REFUSAL_TEXT.no_proposal ?? "";
  });
}

const NOT_LINKED = "This number is not linked to a merchant. Open your merchant page, get a link code, then send: LINK <code>";

// Handles one inbound message and returns the reply to send, or null for a message already handled.
// The id is claimed first, so a retried delivery is answered once.
export async function handleMessage(db: Db, message: InboundMessage, deps: OwnerDeps, clock: Clock = () => new Date()): Promise<string | null> {
  const claimed = await db.insert(whatsappInbound).values({ wamid: message.wamid, phone: message.from }).onConflictDoNothing().returning({ wamid: whatsappInbound.wamid });
  if (claimed.length === 0) return null;
  if (message.text === null || message.text.trim() === "") return "I can only read text messages.";
  const now = clock();
  const intent = readIntent(message.text);
  if (intent.kind === "link") return linkNumber(db, intent.code, message.from);
  const merchantId = await merchantForPhone(db, message.from);
  const [merchant] = merchantId === null ? [] : await db.select({ id: merchants.id, name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId));
  if (!merchant) return NOT_LINKED;
  if (intent.kind === "confirm") return confirm(db, merchant.id, merchant.name, now);
  if (intent.kind === "cancel") return cancel(db, merchant.id, now);
  return instruct(db, merchant, { ...message, text: message.text }, deps, now);
}

async function linkNumber(db: Db, code: string, phone: string): Promise<string> {
  try {
    const [row] = await db.execute<{ merchant_id: string }>(sql`select claim_whatsapp_link(${tokenSha256(code)}, ${phone}) as merchant_id`);
    const [merchant] = await db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, String(row?.merchant_id)));
    return `Linked to ${merchant?.name ?? "your merchant"}. Tell me what to change, for example: make it 20% off.`;
  } catch (err) {
    const constraint = constraintOf(err);
    if (constraint === "claim_whatsapp_link_code" || constraint === "whatsapp_links_code_once") return "That code is not valid or has expired. Get a new one from your merchant page.";
    log("error", "whatsapp.link_failed", { constraint: constraint ?? null });
    throw err;
  }
}

// Handles each message of a webhook body and sends the replies. A message that fails is logged and
// answered with a short apology, so the owner is not left waiting; one message never stops the next.
export async function processInbound(db: Db, messages: InboundMessage[], deps: OwnerDeps, send: (to: string, body: string) => Promise<boolean>, clock: Clock = () => new Date()): Promise<void> {
  for (const message of messages) {
    let reply: string | null;
    try {
      reply = await handleMessage(db, message, deps, clock);
    } catch (err) {
      log("error", "whatsapp.message_failed", { name: err instanceof Error ? err.name : "Error" });
      reply = "Something went wrong on my side, so nothing was changed. Try again in a moment.";
    }
    if (reply !== null) await send(message.from, reply);
  }
}
