import Link from 'next/link';
import { KopiMessage } from '@/components/kopi-companion';
import { loadEvaluation } from '@/lib/evals/load';
import type { Run } from '../../../evals/agenticpay/contract';

export const dynamic = 'force-dynamic';
const money = (cents: number) => `S$${(cents/100).toFixed(2)}`;
const usd = (nano: number, digits = 4) => `US$${(nano/1e9).toFixed(digits)}`;
const isSpark = (model: string) => model.includes('muse-spark');

// What each model did in the stored run. Every figure derives from validated episodes and llm_calls.
function measure(run: Run, model: string) {
  const summary = run.summary.find(s => s.model === model)!;
  const calls = run.calls.filter(c => c.model === model), episodes = run.episodes.filter(e => e.model === model);
  const cost = summary.costNanoUsd;
  return { summary, calls, episodes, valid: calls.filter(c => c.ok).length, perCall: cost === null || !calls.length ? null : cost / calls.length, worstEpisode: episodes.some(e => e.costNanoUsd === null) ? null : Math.max(0, ...episodes.map(e => e.costNanoUsd ?? 0)) };
}

const links = [
  ['▤', '01 / Menu in', 'Spark reads the menu photo.', 'A merchant uploads a menu. Muse Spark turns the photo into dishes and prices to build the offer from.'],
  ['◎', '02 / Buyers arrive', 'Agents join from the Muse app.', 'Backfill is an MCP server. A real Muse account added it as a custom connector, found the offer and committed two covers after asking its user.'],
  ['⇄', '03 / Spark negotiates', 'Every counter-offer is Spark’s.', 'Muse Spark prices each round for the merchant. It never sees the hidden floor; the domain guard checks every proposal.'],
  ['✓', '04 / Wonder re-plans', 'Muse Wonder tunes the next offer.', 'After a pool clears, Muse Wonder proposes new terms. The owner must reply YES before anything publishes.'],
] as const;

