import { describe, expect, it } from 'vitest';
import { demoKopiCue } from '@/components/kopi-state';

const scene = { phase: 'cleared' as const, pooled: { covers: 16, unlocked: true, soldOut: true, filledCovers: 16 } };
describe('Kopi reports only the displayed demo state', () => {
  it('does not celebrate a stale sold-out snapshot', () => {
    expect(demoKopiCue(scene, 'stale', false)).toEqual({ pose: 'waiting', text: 'Feed interrupted. Results may be stale.' });
  });
  it('labels replay instead of claiming a new result', () => {
    expect(demoKopiCue(scene, 'live', true)).toEqual({ pose: 'watching', text: 'Replaying stored commitments. No new bookings.' });
  });
  it('does not call an open pool a cleared deal', () => {
    expect(demoKopiCue({ ...scene, phase: 'open' }, 'live', false)).toEqual({ pose: 'watching', text: 'Minimum reached. Waiting for clearing.' });
  });
  it('reports a confirmed stored sellout', () => {
    expect(demoKopiCue(scene, 'live', false)).toEqual({ pose: 'sold-out', text: 'Stored result: 16 covers filled. Sold out!' });
  });
  it('does not invent success when there is no scene or the pool failed', () => {
    expect(demoKopiCue(null, 'live', false).text).toBe('Waiting for a recorded scene.');
    expect(demoKopiCue({ ...scene, pooled: { covers: 16, unlocked: false, soldOut: false, filledCovers: 0 } }, 'live', false)).toEqual({ pose: 'shield', text: 'Minimum not met. Nothing charged.' });
  });
  it('reports successful clearing without a sellout', () => {
    expect(demoKopiCue({ ...scene, pooled: { covers: 16, unlocked: true, soldOut: false, filledCovers: 12 } }, 'live', false)).toEqual({ pose: 'happy', text: 'Stored result: 12 covers filled.' });
  });
});

describe('Kopi message ownership', () => {
  it('restores unchanged page guidance after a pending form message leaves', async () => {
    const { updateKopiMessages } = await import('@/components/kopi-state');
    const page = {path:'/merchant', pose:'shield' as const, text:'Your terms need another look.'};
    const pending = {path:'/merchant', pose:'watching' as const, text:'Publishing…'};
    let messages = updateKopiMessages(new Map(), {id:'page',cue:page});
    messages = updateKopiMessages(messages, {id:'form',cue:pending});
    expect([...messages.values()].at(-1)).toEqual(pending);
    messages = updateKopiMessages(messages, {id:'form',cue:null});
    expect([...messages.values()].at(-1)).toEqual(page);
  });
});
