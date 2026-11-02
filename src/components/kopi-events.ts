import type { FeedState } from '@/app/demo/live-feed';
import type { DemoSnapshot } from '@/lib/demo/snapshot';
import type { KopiCue } from './kopi-state';

export type KopiEvent = KopiCue & { id: string; motion: 'nod' | 'unlock' | 'sold-out' | 'shield' | 'plan' };
export type KopiObservation = { snapshot: DemoSnapshot; feed: FeedState; replay: boolean; seen: Set<string> };
export type KopiQueueAction = { kind: 'enqueue' | 'replace'; events: KopiEvent[] } | { kind: 'next' } | { kind: 'clear' };

export function initialKopiObservation(snapshot: DemoSnapshot, feed: FeedState): KopiObservation {
  const scene = snapshot.scene;
  const seen = new Set(scene?.buyers.map(b => `${scene.id}:buyer:${b.agentId}:${b.committedAt}`));
  if (scene?.pooled.unlocked) seen.add(`${scene.id}:minimum`);
  if (scene?.phase === 'cleared') seen.add(`${scene.id}:cleared`);
  if (scene?.pooled.soldOut) seen.add(`${scene.id}:sold-out`);
  for (const event of scene?.events ?? []) {
    if (event.kind === 'plan') seen.add(`${scene!.id}:plan:${event.at}`);
  }
  return { snapshot, feed, replay: false, seen };
}

export function advanceKopi(previous: KopiObservation, snapshot: DemoSnapshot, feed: FeedState, replay: boolean, now: number): { state: KopiObservation; events: KopiEvent[]; queueAction: KopiQueueAction } {
  const seen = new Set(previous.seen);
  const state = { snapshot, feed, replay, seen };
  const events: KopiEvent[] = [];
  const before = previous.snapshot.scene;
  const scene = snapshot.scene;
  const scope = (s: DemoSnapshot['scene']) => JSON.stringify([s?.id, s?.phase, s?.pooled.soldOut, s?.pooled.unlocked, s?.plan]);
  const changed = scope(before) !== scope(scene);
  const result = () => ({ state, events, queueAction: { kind: changed ? 'replace' : 'enqueue', events } satisfies KopiQueueAction });
  if (!before || !scene || before.id !== scene.id) {
    for (const id of initialKopiObservation(snapshot, feed).seen) seen.add(id);
    return result();
  }
  const eligible = feed === 'live' && previous.feed === 'live' && !replay && !previous.replay && scene.plan?.provenance !== 'recorded_replay';
  const fresh = (at: string) => { const age = now - Date.parse(at); return age >= 0 && age <= 15_000; };
  function emit(event: KopiEvent) {
    if (eligible && !seen.has(event.id)) events.push(event);
    seen.add(event.id);
  }
  const newcomers = scene.buyers.filter(b => !before.buyers.some(old => old.agentId === b.agentId && old.committedAt === b.committedAt));
  for (const buyer of newcomers) {
    const id = `${scene.id}:buyer:${buyer.agentId}:${buyer.committedAt}`;
    if (fresh(buyer.committedAt)) emit({ id, pose: 'watching', motion: 'nod', text: `+${buyer.covers} covers committed` });
    else seen.add(id);
  }
  if (scene.pooled.unlocked && scene.phase === 'open' && newcomers.some(b => fresh(b.committedAt))) {
    emit({ id: `${scene.id}:minimum`, pose: 'watching', motion: 'nod', text: 'Minimum reached. Clearing still pending.' });
  }
  const clearing = scene.events.find(e => e.kind === 'cleared');
  const pool = snapshot.ledger?.pools.find(p => `${p.ruleId}:${p.visitDate}` === scene.id);
  if (before.phase === 'open' && scene.phase === 'cleared' && clearing && fresh(clearing.at) && pool?.reconciled && snapshot.ledger?.reconciled && scene.pooled.unlocked) {
    emit({ id: `${scene.id}:cleared`, pose: 'happy', motion: 'unlock', text: `Stored savings: S$${(pool.buyerShareCents / 100).toFixed(2)}` });
    if (scene.pooled.soldOut) emit({ id: `${scene.id}:sold-out`, pose: 'sold-out', motion: 'sold-out', text: 'Stored pool sold out.' });
  }
  const planEvent = scene.events.find(e => e.kind === 'plan');
  if (!before.plan && scene.plan && planEvent && fresh(planEvent.at)) {
    const refused = scene.plan.verdict !== 'ok';
    emit({ id: `${scene.id}:plan:${planEvent.at}`, pose: refused ? 'shield' : 'watching', motion: refused ? 'shield' : 'plan', text: refused ? 'No usable plan. Terms unchanged.' : scene.plan.applied ? 'New plan already applied.' : 'New plan ready. Awaiting approval.' });
  }
  return result();
}

export function queueKopi(queue: KopiEvent[], action: KopiQueueAction): KopiEvent[] {
  switch (action.kind) {
    case 'replace': return queueKopi([], { kind: 'enqueue', events: action.events });
    case 'clear': return [];
    case 'next': return queue.slice(1);
    case 'enqueue': return [...new Map([...queue, ...action.events].map(event => [event.id, event])).values()].slice(0, 3);
  }
}
