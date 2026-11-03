import { test, expect, type Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import type { DemoSnapshot } from '../../src/lib/demo/snapshot';

const empty = (): DemoSnapshot => ({ scene: { id: 'synthetic-live:2026-11-02', events: [], merchantName: 'Synthetic lifecycle fixture', summary: 'Offline', listPriceCents: 500, offerPriceCents: 400, discountBps: 2000, minPoolCovers: 8, visitDate: '2026-11-02', commitBy: new Date(Date.now() + 60000).toISOString(), phase: 'open', buyers: [], pooled: { covers: 0, unlocked: false, filledCovers: 0, soldOut: false }, plan: null }, ledger: null, muse: null });
async function feed(page: Page) {
  let response: ServerResponse | undefined;
  const snapshot = empty();
  const server = createServer((_req, res) => {
    response = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SSE fixture failed');
  await page.route('**/api/demo/stream', route => route.fulfill({ status: 307, headers: { location: `http://127.0.0.1:${address.port}/events` } }));
  await page.goto('/demo');
  await expect(page.getByText('Synthetic lifecycle fixture', { exact: true })).toBeVisible();
  return {
    snapshot,
    send: (s: DemoSnapshot) => response!.write(`data: ${JSON.stringify(s)}\n\n`),
    stale: () => response!.write('event: stale\ndata: {}\n\n'),
    malformed: () => response!.write('data: {invalid\n\n'),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
function buyer(snapshot: DemoSnapshot, index: number, covers: number) {
  const at = new Date().toISOString();
  if (!snapshot.scene) throw new Error('Scene required');
  snapshot.scene.buyers.push({ agentId: `fixture-${index}`, label: `Fixture ${index}`, covers, committedAt: at, soloUnlocks: false, outcome: 'pending' });
  snapshot.scene.events.push({ kind: 'commitment', at, label: 'Fixture commitment' });
  snapshot.scene.pooled.covers += covers;
}

test('consecutive nods each start an animation', async ({ page }) => {
  const stream = await feed(page);
  try {
    buyer(stream.snapshot, 1, 2); stream.send(stream.snapshot);
    await expect(page.locator('.kopi-bubble')).toContainText('+2 covers committed');
    buyer(stream.snapshot, 2, 3); stream.send(stream.snapshot);
    await expect(page.locator('.kopi-bubble')).toContainText('+3 covers committed');
    const progress = await page.locator('.kopi-companion .cup-body').evaluate(el => el.getAnimations().map(a => Number(a.currentTime)));
    expect(progress).toHaveLength(1);
    expect(progress[0]).toBeLessThan(600);
  } finally { await stream.close(); }
});

for (const change of ['pool', 'null', 'stale', 'malformed', 'navigation', 'clearing', 'plan_applied', 'minimum_lost'] as const) {
  test(`queued cue invalidates on ${change}`, async ({ page }) => {
    const stream = await feed(page);
    try {
      if (change === 'plan_applied') {
        stream.snapshot.scene!.plan = { provenance: 'model', verdict: 'ok', discountBps: 1000, capacityCovers: 16, minPoolCovers: 8, perAgentCapCovers: 4, rationale: null, applied: false };
        stream.snapshot.scene!.events.push({ kind: 'plan', at: new Date().toISOString(), label: 'Fixture plan' });
        stream.send(stream.snapshot);
        await expect(page.locator('.kopi-bubble')).toContainText('Awaiting approval.');
        stream.snapshot.scene!.plan.applied = true;
        stream.send(stream.snapshot);
      } else {
        buyer(stream.snapshot, 1, change === 'minimum_lost' ? 8 : 2);
        stream.snapshot.scene!.pooled.unlocked = change === 'minimum_lost';
        stream.send(stream.snapshot);
        await expect(page.locator('.kopi-companion')).toHaveAttribute('data-motion', 'nod');
        if (change === 'minimum_lost') stream.send(empty());
        if (change === 'pool') { stream.snapshot.scene!.id = 'other'; stream.send(stream.snapshot); }
        if (change === 'null') stream.send({ ...stream.snapshot, scene: null });
        if (change === 'stale') stream.stale();
        if (change === 'malformed') stream.malformed();
        if (change === 'navigation') await page.getByRole('link', { name: 'Why Spark', exact: true }).click();
        if (change === 'clearing') { stream.snapshot.scene!.phase = 'cleared'; stream.send(stream.snapshot); }
      }
      // Must cancel immediately, not merely expire on the 1.8-second timer.
      await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion', { timeout: 900 });
    } finally { await stream.close(); }
  });
}
