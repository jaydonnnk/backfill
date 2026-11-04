import Link from "next/link";
import { Kopi } from "@/components/kopi";
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
    <section className="landing-hero" id="kopi-hero">
      <div className="hero-copy">
        <p className="hero-intro"><span aria-hidden="true" />A little company for your quiet hours.</p>
        <h1>Hey, I&apos;m<br />Kopi.<br />Let&apos;s fill<br />the table.</h1>
        <p className="hero-description">Your menu. Your off-peak terms.<br />I&apos;ll show you how AI agents bring a group together, one commitment at a time.</p>
        <div className="actions"><Link className="button" href="/buyer">Try it as a buyer</Link><Link className="button primary" href="/demo">Meet your guide <span aria-hidden="true">↗</span></Link><Link className="button" href="/merchant">I&apos;m a merchant</Link><Link className="hero-text-link" href="#how-it-works">How it works ↓</Link></div>
      </div>
      <div className="hero-portrait"><span className="hero-bubble">Got a quiet afternoon?</span><Kopi label="Kopi, a smiling coffee-cup guide, waves hello" /><span className="hero-cross" aria-hidden="true">+</span></div>
    </section>
    <div className="hero-foot"><span>Built for cafés and restaurants in lull hours</span></div>
    <section aria-label="Recorded demo totals" className="landing-totals">
      <div><strong>{ledger ? ledger.covers : "—"}</strong><span>Covers filled</span></div>
      <div><strong>{ledger ? `S$${(ledger.buyerShareCents / 100).toFixed(2)}` : "—"}</strong><span>Buyer savings</span></div>
      <div><strong>{ledger ? ledger.agentsCommitted : "—"}</strong><span>Agents committed</span></div>
      <div><strong>{ledger ? ledger.poolsUnlocked : "—"}</strong><span>Pools unlocked</span></div>
      <p className="small muted">{ledger ? "Stored Demo Cafe totals · includes rehearsals · no real payments" : "Demo totals unavailable"}</p>
    </section>
    <section id="how-it-works" className="how-it-works">
      <div className="section-heading"><h2>Quiet hours.<br />Good company.</h2><p>From the first menu photo to the last available seat. Kopi comes along.</p></div>
      <div className="steps">
        <article><span className="step-icon" aria-hidden="true">▤</span><p className="eyebrow">01 / Set the table</p><h3>Menu in.<br />Terms set.</h3><p>Muse Spark reads your menu. You confirm the terms.</p></article>
        <article><span className="step-icon" aria-hidden="true">◎</span><p className="eyebrow">02 / Gather the group</p><h3>A few buyers.<br />One full table.</h3><p>Each accepts your price, window and minimum group size.</p></article>
        <article><span className="step-icon" aria-hidden="true">✓</span><p className="eyebrow">03 / Fill the quiet hours</p><h3>Group ready.<br />Deal unlocked.</h3><p>Enough demand unlocks the deal. Every saving is recorded.</p></article>
      </div>
    </section>
    <section className="landing-invite"><div><p className="eyebrow">See the recorded demo</p><h2>A group changes the picture.</h2><p>Compare buyers alone and together, then replay the stored commitments.</p></div><Link className="button primary" href="/demo">Watch it unfold ↗</Link></section>
  </main>;
}
