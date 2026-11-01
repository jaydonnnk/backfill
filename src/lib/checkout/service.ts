import { and, eq } from "drizzle-orm";
import type { LedgerEntry } from "@/domain/ledger/schema";
import { getCommitmentStatus, type Clock } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { checkoutReceipts, commitments, ledger } from "@/lib/db/schema";

type Base = { id: string; currency: "sgd"; simulated: true; money_moved: false; messages: string[] };
type Economics = {
  line_items: { id: string; quantity: number; unit_amount: number; amount: number }[];
  totals: { type: "total"; amount: number }[];
  savings: { savings_cents: number; buyer_share_cents: number; agent_share_cents: number; network_share_cents: number };
};
type Order = { id: string; checkout_session_id: string; completed_at: string };
export type CheckoutSession = Base & (
  | { status: "not_ready_for_payment" | "canceled"; reason: string }
  | (Economics & { status: "ready_for_payment" })
  | (Economics & { status: "completed"; order: Order })
);

function economics(entry: LedgerEntry): Economics {
  const charged = entry.covers * entry.pricePerCoverCents;
  return {
    line_items: [{ id: entry.commitmentId, quantity: entry.covers, unit_amount: entry.pricePerCoverCents, amount: charged }],
    totals: [{ type: "total", amount: charged }],
    savings: { savings_cents: entry.savingsCents, buyer_share_cents: entry.buyerShareCents, agent_share_cents: entry.agentShareCents, network_share_cents: entry.networkShareCents },
  };
}
const order = (id: string, completedAt: Date): Order => ({ id: `sim_${id}`, checkout_session_id: id, completed_at: completedAt.toISOString() });

// Ownership precedes every read. Stored economics and receipts survive later rule changes.
export async function getCheckout(db: Db, agentId: string, id: string, clock: Clock = () => new Date()): Promise<CheckoutSession | null> {
  const [owned] = await db.select({ id: commitments.id }).from(commitments).where(and(eq(commitments.id, id), eq(commitments.agentId, agentId)));
  if (!owned) return null;
  const base: Base = { id, currency: "sgd", simulated: true, money_moved: false, messages: ["Simulation only. No money is charged."] };
  let [entry] = await db.select().from(ledger).where(eq(ledger.commitmentId, id));
  if (!entry) {
    const result = await getCommitmentStatus(db, agentId, id, clock);
    if (!result.ok) return null;
    const status = result.commitment.status;
    if (status !== "filled") return { ...base, status: status === "pending" ? "not_ready_for_payment" : "canceled", reason: status };
    [entry] = await db.select().from(ledger).where(eq(ledger.commitmentId, id));
    if (!entry) return { ...base, status: "not_ready_for_payment", reason: "ledger_reconciliation_pending" };
  }
  const [receipt] = await db.select().from(checkoutReceipts).where(eq(checkoutReceipts.commitmentId, id));
  if (receipt) return { ...base, ...economics(entry), status: "completed", order: order(id, receipt.completedAt) };
  return { ...base, ...economics(entry), status: "ready_for_payment" };
}

export async function completeCheckout(db: Db, agentId: string, id: string, clock: Clock = () => new Date()): Promise<
  | { ok: true; checkout: Extract<CheckoutSession, { status: "completed" }> }
  | { ok: false; reason: "not_found" | "not_ready" }
> {
  const session = await getCheckout(db, agentId, id, clock);
  if (!session) return { ok: false, reason: "not_found" };
  if (session.status === "completed") return { ok: true, checkout: session };
  if (session.status !== "ready_for_payment") return { ok: false, reason: "not_ready" };
  // A receipt has no caller-supplied economics. A retry reads the first committed receipt.
  const inserted = await db.insert(checkoutReceipts).values({ commitmentId: id, completedAt: clock() }).onConflictDoNothing({ target: checkoutReceipts.commitmentId }).returning();
  const receipt = inserted[0] ?? (await db.select().from(checkoutReceipts).where(eq(checkoutReceipts.commitmentId, id)))[0];
  if (!receipt) throw new Error("simulated receipt insert returned no row");
  return { ok: true, checkout: { ...session, status: "completed", order: order(id, receipt.completedAt) } };
}
