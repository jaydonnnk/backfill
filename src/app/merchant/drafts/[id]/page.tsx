import { merchantStep } from "@/components/merchant-kopi";
import { KopiMessage } from "@/components/kopi-companion";
import { notFound } from "next/navigation";
import { dollars, WEEKDAY_NAMES } from "@/lib/commitments/service";
import { webDb } from "@/lib/db/client";
import { getDraft } from "@/lib/onboarding/service";
import { publish } from "../../actions";
import { currentMerchant } from "../../session";
import { SubmitButton } from "../../submit-button";
import { OfferPreview } from "./offer-preview";

export const dynamic = "force-dynamic";

const REFUSAL_TEXT: Record<string, string> = {
  not_sgd: "The prices on this menu do not look like Singapore dollars, so it cannot be used.",
  no_items: "No prices could be read from this photo. Try a clearer, straight-on photo.",
  cover_item_missing: "Muse Spark picked a cover item that is not on the menu, so this read cannot be used. Try again.",
  cover_item_repeated: "Muse Spark picked the same item twice for one cover, so this read cannot be used. Try again.",
};

const STATUS_TEXT: Record<string, string> = {
  invalid_terms: "Some terms are not valid: the window must end after it starts, the commit deadline must be at or before the start, and the minimum pool must not be above capacity.",
  floor_above_offer_price: "Your floor is above the discounted price, so no buyer could ever get this offer. Lower the floor or the discount.",
  already_published: "This menu read is already published.",
  not_found: "This menu read cannot be published.",
};

const DEFAULT_DISCOUNT = 25;

export default async function DraftReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const merchant = await currentMerchant();
  if (!merchant) notFound();
  const [{ id }, { status }] = await Promise.all([params, searchParams]);
  const view = await getDraft(webDb(), merchant.id, id);
  if (!view) notFound();
  const cover = new Set(view.draft.cover.itemIndexes);
  const notice = status ? STATUS_TEXT[status] : undefined;
  const listPrice = view.listPriceCents;
  const step = merchantStep([view], view.ruleId === null ? 0 : 1);

  const defaultFloor = listPrice === null ? 0 : Math.round(listPrice * 0.7);

  return (
    <main className="workspace-page merchant-board">
      <header className="board-head draft-head">
        <div><a href="/merchant" className="board-back">Back to {merchant.name}</a><h1>Check your menu</h1></div>
      </header>

      <KopiMessage pose={view.ruleId ? "happy" : view.verdict !== "ok" ? "shield" : "watching"} text={view.ruleId ? "This menu has a published offer." : view.verdict === "ok" ? "Check the prices. You choose the terms." : "This menu needs another look."} />
      <ol className="onboarding-steps" aria-label="Merchant journey"><li className={step > 1 ? "finished" : undefined} aria-current={step === 1 ? "step" : undefined}>01 / Read your menu</li><li className={step > 2 ? "finished" : undefined} aria-current={step === 2 ? "step" : undefined}>02 / Confirm your terms</li><li aria-current={step === 3 ? "step" : undefined}>03 / Follow your offers</li></ol>
      {notice && <p role="status" className="board-notice">{notice}</p>}

      <div className="draft-grid">
        <section className="chit menu-read">
          <h2>What Muse Spark read</h2>
          {view.draft.items.length === 0 ? <p className="muted">No items.</p> : <ul>
            {view.draft.items.map((item, i) => <li key={i} className={cover.has(i) ? "in-cover" : ""}><span>{item.name}</span><span>{dollars(item.priceCents)}</span></li>)}
          </ul>}
          {listPrice !== null ? <p className="menu-cover">One cover: <strong>{view.draft.cover.description}</strong>, list price <strong>{dollars(listPrice)}</strong>, the sum of the highlighted printed prices.</p> : <p>{REFUSAL_TEXT[view.verdict] ?? "This read cannot be used."}</p>}
        </section>

        {view.ruleId !== null ? <section className="next-step"><div><h2>Published</h2></div><a className="button primary" href="/merchant">See your offers</a></section> : listPrice !== null && <form action={publish} className="terms-form">
          <input type="hidden" name="draftId" value={view.id} />
          <h2>Set your off-peak terms</h2>
          <fieldset><legend>When is it quiet?</legend><div className="terms-row">
            <label>Day<select name="weekday" defaultValue="2">{WEEKDAY_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
            <label>Starts<input name="start" type="time" defaultValue="14:00" required /></label>
            <label>Ends<input name="end" type="time" defaultValue="17:00" required /></label>
            <label>Buyers commit by<input name="commitBy" type="time" defaultValue="12:00" required /></label>
          </div></fieldset>
          <fieldset><legend>What is the deal?</legend><div className="terms-row deal">
            <label>Discount (%)<input name="discountPercent" type="number" min={1} max={99} defaultValue={DEFAULT_DISCOUNT} required /></label>
            <label>Your floor per cover (S$), never shown to buyers<input name="floorDollars" inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" defaultValue={(defaultFloor / 100).toFixed(2)} required /></label>
            <OfferPreview listPriceCents={listPrice} initialDiscount={DEFAULT_DISCOUNT} initialFloorCents={defaultFloor} />
          </div></fieldset>
          <fieldset><legend>How big is the group?</legend><div className="terms-row">
            <label>Covers available<input name="capacity" type="number" min={1} defaultValue={20} required /></label>
            <label>Unlocks at (covers)<input name="minPool" type="number" min={1} defaultValue={8} required /></label>
            <label>Most covers per agent<input name="perAgentCap" type="number" min={1} defaultValue={4} required /></label>
          </div></fieldset>
          <SubmitButton className="button primary" pendingLabel="Publishing…">Confirm and publish</SubmitButton>
        </form>}
      </div>
    </main>
  );
}
