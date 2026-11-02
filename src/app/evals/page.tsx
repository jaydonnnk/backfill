import Link from 'next/link';
import { KopiMessage } from '@/components/kopi-companion';

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

const roles = [
  ['Muse Spark', 'Reads the menu photo, proposes every merchant counter-offer, and decides for each simulated buyer.'],
  ['Muse Wonder', 'Proposes revised terms after a slot sells out. Nothing changes until the owner approves it.'],
] as const;

export default function Evals() {
  return <main className="page eval-page"><KopiMessage pose="watching" text="Why Muse Spark runs our counters."/>
    <header className="eval-heading"><p className="eyebrow">BACKFILL / WHY MUSE SPARK</p><h1>Muse Spark<br/><span className="spark">runs the counter.</span></h1></header>
    <section className="eval-process" aria-labelledby="links-heading">
      <div className="process-index"><p className="eyebrow">From menu to full table</p><h2 id="links-heading">How it comes together.</h2><nav aria-label="How Backfill works">{links.map(([label], i)=><a key={label} href={`#process-${i+1}`}><span>0{i+1}</span>{label}</a>)}</nav></div>
      <div className="process-chapters">{links.map(([label,title,body,labels], i)=><article id={`process-${i+1}`} key={label}><p className="eyebrow">0{i+1} / {label}</p><h3>{title}</h3><p>{body}</p><ProcessVisual step={i} labels={labels}/></article>)}</div>
    </section>
    <section className="eval-method" aria-labelledby="models-heading">
      <h2 id="models-heading">What each model does</h2>
      <dl className="model-roles">{roles.map(([model, role])=><div key={model}><dt>{model}</dt><dd>{role}</dd></div>)}</dl>
      <p>Both are called through the Meta Model API. Every call is stored with its model, token counts, latency and cost, and the diagnostics page lists them. A price is never taken on the model&rsquo;s word: each proposal is checked in code against the merchant&rsquo;s private minimum, and one that breaches it is refused and never signed.</p>
      <div className="eval-cta"><Link className="button" href="/system">See every logged model call ↗</Link><Link href="/demo">See Spark in the recorded demo ↗</Link></div>
    </section>
  </main>;
}
