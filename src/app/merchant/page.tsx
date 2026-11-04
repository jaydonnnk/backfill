import { merchantKopiCue, merchantStep } from "@/components/merchant-kopi";
import { KopiMessage } from "@/components/kopi-companion";
import Link from "next/link";
import { Kopi } from "@/components/kopi";
import { MerchantAccessForm } from "./access-form";
import { percent } from "@/domain/onboarding/replan";
import { available, dollars } from "@/lib/commitments/service";
import { merchantLedger } from "@/lib/ledger/service";
import { webDb } from "@/lib/db/client";
import { MAX_PHOTO_BYTES } from "@/domain/onboarding/menu";
import { merchantVisibility } from "@/lib/onboarding/links";
import { dashboard, windowText } from "@/lib/onboarding/service";
import { webEnv, whatsappEnv } from "@/env";
import { linkedPhoneEnding } from "@/lib/whatsapp/service";
import { apply, leave } from "./actions";
import { MenuDrop } from "./menu-drop";
import { LinkWhatsapp } from "./link-whatsapp";
import { ReplanTrigger } from "./replan-trigger";
import { currentMerchant } from "./session";
import { SubmitButton } from "./submit-button";
import { OwnerVoice } from "./owner-voice";
import { OwnerCreative } from "./owner-creative";
import { latestCreative } from "@/lib/creative/service";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  empty: "Choose a photo of your menu first.",
  too_large: `That photo is over ${MAX_PHOTO_BYTES / 1024 / 1024} MB. Try a smaller one.`,
  not_an_image: "That file is not a JPEG, PNG or WebP photo.",
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

const button = "button primary";

function SignedOut() {
  return (
    <main className="workspace-page">
      <p className="eyebrow">Backfill for cafés and restaurants</p><h1>Your café.<br />Your quiet hours.<br />Your terms.</h1>
      <p>Add your menu. Set your terms.</p>
      <MerchantAccessForm />
    </main>
  );
}

