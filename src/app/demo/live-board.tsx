"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoMuse, DemoScene, DemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoLedger } from "@/lib/demo/ledger";
import { parseDemoSnapshot } from "@/lib/demo/protocol";
import { followFeedHealth, type FeedState } from "./live-feed";

import { KopiMessage, useKopiMotion } from "@/components/kopi-companion";
import { demoKopiCue } from "@/components/kopi-state";

import { advanceKopi, initialKopiObservation } from '@/components/kopi-events';

const dollars = (cents: number) => `S$${(cents / 100).toFixed(2)}`;
const percent = (bps: number) => `${bps / 100}%`;
const sgTime = (iso: string) => new Date(iso).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Ring({ value, minimum, good }: { value: number; minimum: number; good: boolean }) {
  const fraction = Math.min(1, value / minimum);
  return <svg viewBox="0 0 240 240" className={`pool-ring ${good ? "good" : "wait"}`} role="img" aria-label={`${value} covers, minimum ${minimum}`}>
    <circle cx="120" cy="120" r="102" className="ring-track" />
    <circle cx="120" cy="120" r="102" className="ring-value" pathLength="100" strokeDasharray={`${fraction * 100} 100`} transform="rotate(-90 120 120)" />
    <text x="120" y="116" textAnchor="middle" className="ring-number">{value}</text>
    <text x="120" y="145" textAnchor="middle" className="ring-caption">covers / min {minimum}</text>
  </svg>;
}

function Scene({ scene, now, shown, savings }: { scene: DemoScene; now: number | null; shown: number; savings: number | null }) {
  const buyers = [...scene.buyers].sort((a, b) => a.committedAt.localeCompare(b.committedAt)).slice(0, shown);
  const playing = shown < scene.buyers.length;
  const covers = buyers.reduce((sum, buyer) => sum + buyer.covers, 0);
  const complete = !playing && scene.phase === "cleared";
  const reached = covers >= scene.minPoolCovers;
  const deadlinePassed = now !== null && now >= Date.parse(scene.commitBy);
  const result = complete ? scene.pooled.unlocked ? "The group unlocked the offer." : "This group didn’t unlock the offer." : reached ? "Minimum reached. Waiting for confirmation." : "A few more diners. A better price.";
  return <>
    <section className="booking-stage" aria-label="Group booking progress">
      <div className="booking-offer">
        <p className="eyebrow">{scene.merchantName}</p>
        <h2>A better price,<br/>together.</h2>
        <p className="booking-price">{dollars(scene.offerPriceCents)} <span>per person</span></p>
        <p className="booking-discount"><s>{dollars(scene.listPriceCents)}</s><span>{percent(scene.discountBps)} off</span></p>
        <dl className="booking-terms"><div><dt>Visit</dt><dd>{scene.visitDate}{scene.visitWindow && <span>{scene.visitWindow} SGT</span>}</dd></div><div><dt>The group needs</dt><dd>{scene.minPoolCovers} diners</dd></div></dl>
        <p className="small">Separate parties commit to their own terms. See approval evidence below.</p>
      </div>
      <div className="booking-table" id="booking-progress">
        <p className="eyebrow">{playing ? "Replaying the bookings" : complete ? "Recorded group" : "The group so far"}</p>
        <p className="booking-count"><strong>{covers}</strong> diners joined <span>· {scene.minPoolCovers} needed</span></p>
        <div className="booking-seats" aria-hidden="true">{Array.from({length: Math.min(scene.minPoolCovers,24)}, (_,i)=><span key={i} className={`booking-seat ${i<covers?'occupied':''}`}><svg viewBox="0 0 48 48"><path d="M12 9h24v19H12zM8 29h32v7H8zM12 36v8m24-8v8"/></svg></span>)}</div>
        {scene.minPoolCovers>24 && <p className="small">First 24 seats shown. The counter includes everyone.</p>}
        <progress max={scene.minPoolCovers} value={Math.min(covers,scene.minPoolCovers)} aria-label={`${covers} diners joined; ${scene.minPoolCovers} needed`}/>
        <p className="booking-cue" aria-live="polite">{playing ? buyers.length ? `A booking for ${buyers.at(-1)?.covers} joins the group.` : "Start with an empty table." : complete ? scene.pooled.soldOut ? "All available seats filled." : "This round has finished." : deadlinePassed ? "Booking closed. Waiting for the result." : `${Math.max(0,scene.minPoolCovers-covers)} more needed before ${sgTime(scene.commitBy)} SGT.`}</p>
      </div>
      <div className={`booking-outcome ${complete ? scene.pooled.unlocked ? 'good' : 'wait' : ''}`} role="status">
        <h3>{result}</h3>
        {complete ? <p>{scene.pooled.unlocked ? <><strong>{scene.pooled.filledCovers} diners confirmed</strong><span className="outcome-divider"> / </span>{savings === null ? 'Savings unavailable' : `${dollars(savings)} saved by this group`}</> : 'No bookings were confirmed for this group.'}</p> : <p>{reached ? 'Backfill checks the deadline and available seats before confirming bookings.' : 'Separate bookings count together toward the café’s minimum.'}</p>}
        {complete && scene.pooled.unlocked && covers>scene.pooled.filledCovers && <p className="small">{covers} diners requested seats; {scene.pooled.filledCovers} could be confirmed.</p>}
      </div>
    </section>
    <Roster scene={scene} buyers={buyers} playing={playing} />
    {!playing && scene.pooled.soldOut && <details className="demo-details wonder-panel"><summary>What could the café offer next?</summary><div className="demo-detail-content"><p className="eyebrow">Muse Wonder · {scene.plan?.provenance==='recorded_replay'?'recorded Wonder plan replayed':scene.plan?.provenance==='fixture'?'scripted fixture':'stored provenance unavailable'}</p>{!scene.plan ? <p>No Wonder plan stored yet.</p> : scene.plan.verdict==='ok' ? <><div className="plan-diff"><div><span>Discount</span><strong>{percent(scene.discountBps)} → {scene.plan.discountBps===null?'Unknown':percent(scene.plan.discountBps)}</strong></div><div><span>Seats</span><strong>{scene.pooled.filledCovers} → {scene.plan.capacityCovers}</strong></div><div><span>Minimum diners</span><strong>{scene.minPoolCovers} → {scene.plan.minPoolCovers}</strong></div></div><p>{scene.plan.applied?'Approved by the café.':'The café must approve these terms before they go live.'}</p></> : <p>The suggestion didn’t meet the café’s rules. Its offer stays unchanged.</p>}</div></details>}
  </>;
}

