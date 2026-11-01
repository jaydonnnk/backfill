import Link from "next/link";
import { webDb } from "@/lib/db/client";
import { DEMO_MERCHANT_NAME } from "@/lib/demo/snapshot";
import { publicDemoLedger } from "@/lib/demo/ledger";
import { errorFields, log } from "@/lib/log";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ledger = await (async () => {
    try { return await webDb().transaction(tx => publicDemoLedger(tx, DEMO_MERCHANT_NAME), { isolationLevel: "repeatable read", accessMode: "read only" }); }
    catch (error) { log("error", "landing.ledger_failed", errorFields(error)); return null; }
  })();
  return <main className="page landing">
    <section className="landing-hero">
      <p className="eyebrow">Empty tables. Shared demand.</p>
      <h1>Your restaurant isn&apos;t on Muse.<br /><em>Now it is.</em></h1>
      <p className="lede">Give AI agents your off-peak terms. They pool commitments. You fill the quiet hours.</p>
      <div className="actions"><Link className="button primary" href="/demo">Watch it clear live <span aria-hidden="true">↗</span></Link><Link className="button" href="/evals">Muse Spark vs DeepSeek</Link></div>
      <p className="small muted">Working demo with a synthetic café and simulated buyers.</p>
    </section>
    <section aria-label="Recorded demo totals" className="landing-totals">
      <div><strong>{ledger ? ledger.covers : "—"}</strong><span>Covers filled</span></div>
      <div><strong>{ledger ? `S$${(ledger.buyerShareCents / 100).toFixed(2)}` : "—"}</strong><span>Buyer savings</span></div>
      <div><strong>{ledger ? ledger.agentsCommitted : "—"}</strong><span>Agents committed</span></div>
      <div><strong>{ledger ? ledger.poolsUnlocked : "—"}</strong><span>Pools unlocked</span></div>
      <p className="small muted">{ledger ? "Stored Demo Cafe totals · includes rehearsals · no real payments" : "Demo totals unavailable"}</p>
    </section>
    <section id="how-it-works" className="how-it-works">
      <h2>Quiet hours, spoken for.</h2>
      <div className="steps">
        <article><span className="step-icon" aria-hidden="true">▤</span><p className="eyebrow">01 / Set the table</p><h3>Photo to offer</h3><p>Muse Spark reads your menu. You confirm the terms.</p></article>
        <article><span className="step-icon" aria-hidden="true">◎</span><p className="eyebrow">02 / Gather the group</p><h3>Agents commit together</h3><p>Each accepts your price, window and minimum group size.</p></article>
        <article><span className="step-icon" aria-hidden="true">✓</span><p className="eyebrow">03 / Fill the quiet hours</p><h3>The pool clears</h3><p>Enough demand unlocks the deal. Every saving is recorded.</p></article>
      </div>
    </section>
  </main>;
}
