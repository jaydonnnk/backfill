import { expect, it } from 'vitest';
import { followFeedHealth, type FeedState } from '@/app/demo/live-feed';

it('keeps malformed or incomplete messages uncertain instead of marking them live', () => {
  const source = new EventTarget();
  const states: FeedState[] = [];
  followFeedHealth(source, state => states.push(state));
  for (const data of ['null', '{}', '{', '{"scene":{"phase":"cleared","pooled":{"unlocked":true}},"muse":null,"ledger":null}']) source.dispatchEvent(new MessageEvent('message', { data }));
  expect(states).toEqual(['stale', 'stale', 'stale', 'stale']);
});

it('rejects a complete-shaped feed that claims fills without an unlocked settlement', () => {
  const source = new EventTarget();
  const states: FeedState[] = [];
  followFeedHealth(source, s => states.push(s));
  source.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ scene: {
    id: 'test:2026-11-03', merchantName: 'Synthetic', summary: 'Fixture', listPriceCents: 680, offerPriceCents: 544, discountBps: 2000,
    minPoolCovers: 8, visitDate: '2026-11-03', commitBy: '2026-11-03T04:00:00.000Z', phase: 'cleared', events: [], buyers: [], plan: null,
    pooled: { covers: 6, unlocked: false, filledCovers: 8, soldOut: true },
  }, muse: null, ledger: null }) }));
  expect(states).toEqual(['stale']);
});

it('retains stale uncertainty when a malformed stream then disconnects', () => {
  const source = new EventTarget();
  const states: FeedState[] = [];
  followFeedHealth(source, s => states.push(s));
  source.dispatchEvent(new MessageEvent('message', { data: '{' }));
  source.dispatchEvent(new Event('error'));
  expect(states).toEqual(['stale', 'stale']);
});