const RESULT_MARK = { filled: ['✓', 'Filled'], not_filled: ['×', 'Not filled'], pending: ['…', 'Pending'], proposal_only: ['?', 'Proposal only'] } as const;

function SeatPips({ covers }: { covers: number }) {
  return <span className="seat-row" role="img" aria-label={`${covers} ${covers === 1 ? 'seat' : 'seats'}`}>{Array.from({ length: Math.min(covers, 12) }, (_, i) => <span key={i} className="on" />)}</span>;
}

// One tile per party. Opening a tile spans the row and shows that party's stored evidence.
function Roster({ scene, buyers, playing }: { scene: DemoScene; buyers: DemoScene['buyers']; playing: boolean }) {
  const place = new Map(buyers.map((b, i) => [b.agentId, i]));
  const rank = (t: NonNullable<DemoScene['trail']>[number]) => place.get(t.final?.partyId ?? t.terms?.partyId ?? '') ?? buyers.length;
  const trail = [...(scene.trail ?? [])].sort((a, b) => rank(a) - rank(b));
  const alone = scene.buyers.length > 0 && scene.buyers.every(b => !b.soloUnlocks);
  return <section className="roster" aria-label="Parties in this group">
    <div className="roster-head">
      <h2>Who joined</h2>
      <p>{scene.buyers.length} separate parties{alone ? '. None could unlock this alone.' : '.'}</p>
    </div>
    {playing || !trail.length ? <div className="roster-grid">{buyers.map(b => <div className="party-tile" key={b.agentId}>
      <span className="party-top"><SeatPips covers={b.covers} /><span className="party-state">{playing ? 'Joining' : RESULT_MARK[b.outcome][1]}</span></span>
      <span className="party-ask">{b.label}</span>
    </div>)}</div> : <div className="roster-grid">{trail.map(t => {
      const covers = t.final?.covers ?? t.terms?.covers ?? 0;
      const [mark, word] = RESULT_MARK[t.result];
      return <details className={`trail-party party-${t.result}`} key={t.id}>
        <summary>
          <span className="party-top"><SeatPips covers={covers} /><span className="party-state"><span aria-hidden="true">{mark}</span> {word}</span></span>
          <span className="party-ask">{t.request ?? t.final?.partyId ?? t.terms?.partyId}</span>
        </summary>
        <dl className="trail-fields">
          <div><dt>Model&apos;s answer</dt><dd>{t.output ? `${t.output.covers} covers. ${t.output.reason}` : 'Unavailable for this commitment'}<small>{t.provenance === 'fixture' ? 'Authored synthetic fixture, no model call' : t.provenance === 'recorded_replay' ? 'Historical recorded output replayed' : 'Decision provenance unavailable'}</small></dd></div>
          <div><dt>Proposed terms</dt><dd>{t.terms ? `v${t.terms.termsVersion} · ${t.terms.visitDate} · ${t.terms.covers} covers · ${dollars(t.terms.pricePerCoverCents)} each · ${dollars(t.terms.totalCents)} total` : 'Unavailable'}</dd></div>
          <div><dt>Approval evidence</dt><dd>{t.approval === 'scripted' ? 'Scripted authorization matches exact terms' : t.approval === 'mismatch' ? 'Approval mismatch. No matching authorization' : 'Unavailable. No approval established'}</dd></div>
          <div><dt>Submitted commitment</dt><dd>{t.commitmentId ?? 'None. Proposal only'}{t.final && <small>{`v${t.final.termsVersion} · ${t.final.visitDate} · ${t.final.covers} covers · ${t.final.pricePerCoverCents === null ? 'Accepted price unavailable' : `${dollars(t.final.pricePerCoverCents)} each · ${dollars(t.final.pricePerCoverCents * t.final.covers)} total`}`}</small>}</dd></div>
          <div><dt>Result</dt><dd>{t.result === 'not_filled' ? 'Not filled. No discounted booking or savings' : t.result === 'proposal_only' ? 'Proposal only. No commitment or confirmed booking' : t.result === 'pending' ? 'Pending. No confirmed booking yet' : 'Filled at settlement. Simulated checkout'}</dd></div>
          <div><dt>Record links</dt><dd>Party {t.final?.partyId ?? t.terms?.partyId ?? 'unavailable'}<small>Run {t.terms?.runId ?? 'unavailable'}</small><small>Rule {t.final?.ruleId ?? t.terms?.ruleId} · occurrence {t.final?.visitDate ?? t.terms?.visitDate}</small><small>Trail {t.id}</small></dd></div>
        </dl>
      </details>;
    })}</div>}
    {!playing && <p className="roster-note">Simulated buyers. Per-party decision provenance and approval evidence open from each tile. Scripted authorization records a local script accepting exact terms. It does not establish a real person&apos;s approval. Missing records remain unavailable.</p>}
  </section>;
}