function Measured({ run }: { run: Run }) {
  const spark = run.config.models.find(isSpark), rival = run.config.models.find(m => !isSpark(m));
  if (!spark || !rival) return null;
  const s = measure(run, spark), r = measure(run, rival);
  const sameOutcomes = s.summary.deals === r.summary.deals && s.summary.savingsCents === r.summary.savingsCents && s.summary.refusals === r.summary.refusals;
  return <>
    <section className="spark-proof" aria-labelledby="proof-heading">
      <div className="section-heading"><h2 id="proof-heading">Spark on the job</h2><p>Stored run {run.runId} · {run.createdAt.slice(0,10)} UTC · {s.episodes.length} synthetic cafe negotiations · reasoning effort {run.config.reasoningEffort ?? 'provider default'}, as in production</p></div>
      <dl className="kpi-strip spark-kpis">
        <div><dt>Valid replies</dt><dd>{s.valid} / {s.calls.length}</dd></div>
        <div><dt>Deals closed</dt><dd>{s.summary.deals} <small>of {s.summary.scheduled}</small></dd></div>
        <div><dt>Buyer savings</dt><dd>{money(s.summary.savingsCents)}</dd></div>
        <div><dt>Costliest negotiation</dt><dd>{s.worstEpisode === null ? 'Unavailable' : usd(s.worstEpisode)}</dd></div>
      </dl>
      <div className="eval-episodes">{s.episodes.map(e => <details key={e.id}><summary><span>{e.scenarioId}</span><span className={e.outcome==='deal'?'good':e.outcome==='failed'?'bad':'muted'}>{e.outcome.replace('_',' ')}</span><span>{money(e.savingsCents)} saved</span><span>{e.costNanoUsd === null ? 'Cost unavailable' : usd(e.costNanoUsd)}</span></summary><div className="eval-rounds">{e.rounds.map(x=><p key={x.round}>Round {x.round}: buyer bids {money(x.bidCents)} → Spark proposes {x.proposalCents===null?'nothing valid':money(x.proposalCents)} → counter {money(x.counterCents)}. {x.refusal ? 'The guard refused a price below the hidden floor and held the previous counter.' : 'Guard accepted.'} <span className="small">llm_calls #{x.callIds.join(', #')}</span></p>)}</div></details>)}</div>
    </section>
    <section className="spark-rival" aria-labelledby="rival-heading">
      <div className="section-heading"><h2 id="rival-heading">Why not a cheaper model?</h2><p>We ran DeepSeek V4.1 Flash on the same scenarios as a check.</p></div>
      <table className="rival-table">
        <thead><tr><th scope="col"></th><th scope="col" className="spark">Muse Spark 1.3</th><th scope="col">DeepSeek V4.1 Flash</th></tr></thead>
        <tbody>
          <tr><th scope="row">Deals and savings</th><td>{s.summary.deals} · {money(s.summary.savingsCents)}</td><td>{r.summary.deals} · {money(r.summary.savingsCents)}</td></tr>
          <tr><th scope="row">Floor refusals by the guard</th><td>{s.summary.refusals}</td><td>{r.summary.refusals}</td></tr>
          <tr><th scope="row">Average cost per reply</th><td>{s.perCall === null ? 'Unavailable' : usd(s.perCall)}</td><td>{r.perCall === null ? 'Unavailable' : usd(r.perCall)}</td></tr>
          <tr><th scope="row">Same family as Muse app buyers and Muse Wonder</th><td>Yes</td><td>No, a separate vendor</td></tr>
        </tbody>
      </table>
      <p className="spark-verdict">{sameOutcomes ? 'Same deals, same savings, same guard decisions. ' : ''}DeepSeek is cheaper per reply, but Spark’s most expensive negotiation still cost {s.worstEpisode === null ? 'an unmeasured amount' : `under ${s.worstEpisode < 1e7 ? 'one US cent' : usd(s.worstEpisode, 2)}`}. That buys a merchant agent from the same family as the Muse app its buyers already use.</p>
    </section>
  </>;
}

export default async function Evals({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await loadEvaluation((await searchParams).preview === 'synthetic');
  const run = state.kind === 'ready' ? state.run : null;
  const synthetic = run?.kind === 'synthetic';
  const text = synthetic ? 'Synthetic preview only. These are not model results.' : state.kind === 'invalid' ? 'The stored run could not be verified, so its numbers are hidden.' : run ? 'Muse Spark prices every counter. Here are the receipts.' : 'Why Muse Spark runs our counters. Measured run coming.';
  return <main className="page eval-page"><KopiMessage pose={state.kind==='invalid'?'shield':'watching'} text={text}/>
    <header className="eval-heading"><p className="eyebrow">BACKFILL / WHY MUSE SPARK</p><h1>Muse Spark<br/><span className="spark">runs the counter.</span></h1><p className="lede">The model behind every merchant price, and the Muse family around it.</p></header>
    {(synthetic || state.kind === 'invalid') && <div className={`eval-notice ${synthetic?'wait':''}`} role="status"><strong>{synthetic ? 'SYNTHETIC TEST FIXTURE · NOT MODEL RESULTS' : 'RESULTS UNAVAILABLE'}</strong><p>{text}</p></div>}
    <section aria-labelledby="links-heading"><div className="section-heading"><h2 id="links-heading">How Backfill links it together</h2><p>Four Muse touchpoints, one pool of quiet-hour seats.</p></div>
      <div className="steps steps-4">{links.map(([icon, eyebrow, title, body]) => <article key={eyebrow}><span className="step-icon" aria-hidden="true">{icon}</span><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    {run && !synthetic ? <Measured run={run}/> : !synthetic && <section><h2>Spark on the job</h2><p className="eval-placeholder">{state.kind === 'invalid' ? 'Measured results are hidden until the stored run verifies.' : 'No verified run is published yet.'}</p></section>}
    {synthetic && run && <Measured run={run}/>}
    <section className="eval-method"><h2>Where the numbers come from</h2><p>Three synthetic cafe scenarios, each with a scripted buyer and at most three rounds. Spark gets the live merchant agent’s prompt template, 1024-token budget and low reasoning effort. The domain guard, not the model, enforces the hidden floor.</p><p>Every figure is computed from the stored run file and checked against its recorded model calls, including their provider-reported cost. It shows Spark fits the job; three scenarios do not rank models.</p><Link className="button" href="/demo">See Spark in the recorded demo ↗</Link></section>
  </main>;
}
