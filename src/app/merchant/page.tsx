import { merchantKopiCue, merchantStep } from "@/components/merchant-kopi";
import { KopiMessage } from "@/components/kopi-companion";
import { Kopi } from "@/components/kopi";
import { percent } from "@/domain/onboarding/replan";
import { available, dollars } from "@/lib/commitments/service";
import { merchantLedger } from "@/lib/ledger/service";
import { webDb } from "@/lib/db/client";
import { MAX_PHOTO_BYTES } from "@/domain/onboarding/menu";
import { dashboard, windowText } from "@/lib/onboarding/service";
import { webEnv, whatsappEnv } from "@/env";
import { linkedPhoneEnding } from "@/lib/whatsapp/service";
import { apply, leave, uploadMenu } from "./actions";
import { LinkWhatsapp } from "./link-whatsapp";
import { ReplanTrigger } from "./replan-trigger";
import { currentMerchant } from "./session";
import { SubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  empty: "Choose a photo of your menu first.",
  too_large: `That photo is over ${MAX_PHOTO_BYTES / 1024 / 1024} MB. Try a smaller one.`,
  not_an_image: "That file is not a JPEG, PNG or WebP photo.",
  busy: "Another menu is being read. Try again in a moment.",
  daily_cap: "Today's menu reading limit is reached. Try again tomorrow.",
  failed: "Muse Spark could not read that photo. Try a clearer, straight-on photo.",
  plan_applied: "The plan is applied. Your offer now has the new terms.",
  plan_stale: "Your terms changed since that plan was made, so it was not applied.",
  plan_pending: "Buyers have commitments waiting on this offer. Apply the plan after they clear.",
  plan_refused: "That plan is outside the allowed bounds, so it was not applied.",
  plan_already_applied: "That plan is already applied.",
  plan_not_found: "That plan was not found.",
};

const VERDICT_TEXT: Record<string, string> = {
  ok: "Ready to apply",
  no_proposal: "Wonder gave no plan",
  unchanged: "Refused: changes nothing",
  deepens_discount: "Refused: bigger discount after a sellout",
  capacity_out_of_range: "Refused: capacity out of range",
  lowers_min_pool: "Refused: lowers the minimum pool",
  min_pool_above_capacity: "Refused: minimum pool above capacity",
  cap_above_capacity: "Refused: per-agent cap above capacity",
  below_floor: "Refused: below your floor",
};

const readAt = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const card = "flex flex-col gap-4 rounded-lg border border-[var(--border)] p-5";
const button = "rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] hover:opacity-90";

function SignedOut() {
  return (
    <main className="workspace-page">
      <Kopi className="entry-kopi" label="Kopi, your Backfill guide" /><p className="eyebrow">Your merchant workspace</p><h1 className="text-2xl font-semibold tracking-tight">Your menu.<br />Your terms.</h1>
      <p className="text-[var(--muted)]">Open the secret link Backfill gave you to manage your offers.</p>
    </main>
  );
}

