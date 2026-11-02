import { describe, expect, it } from 'vitest';
import { advanceKopi, initialKopiObservation, queueKopi } from '@/components/kopi-events';
import type { DemoScene, DemoSnapshot } from '@/lib/demo/snapshot';

const now = Date.parse('2026-11-02T04:00:00Z');
const at = new Date(now).toISOString();
const scene: DemoScene = {
  id: 'rule:2026-11-02', events: [], merchantName: 'Synthetic cafe', summary: 'Test',
  listPriceCents: 500, offerPriceCents: 400, discountBps: 2000, minPoolCovers: 2,
  visitDate: '2026-11-02', commitBy: at, phase: 'open', buyers: [],
  pooled: { covers: 0, unlocked: false, filledCovers: 0, soldOut: false }, plan: null,
};
const snapshot = (s: DemoScene | null): DemoSnapshot => ({ scene: s, muse: null, ledger: null });
const buyer = { agentId: 'buyer-1', label: 'Synthetic buyer', covers: 2, committedAt: at, soloUnlocks: true, outcome: 'pending' as const };
const joined: DemoScene = { ...scene, buyers: [buyer], events: [{ kind: 'commitment', at, label: '+2 covers' }], pooled: { ...scene.pooled, covers: 2, unlocked: true } };
const observe = (next: DemoSnapshot, previous = snapshot(scene)) => advanceKopi(initialKopiObservation(previous, 'live'), next, 'live', false, now);

function settled(): DemoSnapshot {
  return {
    scene: { ...joined, phase: 'cleared', pooled: { ...joined.pooled, filledCovers: 2, soldOut: true }, events: [{ kind: 'cleared', at, label: 'Cleared' }] }, muse: null,
    ledger: { covers: 2, buyerShareCents: 200, agentShareCents: 0, networkShareCents: 0, agentsCommitted: 1, poolsUnlocked: 1, reconciled: true, pools: [{ ruleId: 'rule', visitDate: '2026-11-02', clearedAt: at, unlocked: true, covers: 2, buyerShareCents: 200, agentShareCents: 0, networkShareCents: 0, reconciled: true }] },
  };
}

