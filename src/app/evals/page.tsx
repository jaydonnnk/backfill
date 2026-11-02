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
  ['Menu in', 'A photo becomes an offer.', 'Upload your menu. Spark picks out the dishes and prices for you to review.', ['Menu photo', 'Spark reads', 'Your offer']],
  ['Buyers arrive', 'A group starts to form.', 'Buyers use their Muse agents to find your offer and reserve seats, with their permission.', ['Muse agents', 'Seats reserved', 'One group']],
  ['Spark negotiates', 'Find a price that works.', 'Spark handles the back-and-forth. Backfill blocks any price below your private minimum.', ['Buyer bids', 'Spark counters', 'Price checked']],
  ['Wonder re-plans', 'Make the next offer better.', 'Wonder suggests new terms after a group fills. You approve them before they go live.', ['Group filled', 'Wonder suggests', 'You approve']],
] as const;

function ProcessVisual({ step, labels }: { step: number; labels: readonly string[] }) {
  return <div className={`process-visual process-visual-${step}`} aria-hidden="true">
    {step === 0 ? <svg viewBox="0 0 360 150"><rect x="30" y="15" width="95" height="120"/><path d="M48 42h58M48 62h35M48 82h58M48 102h35M148 75h55m-12-12 12 12-12 12"/><rect x="230" y="30" width="100" height="90"/><path d="m250 76 15 15 35-35"/></svg>
    : step === 1 ? <svg viewBox="0 0 360 150"><circle cx="55" cy="35" r="15"/><circle cx="55" cy="115" r="15"/><circle cx="305" cy="35" r="15"/><circle cx="305" cy="115" r="15"/><path d="m75 40 55 25m-55 45 55-25m155-45-55 25m55 45-55-25"/><rect x="135" y="45" width="90" height="60"/><path d="M155 30v-15m50 15v-15m-50 105v15m50-15v15"/></svg>
    : step === 2 ? <svg viewBox="0 0 360 150"><path d="M25 20h130v65H70L45 105V85H25ZM205 45h130v65h-20v20l-25-20h-85ZM48 43h75M48 61h45M228 68h75M228 86h45"/><path d="M163 100v25l17 14 17-14v-25l-17-8Z"/></svg>
    : <svg viewBox="0 0 360 150"><path d="M40 125V95h40v30m20 0V70h40v55m20 0V35h40v90M30 125h185"/><rect x="250" y="45" width="70" height="70"/><path d="m265 79 13 13 27-30M50 65l120-45m-22-8 22 8-8 22"/></svg>}
    <div>{labels.map(label => <span key={label}>{label}</span>)}</div>
  </div>;
}