function Ledger({ ledger }: { ledger: DemoLedger | null }) {
  return <section className="panel ledger-panel"><div className="panel-heading"><div><p className="eyebrow">The savings ledger</p><h2>Every dollar accounted for.</h2></div>{ledger && <span className={`chip ${ledger.reconciled ? "good" : "bad"}`}>{ledger.reconciled ? "Totals reconcile" : "Reconciliation incomplete"}</span>}</div><p className="small muted">All stored Demo Cafe pools, including rehearsals. No real payments.</p>{ledger && ledger.pools.length > 0 ? <><p className="ledger-total">{dollars(ledger.buyerShareCents)} <span>saved by buyers</span></p>{ledger.pools.map((pool, i) => {
    const total = pool.buyerShareCents + pool.agentShareCents + pool.networkShareCents;
    return <div key={`${pool.ruleId}:${pool.visitDate}`} className="ledger-row"><div className="panel-heading"><span>Pool {i + 1} · {pool.visitDate}</span><span>{pool.covers} covers · {pool.reconciled ? "Reconciled" : "Incomplete"}</span></div><div className="split-bar" role="img" aria-label={`Buyer ${dollars(pool.buyerShareCents)}, agent ${dollars(pool.agentShareCents)}, network ${dollars(pool.networkShareCents)}`}><span style={{ width: `${total ? pool.buyerShareCents / total * 100 : 0}%` }} /><span style={{ width: `${total ? pool.agentShareCents / total * 100 : 0}%` }} /><span style={{ width: `${total ? pool.networkShareCents / total * 100 : 0}%` }} /></div><div className="split-labels"><span>Buyer {dollars(pool.buyerShareCents)}</span><span>Agent {dollars(pool.agentShareCents)}</span><span>Network {dollars(pool.networkShareCents)}</span></div></div>;
  })}</> : <p className="muted">No stored ledger entries yet.</p>}</section>;
}

function Muse({ muse }: { muse: DemoMuse }) {
  return <section className="panel muse-panel"><div><span className="chip spark">Stored MCP commitment</span><h2>One committed Muse user</h2><p>A person&apos;s agent committed {muse.covers} covers at {muse.merchantName} for {muse.visitDate} through the MCP connector.</p><p className="small muted">{muse.status.replaceAll("_", " ")} · a separate pool from the scene above</p></div><Ring value={muse.pooledCovers} minimum={muse.minPoolCovers} good={muse.status === "filled"} /></section>;
}

