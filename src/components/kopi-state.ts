import type { DemoScene } from '@/lib/demo/snapshot';
import type { FeedState } from '@/app/demo/live-feed';

export type KopiCue = { pose: 'idle' | 'watching' | 'waiting' | 'happy' | 'sold-out' | 'shield'; text: string };

export function demoKopiCue(scene: Pick<DemoScene, 'phase' | 'pooled'> | null, feed: FeedState, replay: boolean): KopiCue {
  if (replay) return { pose: 'watching', text: 'Replaying stored commitments. No new bookings.' };
  if (feed === 'stale') return { pose: 'waiting', text: 'Feed interrupted. Results may be stale.' };
  if (!scene) return { pose: 'waiting', text: 'Waiting for a recorded scene.' };
  if (feed === 'connecting') return { pose: 'waiting', text: 'Connecting to the stored scene.' };
  if (scene.phase === 'open') return { pose: 'watching', text: scene.pooled.unlocked ? 'Minimum reached. Waiting for clearing.' : 'Waiting for the group to reach its minimum.' };
  if (!scene.pooled.unlocked) return { pose: 'shield', text: 'Minimum not met. Nothing charged.' };
  return { pose: scene.pooled.soldOut ? 'sold-out' : 'happy', text: `Stored result: ${scene.pooled.filledCovers} covers filled.${scene.pooled.soldOut ? ' Sold out!' : ''}` };
}

export type KopiPageCue = KopiCue & { path: string };
export type KopiMessageUpdate = { id: string; cue: KopiPageCue | null };
export function updateKopiMessages(messages: Map<string, KopiPageCue>, { id, cue }: KopiMessageUpdate): Map<string, KopiPageCue> {
  const next = new Map(messages);
  next.delete(id);
  if (cue) next.set(id, cue);
  return next;
}