describe('Kopi observed events', () => {
  it('nods for a new buyer but describes an open minimum as pending', () => {
    expect(observe(snapshot(joined)).events).toEqual([
      { id: `${scene.id}:buyer:buyer-1:${at}`, pose: 'watching', motion: 'nod', text: '+2 covers committed' },
      { id: `${scene.id}:minimum`, pose: 'watching', motion: 'nod', text: 'Minimum reached. Clearing still pending.' },
    ]);
  });
  it('never animates the initial snapshot or a different pool', () => {
    expect(observe(snapshot(joined), snapshot(null)).events).toEqual([]);
    expect(observe(snapshot({ ...joined, id: 'other' })).events).toEqual([]);
  });
  it('does not repeat snapshots or a removed and restored buyer', () => {
    const first = observe(snapshot(joined));
    expect(advanceKopi(first.state, snapshot(joined), 'live', false, now).events).toEqual([]);
    const removed = advanceKopi(first.state, snapshot(scene), 'live', false, now);
    expect(advanceKopi(removed.state, snapshot(joined), 'live', false, now).events).toEqual([]);
  });
  it.each(['connecting', 'stale'] as const)('suppresses catch-up after %s', feed => {
    const interrupted = advanceKopi(initialKopiObservation(snapshot(scene), 'live'), snapshot(scene), feed, false, now);
    const caughtUp = advanceKopi(interrupted.state, snapshot(joined), 'live', false, now);
    expect(caughtUp.events).toEqual([]);
  });
  it('discards events during replay and on return', () => {
    const replay = advanceKopi(initialKopiObservation(snapshot(scene), 'live'), snapshot(joined), 'live', true, now);
    expect(replay.events).toEqual([]);
    expect(advanceKopi(replay.state, snapshot(joined), 'live', false, now).events).toEqual([]);
  });
  it('does not nod for old or future commitments', () => {
    for (const time of [now - 16_000, now + 1]) {
      const old = new Date(time).toISOString();
      expect(observe(snapshot({ ...joined, buyers: [{ ...buyer, committedAt: old }], events: [{ kind: 'commitment', at: old, label: 'Stored' }] })).events).toEqual([]);
    }
  });
  it('does not celebrate a cleared snapshot without a reconciled matching ledger', () => {
    const cleared: DemoScene = { ...joined, phase: 'cleared', pooled: { ...joined.pooled, filledCovers: 2, soldOut: true }, events: [{ kind: 'cleared', at, label: 'Cleared' }] };
    expect(observe(snapshot(cleared), snapshot(joined)).events).toEqual([]);
  });
  it('animates reconciled stored clearing and sellout once', () => {
    const next = settled();
    expect(observe(next, snapshot(joined)).events).toEqual([
      { id: `${scene.id}:cleared`, pose: 'happy', motion: 'unlock', text: 'Stored savings: S$2.00' },
      { id: `${scene.id}:sold-out`, pose: 'sold-out', motion: 'sold-out', text: 'Stored pool sold out.' },
    ]);
    const first = observe(next, snapshot(joined));
    expect(advanceKopi(first.state, next, 'live', false, now).events).toEqual([]);
  });
  it('requires a matching, reconciled, unlocked pool and a fresh clearing event', () => {
    for (const change of [
      (s: DemoSnapshot) => { s.ledger!.reconciled = false; },
      (s: DemoSnapshot) => { s.ledger!.pools[0]!.reconciled = false; },
      (s: DemoSnapshot) => { s.ledger!.pools[0]!.ruleId = 'other'; },
      (s: DemoSnapshot) => { s.scene!.pooled.unlocked = false; },
      (s: DemoSnapshot) => { s.scene!.events = []; },
      (s: DemoSnapshot) => { s.scene!.events[0]!.at = new Date(now - 16_000).toISOString(); },
    ]) {
      const next = settled(); change(next);
      expect(observe(next, snapshot(joined)).events).toEqual([]);
    }
    const next = settled(); next.scene!.pooled.soldOut = false;
    expect(observe(next, snapshot(joined)).events.map(e => e.motion)).toEqual(['unlock']);
  });
  it('never animates while disconnected, stale, or replaying even with verified data', () => {
    for (const feed of ['connecting', 'stale'] as const) {
      expect(advanceKopi(initialKopiObservation(snapshot(joined), 'live'), settled(), feed, false, now).events).toEqual([]);
    }
    const replay = advanceKopi(initialKopiObservation(snapshot(joined), 'live'), settled(), 'live', true, now);
    expect(replay.events).toEqual([]);
    expect(advanceKopi(replay.state, settled(), 'live', false, now).events).toEqual([]);
  });
  it('does not turn initial buyers into new events after removal and restoration', () => {
    const start = initialKopiObservation(snapshot(joined), 'live');
    const removed = advanceKopi(start, snapshot(scene), 'live', false, now);
    expect(advanceKopi(removed.state, snapshot(joined), 'live', false, now).events).toEqual([]);
  });
  it('shows a shield for a new refused plan without claiming a floor reason', () => {
    const refused: DemoScene = { ...joined, events: [{ kind: 'plan', at, label: 'Refused' }], plan: { provenance: 'model', verdict: 'invalid', discountBps: null, capacityCovers: null, minPoolCovers: null, perAgentCapCovers: null, rationale: null, applied: false } };
    expect(observe(snapshot(refused), snapshot(joined)).events).toEqual([{ id: `${scene.id}:plan:${at}`, pose: 'shield', motion: 'shield', text: 'No usable plan. Terms unchanged.' }]);
    expect(observe(snapshot({ ...refused, plan: { ...refused.plan!, verdict: 'ok' } }), snapshot(joined)).events[0]?.text).toBe('New plan ready. Awaiting approval.');
  });
  it('does not catch up the first snapshot after leaving replay', () => {
    const replay = advanceKopi(initialKopiObservation(snapshot(joined), 'live'), snapshot(joined), 'live', true, now);
    expect(advanceKopi(replay.state, settled(), 'live', false, now).events).toEqual([]);
  });
  it('does not announce a pending minimum in a cleared snapshot', () => {
    expect(observe(settled()).events.map(e => e.text)).toEqual(['+2 covers committed', 'Stored savings: S$2.00', 'Stored pool sold out.']);
  });
  it('does not celebrate delayed ledger verification as a new clearing', () => {
    const unverified = settled(); unverified.ledger = null;
    const first = observe(unverified, snapshot(joined));
    expect(first.events).toEqual([]);
    expect(advanceKopi(first.state, settled(), 'live', false, now).events).toEqual([]);
  });
  it('does not turn an existing plan update into a newly appearing plan', () => {
    const plan = { provenance: 'model' as const, verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'Plan', applied: false };
    const before = snapshot({ ...joined, events: [{ kind: 'plan', at: new Date(now - 1000).toISOString(), label: 'Plan' }], plan });
    const next = snapshot({ ...joined, events: [{ kind: 'plan', at, label: 'Plan' }], plan: { ...plan, applied: true } });
    expect(observe(next, before).events).toEqual([]);
  });
  it('does not animate a recorded sellout or an old plan', () => {
    const next = settled();
    next.scene!.plan = { provenance: 'recorded_replay', verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'Recorded', applied: false };
    expect(observe(next, snapshot(joined)).events).toEqual([]);
    next.scene!.plan.provenance = 'model';
    next.scene!.events = [{ kind: 'plan', at: new Date(now - 16_000).toISOString(), label: 'Old plan' }];
    expect(observe(next, snapshot(joined)).events).toEqual([]);
  });
  it('does not replay initial clearing after rollback or a new pool baseline', () => {
    const initial = initialKopiObservation(settled(), 'live');
    const rolledBack = advanceKopi(initial, snapshot(joined), 'live', false, now);
    expect(advanceKopi(rolledBack.state, settled(), 'live', false, now).events).toEqual([]);
    const other = { ...joined, id: 'other' };
    const switched = observe(snapshot(other));
    const removed = advanceKopi(switched.state, snapshot({ ...scene, id: 'other' }), 'live', false, now);
    expect(advanceKopi(removed.state, snapshot(other), 'live', false, now).events).toEqual([]);
    expect(observe(snapshot(null)).events).toEqual([]);
  });
  it('does not show a new plan twice or invent an approval requirement after application', () => {
    const plan = { provenance: 'model' as const, verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'New', applied: true };
    const next = snapshot({ ...joined, events: [{ kind: 'plan', at, label: 'Plan' }], plan });
    expect(observe(next, snapshot(joined)).events[0]?.text).toBe('New plan already applied.');
    expect(observe(next, next).events).toEqual([]);
    expect(observe(snapshot({ ...next.scene!, events: [] }), snapshot(joined)).events).toEqual([]);
  });
  it('suppresses recorded plan animations', () => {
    const recorded: DemoScene = { ...joined, events: [{ kind: 'plan', at, label: 'Recorded' }], plan: { provenance: 'recorded_replay', verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'Recorded', applied: false } };
    expect(observe(snapshot(recorded), snapshot(joined)).events).toEqual([]);
  });
});