export default async function MerchantHome({ searchParams }: { searchParams: Promise<{ status?: string; published?: string }> }) {
  const merchant = await currentMerchant();
  if (!merchant) return <SignedOut />;
  const { status, published } = await searchParams;
  const notice = status ? STATUS_TEXT[status] : undefined;
  const board = await dashboard(webDb(), merchant.id);
  const cue = merchantKopiCue(board.drafts, board.plans, published);
  const step = merchantStep(board.drafts, board.rules.length);
  const savingsLedger = await merchantLedger(webDb(), merchant.id);
  const planned = new Set(board.plans.map((p) => `${p.ruleId}/${p.visitDate}`));
  const needsPlan = board.occurrences.some((o) => o.soldOut && !planned.has(`${o.ruleId}/${o.visitDate}`));
  const whatsapp = whatsappEnv(webEnv()) !== null;
  const linkedEnding = whatsapp ? await linkedPhoneEnding(webDb(), merchant.id) : null;

  return (
    <main className="workspace-page">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-[var(--muted)]">Backfill for merchants</p>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{merchant.name}</h1>
        </div>
        <form action={leave} className="shrink-0 pt-1">
          <button type="submit" className="text-sm text-[var(--muted)] underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <KopiMessage {...cue} />
      <ol className="onboarding-steps" aria-label="Merchant journey"><li aria-current={step === 1 ? "step" : undefined}>01 / Read your menu</li><li aria-current={step === 2 ? "step" : undefined}>02 / Confirm your terms</li><li aria-current={step === 3 ? "step" : undefined}>03 / Follow your offers</li></ol>
      <dl className="merchant-summary"><div><dt>Your offers</dt><dd>{board.rules.length}</dd></div><div><dt>Covers filled</dt><dd>{savingsLedger.totals.covers}</dd></div><div><dt>Buyer savings</dt><dd>{dollars(savingsLedger.totals.buyerShareCents)}</dd></div></dl>
      {notice && (
        <p role="status" className="rounded-md border border-[var(--border)] px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {needsPlan && <ReplanTrigger />}

      <section className={card}>
        <h2 className="text-lg font-medium">Add an offer from your menu</h2>
        <p className="text-sm text-[var(--muted)]">
          Muse Spark reads the prices from a photo of your menu. You check them and set your off-peak terms before anything is published. The photo is not kept.
        </p>
        <form action={uploadMenu} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            name="photo"
            aria-label="Menu photo"
            accept="image/jpeg,image/png,image/webp"
            required
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-transparent file:px-3 file:py-2 file:text-sm file:text-[var(--foreground)]"
          />
          <SubmitButton className={button} pendingLabel="Reading menu…">
            Read menu
          </SubmitButton>
        </form>
      </section>

      {whatsapp && (
        <section className={card}>
          <h2 className="text-lg font-medium">Change your offer by WhatsApp</h2>
          <p className="text-sm text-[var(--muted)]">
            Link your phone, then message the Backfill WhatsApp number, for example &ldquo;make it 20% off&rdquo;. Your Muse Wonder agent shows the change and it goes live only after you reply YES.
          </p>
          <LinkWhatsapp linkedEnding={linkedEnding} button={button} />
        </section>
      )}

      <section className={card}>
        <h2 className="text-lg font-medium">Your offers</h2>
        {board.rules.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No offers yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {board.rules.map(({ rule, offerPriceCents, published }) => (
              <li key={rule.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="chips"><span className={`chip ${available(rule) ? "good" : "wait"}`}>{available(rule) ? "Open to commitments" : "Unavailable"}</span><span className="chip">{published ? "Menu confirmed" : "Configured offer"}</span><span className="chip">Terms v{rule.termsVersion}</span></div>
                <p className="font-medium">
                  {percent(rule.terms.discountBps)} off: {dollars(rule.listPriceCents)} becomes {dollars(offerPriceCents)} per cover
                </p>
                <p className="text-sm text-[var(--muted)]">{windowText(rule)}</p>
                <p className="text-sm text-[var(--muted)]">
                  Unlocks at {rule.terms.minPoolCovers} covers · up to {rule.terms.perAgentCapCovers} per agent · {rule.capacityCovers} covers available · your floor{" "}
                  {dollars(rule.terms.floorPriceCents)} (never shown to buyers) · terms v{rule.termsVersion}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">Savings ledger</h2>
        <p className="text-sm">{savingsLedger.totals.entries} filled commitments, {savingsLedger.totals.covers} covers. Buyers saved {dollars(savingsLedger.totals.buyerShareCents)}.</p>
        <p className="text-sm text-[var(--muted)]">Accepted total {dollars(savingsLedger.totals.chargedCents)}. Agent share {dollars(savingsLedger.totals.agentShareCents)}. Network share {dollars(savingsLedger.totals.networkShareCents)}. No money is collected by this demo.</p>
        <p className="text-sm text-[var(--muted)]">{savingsLedger.reconciled ? "Ledger totals reconcile." : "Historical entries need reconciliation. Totals above include recorded entries only."}</p>
      </section>

      {board.occurrences.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-medium">Fill history</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {board.occurrences.map((o) => (
              <li key={`${o.ruleId}/${o.visitDate}`} className="flex flex-wrap justify-between gap-2">
                <span>{o.visitDate}</span>
                <span className="text-[var(--muted)]">
                  {o.unlocked ? `${o.covers} ${o.covers === 1 ? "cover" : "covers"} filled` : "Pool not reached"}
                  {o.soldOut && <span className="ml-2 font-medium text-[var(--accent)]">Sold out</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {board.plans.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-medium">Muse Wonder plans</h2>
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {board.plans.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-[var(--muted)]">
                  After the sellout on {p.visitDate} · {p.applied ? "Applied" : (VERDICT_TEXT[p.verdict] ?? p.verdict)}
                </p>
                {p.discountBps !== null && (
                  <p className="font-medium">
                    {percent(p.discountBps)} off · {p.capacityCovers} covers · unlocks at {p.minPoolCovers} · up to {p.perAgentCapCovers} per agent
                  </p>
                )}
                {p.rationale && <p className="text-sm">{p.rationale}</p>}
                {p.verdict === "ok" && !p.applied && (
                  <form action={apply}>
                    <input type="hidden" name="planId" value={p.id} />
                    <SubmitButton className={button} pendingLabel="Applying…">
                      Apply plan
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {board.drafts.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-medium">Recent menu reads</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {board.drafts.map((d) => (
              <li key={d.id} className="flex justify-between gap-3">
                <a href={`/merchant/drafts/${d.id}`} className="shrink-0 underline underline-offset-4">
                  {readAt.format(d.createdAt)}
                </a>
                <span className="text-right text-[var(--muted)]">{d.ruleId ? "Published" : d.verdict === "ok" ? `${dollars(d.listPriceCents ?? 0)} cover, not published` : "Could not use"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