export default async function MerchantHome({ searchParams }: { searchParams: Promise<{ status?: string; published?: string }> }) {
  const merchant = await currentMerchant();
  if (!merchant) return <SignedOut />;
  const { status, published } = await searchParams;
  const notice = status ? STATUS_TEXT[status] : undefined;
  const board = await dashboard(webDb(), merchant.id);
  const creative = new Map(await Promise.all(board.rules.map(async ({rule}) => [rule.id, await latestCreative(webDb(), merchant.id, rule.id)] as const)));
  const cue = merchantKopiCue(board.drafts, board.plans, published);
  const step = merchantStep(board.drafts, board.rules.length);
  const savingsLedger = await merchantLedger(webDb(), merchant.id);
  const awaitingReview = board.rules.length > 0 && (await merchantVisibility(webDb(), merchant.id)) === "pending";
  const planned = new Set(board.plans.map((p) => `${p.ruleId}/${p.visitDate}`));
  const needsPlan = board.occurrences.some((o) => o.soldOut && !planned.has(`${o.ruleId}/${o.visitDate}`));
  const whatsapp = whatsappEnv(webEnv()) !== null;
  const linkedEnding = whatsapp ? await linkedPhoneEnding(webDb(), merchant.id) : null;

  const pendingDraft = board.drafts.find((d) => d.ruleId === null && d.verdict === "ok");
  const readyPlan = board.plans.some((p) => p.verdict === "ok" && !p.applied);
  const hasOffers = board.rules.length > 0;

  return (
    <main className="workspace-page merchant-board">
      <header className="board-head">
        <h1>{merchant.name}</h1>
        <div className="board-links"><Link href="/merchant/access">Save access link</Link><form action={leave}><button type="submit">Sign out</button></form></div>
      </header>

      <KopiMessage {...cue} />
      <ol className="onboarding-steps" aria-label="Merchant journey"><li className={step > 1 ? "finished" : undefined} aria-current={step === 1 ? "step" : undefined}>01 / Read your menu</li><li className={step > 2 ? "finished" : undefined} aria-current={step === 2 ? "step" : undefined}>02 / Confirm your terms</li><li aria-current={step === 3 ? "step" : undefined}>03 / Follow your offers</li></ol>

      {notice && <p role="status" className="board-notice">{notice}</p>}
      {awaitingReview && <p role="status" className="board-notice">Your offer is awaiting a quick review before buyer agents can see it.</p>}
      {needsPlan && <ReplanTrigger />}
      {pendingDraft && <section className="next-step"><div><h2>Your menu is read</h2><p>Check the prices and set your quiet-hour deal.</p></div><Link className="button primary" href={`/merchant/drafts/${pendingDraft.id}`}>Confirm your terms</Link></section>}
      {readyPlan && <section className="next-step"><div><h2>You sold out. Wonder has a plan.</h2><p>Review it before anything changes.</p></div><a className="button primary" href="#plans">Review the plan</a></section>}

      {hasOffers && <dl className="merchant-summary"><div><dt>Covers filled</dt><dd>{savingsLedger.totals.covers}</dd></div><div><dt>Booked value</dt><dd>{dollars(savingsLedger.totals.chargedCents)}</dd></div><div><dt>Buyer savings</dt><dd>{dollars(savingsLedger.totals.buyerShareCents)}</dd></div></dl>}

      {!hasOffers && <section className="board-start">
        <div>
          <h2>Add an offer from your menu</h2>
          <MenuDrop large />
          <p className="small">Muse Spark reads the prices. You check them and set the terms before anything goes live. The photo is not kept.</p>
          <p className="small">No offers yet.</p>
        </div>
        <Kopi />
      </section>}

      {hasOffers && <div className="board-grid">
        <div className="board-main">
          <h2>Your offers</h2>
          {board.rules.map(({ rule, offerPriceCents, published }) => {
            const latest = board.occurrences.filter((o) => o.ruleId === rule.id).at(-1);
            return <article className="offer-chit" key={rule.id}>
              <div className="chips"><span className={`chip ${available(rule) && !awaitingReview ? "good" : "wait"}`}>{awaitingReview ? "Awaiting review" : available(rule) ? "Open to commitments" : "Unavailable"}</span><span className="chip">{published ? "Menu confirmed" : "Configured offer"}</span><span className="chip">Terms v{rule.termsVersion}</span></div>
              <div className="offer-deal">
                <strong>{percent(rule.terms.discountBps)} off</strong>
                <p><s>{dollars(rule.listPriceCents)}</s> {dollars(offerPriceCents)} <span>per cover</span></p>
              </div>
              <p className="offer-when">{windowText(rule)}</p>
              <dl className="offer-facts">
                <div><dt>Unlocks at</dt><dd>{rule.terms.minPoolCovers} covers</dd></div>
                <div><dt>Covers available</dt><dd>{rule.capacityCovers}</dd></div>
                <div><dt>Most per agent</dt><dd>{rule.terms.perAgentCapCovers}</dd></div>
                <div><dt>Your floor (private)</dt><dd>{dollars(rule.terms.floorPriceCents)}</dd></div>
              </dl>
              {latest && <div className="offer-fill">
                <p>{latest.visitDate}: {latest.unlocked ? `${latest.covers} of ${rule.capacityCovers} covers filled` : "Pool not reached"}{latest.soldOut && " · Sold out"}</p>
                <progress max={rule.capacityCovers} value={Math.min(latest.covers, rule.capacityCovers)} aria-label="Covers filled in the latest round" />
              </div>}
              <div className="offer-tools">
                <details><summary>Change by voice</summary><OwnerVoice ruleId={rule.id} termsVersion={rule.termsVersion} /></details>
                <details><summary>Add a dish photo</summary><OwnerCreative ruleId={rule.id} termsVersion={rule.termsVersion} initial={creative.get(rule.id) ?? null} /></details>
              </div>
            </article>;
          })}

          {board.plans.length > 0 && <section id="plans" className="board-plans">
            <h2>Muse Wonder plans</h2>
            <ul>
              {board.plans.map((p) => <li key={p.id}>
                <p className="small">After the sellout on {p.visitDate} · {p.applied ? "Applied" : (VERDICT_TEXT[p.verdict] ?? p.verdict)}</p>
                {p.discountBps !== null && <p className="plan-terms">{percent(p.discountBps)} off · {p.capacityCovers} covers · unlocks at {p.minPoolCovers} · up to {p.perAgentCapCovers} per agent</p>}
                {p.rationale && <p>{p.rationale}</p>}
                {p.verdict === "ok" && !p.applied && <form action={apply}><input type="hidden" name="planId" value={p.id} /><SubmitButton className={button} pendingLabel="Applying…">Apply plan</SubmitButton></form>}
              </li>)}
            </ul>
          </section>}
        </div>

        <aside className="board-side">
          <section>
            <h2>Add an offer from your menu</h2>
            <MenuDrop />
          </section>
          {whatsapp && <section>
            <h2>Change your offer by WhatsApp</h2>
            <p className="small">Text &ldquo;make it 20% off&rdquo;. It goes live only after you reply YES.</p>
            <LinkWhatsapp linkedEnding={linkedEnding} button="button" />
          </section>}
          <section>
            <h2>Savings ledger</h2>
            <p>{savingsLedger.totals.entries} filled commitments, {savingsLedger.totals.covers} covers.</p>
            <p className="small">Buyers saved {dollars(savingsLedger.totals.buyerShareCents)}. Agent share {dollars(savingsLedger.totals.agentShareCents)}. Network share {dollars(savingsLedger.totals.networkShareCents)}. No money is collected by this demo.</p>
            <p className="small">{savingsLedger.reconciled ? "Ledger totals reconcile." : "Historical entries need reconciliation. Totals above include recorded entries only."}</p>
          </section>
          {board.occurrences.length > 0 && <section>
            <h2>Fill history</h2>
            <ul className="board-rows">
              {board.occurrences.map((o) => <li key={`${o.ruleId}/${o.visitDate}`}><span>{o.visitDate}</span><span className="muted">{o.unlocked ? `${o.covers} ${o.covers === 1 ? "cover" : "covers"} filled` : "Pool not reached"}{o.soldOut && <strong className="spark"> Sold out</strong>}</span></li>)}
            </ul>
          </section>}
        </aside>
      </div>}

      {board.drafts.length > 0 && <details className="board-reads">
        <summary>Recent menu reads</summary>
        <ul className="board-rows">
          {board.drafts.map((d) => <li key={d.id}><a href={`/merchant/drafts/${d.id}`}>{readAt.format(d.createdAt)}</a><span className="muted">{d.ruleId ? "Published" : d.verdict === "ok" ? `${dollars(d.listPriceCents ?? 0)} cover, not published` : "Could not use"}</span></li>)}
        </ul>
      </details>}
    </main>
  );
}