describe('queued cues follow the current scene', () => {
  it('replaces pending cues when clearing arrives', () => {
    const pending = observe(snapshot(joined));
    const queue = queueKopi([], pending.queueAction);
    const cleared = advanceKopi(pending.state, settled(), 'live', false, now);
    expect(queueKopi(queue, cleared.queueAction).map(e => e.text)).toEqual(['Stored savings: S$2.00', 'Stored pool sold out.']);
  });
  it('clears cues when the pool disappears, changes, or becomes recorded', () => {
    const cleared = observe(settled(), snapshot(joined));
    const queue = queueKopi([], cleared.queueAction);
    const recorded = settled(); recorded.scene!.plan = { provenance: 'recorded_replay', verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'Recorded', applied: false };
    for (const next of [snapshot(null), snapshot({ ...scene, id: 'other' }), recorded]) {
      expect(queueKopi(queue, advanceKopi(cleared.state, next, 'live', false, now).queueAction)).toEqual([]);
    }
  });
  it('removes the minimum cue when cancellation drops the pool below minimum', () => {
    const pending = observe(snapshot(joined));
    const queue = queueKopi([], pending.queueAction);
    expect(queue.map(e => e.text)).toContain('Minimum reached. Clearing still pending.');
    expect(queueKopi(queue, advanceKopi(pending.state, snapshot(scene), 'live', false, now).queueAction)).toEqual([]);
  });
  it('removes awaiting-approval text when a plan is applied', () => {
    const plan = { provenance: 'model' as const, verdict: 'ok', discountBps: 1000, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, rationale: 'Plan', applied: false };
    const ready = snapshot({ ...joined, events: [{ kind: 'plan', at, label: 'Plan' }], plan });
    const first = observe(ready, snapshot(joined));
    const applied = snapshot({ ...ready.scene!, plan: { ...plan, applied: true } });
    expect(queueKopi(queueKopi([], first.queueAction), advanceKopi(first.state, applied, 'live', false, now).queueAction)).toEqual([]);
  });
});

describe('Kopi animation queue', () => {
  const events = [1, 2, 3, 4].map(n => ({ id: String(n), pose: 'watching' as const, motion: 'nod' as const, text: `Event ${n}` }));
  it('keeps the active event and at most two waiting events', () => {
    expect(queueKopi([], { kind: 'enqueue', events }).map(e => e.id)).toEqual(['1', '2', '3']);
  });
  it('deduplicates, advances in order and cancels immediately', () => {
    const queue = queueKopi([], { kind: 'enqueue', events: events.slice(0, 2) });
    expect(queueKopi(queue, { kind: 'enqueue', events: [events[0]!] }).map(e => e.id)).toEqual(['1', '2']);
    expect(queueKopi(queue, { kind: 'next' }).map(e => e.id)).toEqual(['2']);
    expect(queueKopi(queue, { kind: 'clear' })).toEqual([]);
  });
});
