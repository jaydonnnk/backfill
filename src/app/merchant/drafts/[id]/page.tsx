import { merchantStep } from "@/components/merchant-kopi";
import { KopiMessage } from "@/components/kopi-companion";
import { notFound } from "next/navigation";
import { dollars, WEEKDAY_NAMES } from "@/lib/commitments/service";
import { webDb } from "@/lib/db/client";
import { getDraft } from "@/lib/onboarding/service";
import { publish } from "../../actions";
import { currentMerchant } from "../../session";
import { SubmitButton } from "../../submit-button";

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

const field = "flex flex-col gap-1 text-sm";
const input = "rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-base text-[var(--foreground)]";

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

  return (
    <main className="workspace-page">
      <header className="flex flex-col gap-1">
        <a href="/merchant" className="text-sm text-[var(--muted)] underline underline-offset-4">
          Back to {merchant.name}
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">Check your menu</h1>
      </header>

      <KopiMessage pose={view.ruleId ? "happy" : view.verdict !== "ok" ? "shield" : "watching"} text={view.ruleId ? "This menu has a published offer." : view.verdict === "ok" ? "Check the prices. You choose the terms." : "This menu needs another look."} />
      <ol className="onboarding-steps" aria-label="Merchant journey"><li aria-current={step === 1 ? "step" : undefined}>01 / Read your menu</li><li aria-current={step === 2 ? "step" : undefined}>02 / Confirm your terms</li><li aria-current={step === 3 ? "step" : undefined}>03 / Follow your offers</li></ol>
      {notice && (
        <p role="status" className="rounded-md border border-[var(--border)] px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-[var(--border)] p-5">
        <h2 className="text-lg font-medium">What Muse Spark read</h2>
        {view.draft.items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No items.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {view.draft.items.map((item, i) => (
              <li key={i} className={`flex justify-between gap-3 rounded px-2 py-1 ${cover.has(i) ? "bg-[var(--highlight)] font-medium" : ""}`}>
                <span className="min-w-0 break-words">{item.name}</span>
                <span className="shrink-0 tabular-nums">{dollars(item.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
        {listPrice !== null ? (
          <p className="text-sm">
            One cover: <span className="font-medium">{view.draft.cover.description}</span>, list price <span className="font-medium">{dollars(listPrice)}</span>, the sum of the
            highlighted printed prices.
          </p>
        ) : (
          <p className="text-sm">{REFUSAL_TEXT[view.verdict] ?? "This read cannot be used."}</p>
        )}
      </section>

      {view.ruleId !== null ? (
        <p className="text-sm">
          Published.{" "}
          <a href="/merchant" className="underline underline-offset-4">
            See your offers
          </a>
          .
        </p>
      ) : (
        listPrice !== null && (
          <form action={publish} className="flex flex-col gap-5 rounded-lg border border-[var(--border)] p-5">
            <input type="hidden" name="draftId" value={view.id} />
            <h2 className="text-lg font-medium">Set your off-peak terms</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={field}>
                Day
                <select name="weekday" defaultValue="2" className={input}>
                  {WEEKDAY_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={field}>
                Discount (%)
                <input name="discountPercent" type="number" min={1} max={99} defaultValue={25} required className={input} />
              </label>
              <label className={field}>
                Starts
                <input name="start" type="time" defaultValue="14:00" required className={input} />
              </label>
              <label className={field}>
                Ends
                <input name="end" type="time" defaultValue="17:00" required className={input} />
              </label>
              <label className={field}>
                Buyers commit by
                <input name="commitBy" type="time" defaultValue="12:00" required className={input} />
              </label>
              <label className={field}>
                Covers available
                <input name="capacity" type="number" min={1} defaultValue={20} required className={input} />
              </label>
              <label className={field}>
                Unlocks at (covers)
                <input name="minPool" type="number" min={1} defaultValue={8} required className={input} />
              </label>
              <label className={field}>
                Most covers per agent
                <input name="perAgentCap" type="number" min={1} defaultValue={4} required className={input} />
              </label>
              <label className={`${field} sm:col-span-2`}>
                Your floor per cover (S$), never shown to buyers
                <input name="floorDollars" inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" defaultValue={((listPrice * 0.7) / 100).toFixed(2)} required className={input} />
              </label>
            </div>
            <SubmitButton className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] hover:opacity-90" pendingLabel="Publishing…">
              Confirm and publish
            </SubmitButton>
          </form>
        )
      )}
    </main>
  );
}
