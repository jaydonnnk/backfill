"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoMuse, DemoScene, DemoSnapshot } from "@/lib/demo/snapshot";
import type { DemoLedger } from "@/lib/demo/ledger";
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
  const [mode, setMode] = useState<"alone" | "pooled">("pooled");
  const buyers = [...scene.buyers].sort((a, b) => a.committedAt.localeCompare(b.committedAt)).slice(0, shown);
  const playing = shown < scene.buyers.length;
  const covers = buyers.reduce((sum, b) => sum + b.covers, 0);
  const soloCount = buyers.filter(b => b.soloUnlocks).length;
  const seconds = now === null ? null : Math.max(0, Math.ceil((Date.parse(scene.commitBy) - now) / 1000));
  const deadline = scene.phase === "cleared" ? "Closed" : seconds === null ? "…" : seconds === 0 ? "Awaiting clearing" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const events = playing ? scene.events.filter(e => e.kind === "commitment" && e.at <= (buyers.at(-1)?.committedAt ?? "")) : scene.events;
  return <>
    <div className="scene-heading"><div><p className="eyebrow">{scene.merchantName}</p><h1>Small groups. <em>One full table.</em></h1></div><div className="chips"><span className="chip">Simulated buyers</span><details className="disclosure"><summary className="chip">{scene.plan?.provenance === "recorded_replay" ? "Recorded replay" : "Provenance unknown"}</summary><p>Simulated buyers. {scene.plan?.provenance === "recorded_replay" ? "Recorded replay: these buyer decisions came from an earlier recording. This rehearsal may use a shifted day and time; the decisions were not made afresh for this window." : "Buyer decision provenance is unknown on this board. A live feed does not establish a fresh model run."}</p></details></div></div>
    <dl className="kpi-strip">
      <div><dt>Commit-by countdown</dt><dd className="compact-number">{deadline}</dd><small>{sgTime(scene.commitBy)} SGT</small></div>
      <div><dt>Covers committed</dt><dd>{covers}<small> / {scene.minPoolCovers} minimum</small></dd></div>
      <div><dt>Price per cover</dt><dd>{dollars(scene.offerPriceCents)}</dd><small><s>{dollars(scene.listPriceCents)}</s> · {percent(scene.discountBps)} off</small></div>
      <div><dt>Buyer savings</dt><dd>{playing || savings === null ? "—" : dollars(savings)}</dd><small>{playing ? "Replaying commitments" : scene.phase === "open" ? "Not cleared yet" : "This pool · stored ledger"}</small></div>
    </dl>
    <div className="dashboard-grid">
      <section className="panel pool-panel" aria-label="Pool comparison">
        <div className="panel-heading"><div><h2>{mode === "alone" ? "Each agent alone" : "Pooled"}</h2><p className="small muted">{mode === "alone" ? `${soloCount} of ${buyers.length} unlock` : `${covers} covers · unlocks at ${scene.minPoolCovers}`}</p></div><div className="segmented" aria-label="Comparison mode"><button aria-pressed={mode === "alone"} onClick={() => setMode("alone")}>Alone</button><button aria-pressed={mode === "pooled"} onClick={() => setMode("pooled")}>Pooled</button></div></div>
        <div className={`pool-stage ${mode}`} style={{ height: mode === "alone" ? Math.max(330, Math.ceil(buyers.length / 4) * 90) : 380 }}>
          {mode === "pooled" && <Ring value={covers} minimum={scene.minPoolCovers} good={!playing && scene.pooled.unlocked} />}
          {buyers.map((buyer, i) => {
            const angle = (i / Math.max(1, buyers.length)) * 2 * Math.PI - Math.PI / 2;
            const left = mode === "pooled" ? 50 + 41 * Math.cos(angle) : 12.5 + (i % 4) * 25;
            const top = mode === "pooled" ? 50 + 41 * Math.sin(angle) : 15 + Math.floor(i / 4) * (75 / Math.max(1, Math.ceil(buyers.length / 4)));
            return <details key={buyer.agentId} className="buyer-token" style={{ left: `${left}%`, top: `${top}%` }}>
              <summary title={`${buyer.label} · ${playing ? "Commitment replay" : buyer.outcome.replaceAll("_", " ")}`} aria-label={`${buyer.label}, ${buyer.covers} covers`}><span className={`avatar ${mode === "alone" ? buyer.soloUnlocks ? "good" : "bad" : "spark"}`}>{String(i + 1).padStart(2, "0")}</span><span className="small">{buyer.covers} covers</span>{mode === "alone" && <meter min={0} max={scene.minPoolCovers} value={Math.min(buyer.covers, scene.minPoolCovers)} aria-label="Solo covers against minimum" />}</summary>
              <div className="buyer-popover" style={{ left: left < 30 ? 0 : left > 70 ? "auto" : "50%", right: left > 70 ? 0 : "auto", transform: left < 30 || left > 70 ? "none" : "translateX(-50%)" }}><strong>{buyer.label}</strong><p>{playing ? "Commitment replay" : buyer.outcome.replaceAll("_", " ")}</p></div>
            </details>;
          })}
          {buyers.length === 0 && mode === "alone" && <p className="stage-empty">Waiting for buyer agents…</p>}
        </div>
        <p className={`pool-verdict ${playing || scene.phase === "open" ? "wait" : scene.pooled.unlocked ? "good" : "bad"}`} aria-live="polite">{playing ? "Replaying stored commitments" : scene.phase === "open" ? scene.pooled.unlocked ? "Minimum reached. Waiting for the deadline." : "Waiting for enough covers." : scene.pooled.unlocked ? `Unlocked: ${scene.pooled.filledCovers} covers filled${scene.pooled.soldOut ? ", sold out" : ""}.` : "Minimum not met. Nothing charged."}</p>
        <details className="buyer-table"><summary>Buyer details ({buyers.length})</summary><div className="table-scroll"><table><thead><tr><th>Intent</th><th>Covers</th><th>Alone</th><th>Pooled</th></tr></thead><tbody>{buyers.map(b => <tr key={b.agentId}><td>{b.label}<small>{b.agentId}</small></td><td>{b.covers}</td><td>{b.soloUnlocks ? "Unlocks" : "Below minimum"}</td><td>{playing ? "Replaying" : b.outcome.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details>
      </section>
      <aside className="panel timeline"><h2>What happened</h2><p className="small muted">Stored events · Singapore time</p><ol>{events.map((event, i) => <li key={`${event.at}:${i}`}><span className="timeline-dot" /><p>{event.label}</p><time dateTime={event.at}>{sgTime(event.at)}</time></li>)}</ol>{events.length === 0 && <p className="muted">Waiting for commitments.</p>}</aside>
    </div>
    {!playing && scene.pooled.soldOut && <section className="panel wonder-panel"><div><p className="eyebrow">Muse Wonder</p><h2>{scene.plan?.provenance === "recorded_replay" ? "Sold out: recorded Wonder plan replayed" : "A plan for next time"}</h2></div>{!scene.plan ? <p>No Wonder plan stored yet. Its model or replay provenance is unknown.</p> : scene.plan.verdict === "ok" ? <><div className="plan-diff"><div><span>Discount</span><strong>{percent(scene.discountBps)} → {scene.plan.discountBps === null ? "Unknown" : percent(scene.plan.discountBps)}</strong></div><div><span>Capacity</span><strong>{scene.pooled.filledCovers} → {scene.plan.capacityCovers}</strong></div><div><span>Minimum pool</span><strong>{scene.minPoolCovers} → {scene.plan.minPoolCovers}</strong></div></div><div className="chips"><span className="chip good">Checked against merchant limits</span><span className="chip">{scene.plan.applied ? "Applied by merchant" : "Awaiting merchant"}</span><details className="disclosure"><summary className="chip">Why this plan?</summary><p>{scene.plan.rationale ?? "No rationale stored."} Up to {scene.plan.perAgentCapCovers} covers per agent.</p></details></div></> : <p className="bad">Plan refused by merchant limits ({scene.plan.verdict}). The offer stays unchanged.</p>}</section>}
  </>;
}

function Ledger({ ledger }: { ledger: DemoLedger | null }) {
  return <section className="panel ledger-panel"><div className="panel-heading"><div><p className="eyebrow">The savings ledger</p><h2>Every dollar accounted for.</h2></div>{ledger && <span className={`chip ${ledger.reconciled ? "good" : "bad"}`}>{ledger.reconciled ? "Totals reconcile" : "Reconciliation incomplete"}</span>}</div><p className="small muted">All stored Demo Cafe pools, including rehearsals. No real payments.</p>{ledger && ledger.pools.length > 0 ? <><p className="ledger-total">{dollars(ledger.buyerShareCents)} <span>saved by buyers</span></p>{ledger.pools.map((pool, i) => {
    const total = pool.buyerShareCents + pool.agentShareCents + pool.networkShareCents;
    return <div key={`${pool.ruleId}:${pool.visitDate}`} className="ledger-row"><div className="panel-heading"><span>Pool {i + 1} · {pool.visitDate}</span><span>{pool.covers} covers · {pool.reconciled ? "Reconciled" : "Incomplete"}</span></div><div className="split-bar" role="img" aria-label={`Buyer ${dollars(pool.buyerShareCents)}, agent ${dollars(pool.agentShareCents)}, network ${dollars(pool.networkShareCents)}`}><span style={{ width: `${total ? pool.buyerShareCents / total * 100 : 0}%` }} /><span style={{ width: `${total ? pool.agentShareCents / total * 100 : 0}%` }} /><span style={{ width: `${total ? pool.networkShareCents / total * 100 : 0}%` }} /></div><div className="split-labels"><span>Buyer {dollars(pool.buyerShareCents)}</span><span>Agent {dollars(pool.agentShareCents)}</span><span>Network {dollars(pool.networkShareCents)}</span></div></div>;
  })}</> : <p className="muted">No stored ledger entries yet.</p>}</section>;
}

function Muse({ muse }: { muse: DemoMuse }) {
  return <section className="panel muse-panel"><div><span className="chip spark">Real, not simulated</span><h2>A real Muse user</h2><p>A person&apos;s Muse agent committed {muse.covers} covers at {muse.merchantName} for {muse.visitDate}.</p><p className="small muted">{muse.status.replaceAll("_", " ")} · a separate pool from the scene above</p></div><Ring value={muse.pooledCovers} minimum={muse.minPoolCovers} good={muse.status === "filled"} /></section>;
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
    const source = new EventSource("/api/demo/stream");
    followFeedHealth(source, state => {
      setFeedState(state);
      if (state !== 'live') {
        observation.current = { ...observation.current, feed: state };
        animate?.({ kind: 'clear' });
      }
    });
    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as DemoSnapshot;
        const result = advanceKopi(observation.current, next, 'live', replaying.current, Date.now());
        observation.current = result.state;
        animate?.(result.queueAction);
        setSnapshot(next);
      }
      catch { setFeedState("stale"); observation.current = { ...observation.current, feed: "stale" }; animate?.({ kind: "clear" }); }
    };
    return () => source.close();
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
    setReplay({ snapshot, shown: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? snapshot.scene?.buyers.length ?? 0 : 0 });
  }
  return <main className="page demo-page">
    <KopiMessage {...demoKopiCue(view.scene, feedState, replay !== null)} />
    <div className="demo-toolbar"><p className="feed-state" role="status"><span className={`feed-dot ${feedState}`} />{feedState === "live" ? "Live" : feedState === "stale" ? "Stale" : "Reconnecting"} feed{replay ? " · Viewing local replay" : " · Stored scene"}</p><div className="actions"><button className="button" onClick={startReplay} disabled={!snapshot.scene || snapshot.scene.buyers.length === 0}>Replay this scene</button>{replay && <button className="button" onClick={() => { replaying.current = false; observation.current = { ...observation.current, replay: true }; setReplay(null); }}>Return to live</button>}</div></div>
    {view.scene ? <Scene key={view.scene.id} scene={view.scene} now={now} savings={view.ledger?.pools.find(p => `${p.ruleId}:${p.visitDate}` === view.scene?.id)?.buyerShareCents ?? null} shown={replay?.shown ?? view.scene.buyers.length} /> : <section className="panel"><h1>{feedState === "stale" ? "Feed unavailable" : "No scene yet"}</h1><p>{feedState === "stale" ? "Reconnecting to the stored scene. No results are available yet." : "The dashboard will update when a demo scene is recorded."}</p></section>}
    {playing ? <p className="small muted">Local animation only. Stored results appear when replay finishes.</p> : <div className="results-grid"><Ledger ledger={view.ledger} />{view.muse && <Muse muse={view.muse} />}</div>}
  </main>;
}