export function LiveBoard({ initial, unavailable = false }: { initial: DemoSnapshot; unavailable?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [feedState, setFeedState] = useState<FeedState>(unavailable ? "stale" : "connecting");
  const [replay, setReplay] = useState<{ snapshot: DemoSnapshot; shown: number } | null>(null);
  const now = useNow();
  const animate = useKopiMotion();
  const observation = useRef(initialKopiObservation(initial, unavailable ? 'stale' : 'connecting'));
  const replaying = useRef(false);
  useEffect(() => {
    let source: EventSource | null = null;
    function health(state: FeedState) {
      setFeedState(state);
      if (state !== 'live') {
        observation.current = { ...observation.current, feed: state };
        animate?.({ kind: 'clear' });
      }
    }
    function connect() {
      source?.close();
      health('connecting');
      source = new EventSource("/api/demo/stream");
      followFeedHealth(source, health);
      source.onmessage = (event: MessageEvent<string>) => {
        const next = parseDemoSnapshot(event.data);
        if (!next) { health('stale'); return; }
        const result = advanceKopi(observation.current, next, 'live', replaying.current, Date.now());
        observation.current = result.state;
        animate?.(result.queueAction);
        setSnapshot(next);
      };
    }
    function offline() { source?.close(); health('stale'); }
    window.addEventListener('offline', offline);
    window.addEventListener('online', connect);
    if (navigator.onLine) connect(); else offline();
    return () => {
      source?.close();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', connect);
    };
  }, [animate]);
  const replayLength = replay?.snapshot.scene?.buyers.length ?? 0;
  const shown = replay?.shown;
  useEffect(() => {
    if (shown === undefined || shown >= replayLength) return;
    const timer = setTimeout(() => setReplay(previous => previous ? { ...previous, shown: previous.shown + 1 } : null), 450);
    return () => clearTimeout(timer);
  }, [shown, replayLength]);
  const view = replay?.snapshot ?? snapshot;
  const playing = replay !== null && replay.shown < replayLength;
  function startReplay() {
    replaying.current = true;
    animate?.({ kind: 'clear' });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReplay({ snapshot, shown: reducedMotion ? snapshot.scene?.buyers.length ?? 0 : 0 });
    document.getElementById("booking-progress")?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
  }
  return <main className="page demo-page demo-simple">
    <KopiMessage {...demoKopiCue(view.scene, feedState, replay !== null)} />
    <header className="demo-top"><div className="demo-intro"><h1>Quiet café. <em>Full table.</em></h1><p>Separate bookings unlock one off-peak deal. Buyers are simulated.</p></div><div className="demo-toolbar"><div className="actions"><button className="button primary" onClick={startReplay} disabled={!snapshot.scene || snapshot.scene.buyers.length === 0}>{replay ? 'Replay' : 'Watch how it works'} <span aria-hidden="true">↗</span></button>{replay && <button className="button" onClick={() => { replaying.current = false; observation.current = { ...observation.current, replay: true }; setReplay(null); }}>Back to latest</button>}</div><div className="demo-feed"><p className="feed-state" role="status"><span className={`feed-dot ${feedState}`} />{replay ? 'Recorded playback' : feedState === 'live' ? 'Latest saved bookings' : feedState === 'stale' ? 'Updates paused · last saved view' : 'Connecting to updates'}</p>{view.scene?.trail?.some(t => t.provenance === "recorded_replay") && <p className="small">Recorded buyer decisions replayed on {view.scene.visitDate}</p>}</div></div></header>
    {view.scene ? <Scene key={view.scene.id} scene={view.scene} now={now} savings={view.ledger?.pools.find(p => `${p.ruleId}:${p.visitDate}` === view.scene?.id)?.buyerShareCents ?? null} shown={replay?.shown ?? view.scene.buyers.length} /> : <section className="panel"><h1>{feedState === "stale" ? "Feed unavailable" : "No scene yet"}</h1><p>{feedState === "stale" ? "Reconnecting to the stored scene. No results are available yet." : "The dashboard will update when a demo scene is recorded."}</p></section>}
    {playing ? <p className="small muted">Recorded playback. No new bookings or payments.</p> : <details className="demo-details"><summary>Ledger and booking history</summary><div className="demo-detail-content results-grid"><Ledger ledger={view.ledger} /><div className="demo-side">{view.muse && <Muse muse={view.muse} />}{view.scene && <section className="panel"><h2>Booking history</h2><ol className="booking-history">{view.scene.events.map((event,i)=><li key={`${event.at}:${i}`}><span>{event.label}</span><time dateTime={event.at}>{sgTime(event.at)} SGT</time></li>)}</ol></section>}</div></div></details>}
  </main>;
}