function Measured({ run }: { run: Run }) {
  const spark = run.config.models.find(isSpark);
  if (!spark) return null;
  const s = measure(run, spark);
  return <>
    <section className="spark-proof" aria-labelledby="proof-heading">
      <div className="section-heading"><h2 id="proof-heading">Spark on the job</h2><p>{run.kind === 'synthetic' ? `Illustrative preview · ${s.episodes.length} café examples.` : `${s.episodes.length} simulated café negotiations. Here’s how Spark did.`}</p></div>
      <dl className="kpi-strip spark-kpis">
        <div><dt>Valid replies</dt><dd>{s.valid} / {s.calls.length}</dd><meter min="0" max={Math.max(1,s.calls.length)} value={s.valid} aria-label="Valid replies"/></div>
        <div><dt>Deals closed</dt><dd>{s.summary.deals} <small>of {s.summary.scheduled}</small></dd><meter min="0" max={Math.max(1,s.summary.scheduled)} value={s.summary.deals} aria-label="Deals closed"/></div>
        <div><dt>Buyer savings</dt><dd>{money(s.summary.savingsCents)}</dd></div>
        <div><dt>Costliest negotiation</dt><dd>{s.worstEpisode === null ? 'Unavailable' : usd(s.worstEpisode)}</dd></div>
      </dl>
      <div className="spark-stories">{s.episodes.map((e, index) => <article key={e.id}>
        <p className="eyebrow">Café test {String(index+1).padStart(2,'0')}</p>
        <h3 className={e.outcome==='deal'?'good':e.outcome==='failed'?'bad':'muted'}>{e.outcome==='deal'?'Deal agreed':e.outcome==='failed'?'Test failed':'No deal'}</h3>
        <div className="story-saving"><span aria-hidden="true">{e.outcome==='deal'?'✓':'—'}</span><strong>{money(e.savingsCents)}</strong><span>buyer savings</span></div>
        <details><summary>See the negotiation</summary><div className="eval-rounds"><p className="small">Scenario: {e.scenarioId} · Cost: {e.costNanoUsd === null ? 'unavailable' : usd(e.costNanoUsd)}</p>{e.rounds.map(x=><p key={x.round}>Round {x.round}: the buyer offered {money(x.bidCents)}. Spark proposed {x.proposalCents===null?'no usable price':money(x.proposalCents)}. {x.refusal ? 'Backfill blocked a price below the merchant’s minimum.' : 'The price passed the merchant’s rules.'} The counter-offer was {money(x.counterCents)}.</p>)}</div></details>
      </article>)}</div>
      <details className="run-record"><summary>About this test run</summary><p className="small">Run {run.runId} · {run.createdAt.slice(0,10)} UTC · {s.calls.length} recorded replies. Costs are checked against the provider’s records.</p></details>
    </section>
  </>;
}

export default async function Evals({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const state = await loadEvaluation((await searchParams).preview === 'synthetic');
  const run = state.kind === 'ready' ? state.run : null;
  const synthetic = run?.kind === 'synthetic';
  const text = synthetic ? 'Follow the journey from menu to full table.' : state.kind === 'invalid' ? 'The stored run could not be verified, so its numbers are hidden.' : run ? 'Muse Spark prices every counter. Here are the receipts.' : 'Why Muse Spark runs our counters. Measured run coming.';
  return <main className="page eval-page"><KopiMessage pose={state.kind==='invalid'?'shield':'watching'} text={text}/>
    <header className="eval-heading"><p className="eyebrow">BACKFILL / WHY MUSE SPARK</p><h1>Muse Spark<br/><span className="spark">runs the counter.</span></h1></header>
    {state.kind === 'invalid' && <div className="eval-notice" role="status"><strong>RESULTS UNAVAILABLE</strong><p>{text}</p></div>}
    <section className="eval-process" aria-labelledby="links-heading">
      <div className="process-index"><p className="eyebrow">From menu to full table</p><h2 id="links-heading">How it comes together.</h2><nav aria-label="How Backfill works">{links.map(([label], i)=><a key={label} href={`#process-${i+1}`}><span>0{i+1}</span>{label}</a>)}</nav></div>
      <div className="process-chapters">{links.map(([label,title,body,labels], i)=><article id={`process-${i+1}`} key={label}><p className="eyebrow">0{i+1} / {label}</p><h3>{title}</h3><p>{body}</p><ProcessVisual step={i} labels={labels}/></article>)}</div>
    </section>
    {run && !synthetic ? <Measured run={run}/> : !synthetic && <section><h2>Spark on the job</h2><p className="eval-placeholder">{state.kind === 'invalid' ? 'Measured results are hidden until the stored run verifies.' : 'No verified run is published yet.'}</p></section>}
    {synthetic && run && <Measured run={run}/>}
    <section className="eval-method"><h2>Where the numbers come from</h2><p>We tested Spark in three made-up café situations, with a simulated buyer and up to three rounds of offers. It used the same instructions and settings as the app. Backfill checked every price against the merchant’s private minimum.</p><p>The savings and costs come from saved test results, checked against the actual AI usage records. This is a small demonstration of how Spark handles the job, not proof that it will perform the same way in every café.</p><Link className="button" href="/demo">See Spark in the recorded demo ↗</Link></section>
  </main>;
}
