"use client";

import { useEffect, useState } from "react";
import type { DemoBuyer, DemoMuse, DemoScene, DemoSnapshot } from "@/lib/demo/snapshot";

const card = "flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--border)] p-5";
const dollars = (cents: number) => `S$${(cents / 100).toFixed(2)}`;
const percent = (bps: number) => `${bps / 100}%`;
const sgTime = (iso: string) => new Date(iso).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" });

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Badge({ tone, children }: { tone: "good" | "bad" | "wait"; children: React.ReactNode }) {
  const tones = { good: "bg-[var(--highlight)] text-[var(--accent)]", bad: "bg-transparent text-[var(--muted)] border border-[var(--border)]", wait: "bg-transparent text-[var(--foreground)] border border-[var(--border)]" };
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function BuyerRow({ buyer, right }: { buyer: DemoBuyer; right: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-sm font-medium" title={buyer.label}>
          {buyer.label}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {buyer.agentId} · {buyer.covers} {buyer.covers === 1 ? "cover" : "covers"}
        </p>
      </div>
      {right}
    </li>
  );
}

function Scene({ scene, now }: { scene: DemoScene; now: number }) {
  const open = scene.phase === "open";
  const left = new Date(scene.commitBy).getTime() - now;
  const soloCount = scene.buyers.filter((b) => b.soloUnlocks).length;
  const fill = Math.min(100, Math.round((scene.pooled.covers / scene.minPoolCovers) * 100));
  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{scene.merchantName}</h2>
          <p className="text-sm text-[var(--muted)]">
            {open ? (left > 0 ? `Commitments close in ${countdown(left)}` : "Deadline passed, clearing…") : `Cleared at ${sgTime(scene.commitBy)}`}
          </p>
        </div>
        <p className="text-sm">
          {percent(scene.discountBps)} off: {dollars(scene.listPriceCents)} becomes {dollars(scene.offerPriceCents)} per cover, if at least {scene.minPoolCovers} covers commit by {sgTime(scene.commitBy)}.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">Each agent alone</h2>
            <p className="text-sm text-[var(--muted)]">
              {soloCount} of {scene.buyers.length} unlock
            </p>
          </div>
          {scene.buyers.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Waiting for buyer agents…</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {scene.buyers.map((b) => (
                <BuyerRow key={b.agentId} buyer={b} right={b.soloUnlocks ? <Badge tone="good">Unlocks</Badge> : <Badge tone="bad">Below {scene.minPoolCovers}</Badge>} />
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">Pooled</h2>
            <p className="text-sm text-[var(--muted)]">
              {scene.pooled.covers} covers · unlocks at {scene.minPoolCovers}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-valuemin={0} aria-valuemax={scene.minPoolCovers} aria-valuenow={scene.pooled.covers}>
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${fill}%` }} />
          </div>
          <p className="text-sm font-medium">
            {open
              ? scene.pooled.unlocked
                ? "The pool has reached the minimum; it unlocks at the deadline."
                : "Not enough covers yet."
              : scene.pooled.unlocked
                ? `Unlocked: ${scene.pooled.filledCovers} covers filled at ${dollars(scene.offerPriceCents)}${scene.pooled.soldOut ? ", sold out" : ""}.`
                : "Locked: the pool fell short, nothing is charged."}
          </p>
          {scene.buyers.length > 0 && (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {scene.buyers.map((b) => (
                <BuyerRow
                  key={b.agentId}
                  buyer={b}
                  right={b.outcome === "filled" ? <Badge tone="good">Filled</Badge> : b.outcome === "not_filled" ? <Badge tone="bad">Not filled</Badge> : <Badge tone="wait">In pool</Badge>}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {scene.pooled.soldOut && (
        <section className={card}>
          <h2 className="text-lg font-medium">Sold out: the merchant&rsquo;s Muse Wonder agent re-plans</h2>
          {scene.plan === null ? (
            <p className="text-sm text-[var(--muted)]">Wonder is planning the next offer…</p>
          ) : scene.plan.verdict === "ok" ? (
            <>
              <p className="text-sm">
                Next time: {percent(scene.plan.discountBps ?? 0)} off, {scene.plan.capacityCovers} covers, unlocks at {scene.plan.minPoolCovers}, up to {scene.plan.perAgentCapCovers} per agent.
              </p>
              {scene.plan.rationale && <p className="text-sm text-[var(--muted)]">{scene.plan.rationale}</p>}
              <p className="text-sm text-[var(--muted)]">{scene.plan.applied ? "The merchant applied this plan." : "Checked against the merchant's limits; it waits for the merchant to apply it."}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Wonder&rsquo;s plan was refused by the merchant&rsquo;s limits ({scene.plan.verdict}), so the offer stays as it is.</p>
          )}
        </section>
      )}
    </>
  );
}

function Muse({ muse }: { muse: DemoMuse }) {
  const status = { pending: "In pool, waiting for its deadline", cancelled: "Cancelled", filled: "Filled", not_filled: "Not filled" }[muse.status];
  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">A real Muse user</h2>
        <Badge tone="good">Real, not simulated</Badge>
      </div>
      <p className="text-sm">
        A person&rsquo;s own Muse agent, through Backfill&rsquo;s custom connector, committed {muse.covers} covers at {muse.merchantName} for {muse.visitDate}.
      </p>
      <p className="text-sm text-[var(--muted)]">
        {status} · its pool: {muse.pooledCovers} of {muse.minPoolCovers} covers · a separate pool from the scene above
      </p>
    </section>
  );
}

export function LiveBoard({ initial }: { initial: DemoSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [live, setLive] = useState(false);
  const now = useNow();
  useEffect(() => {
    const source = new EventSource("/api/demo/stream");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = (event: MessageEvent<string>) => setSnapshot(JSON.parse(event.data) as DemoSnapshot);
    return () => source.close();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-[var(--muted)]">Backfill live demo</p>
          <h1 className="text-2xl font-semibold tracking-tight">Alone, no agent unlocks the deal. Pooled, it clears.</h1>
        </div>
        <p className="flex items-center gap-2 pt-1 text-sm text-[var(--muted)]" aria-live="polite">
          <span className={`inline-block size-2 rounded-full ${live ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
          {live ? "Live" : "Reconnecting"}
        </p>
      </header>
      {snapshot.scene ? <Scene scene={snapshot.scene} now={now} /> : <section className={card}><p className="text-sm text-[var(--muted)]">No scene yet. Run the demo scene to start one.</p></section>}
      {snapshot.muse && <Muse muse={snapshot.muse} />}
    </main>
  );
}
