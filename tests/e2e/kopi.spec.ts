import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { DemoSnapshot } from '../../src/lib/demo/snapshot';

for (const width of [375, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${width} ${colorScheme}: companion, routes and local replay`, async ({ page }) => {
      test.setTimeout(75_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      for (const route of ['/demo', '/evals', '/merchant']) {
        await page.goto(route);
        await expect(page.getByRole('complementary', { name: 'Kopi guide' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator('html')).toHaveJSProperty('clientWidth', width);
        await page.screenshot({ path: `docs/plans/backfill/evidence/s95/${route.slice(1)}-${width}-${colorScheme}.png`, fullPage: true });
      }
      await page.goto('/demo');
      { // Full five-run MCP rehearsals have their own verification script.
        await page.getByRole('button', { name: 'Replay this scene' }).click();
        await expect(page.locator('.kopi-bubble')).toContainText('Replaying stored commitments');
        await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion', { timeout: 900 });
        await expect(page.getByText('Local animation only.', { exact: false })).toBeHidden({ timeout: 10000 });
        await page.getByRole('button', { name: 'Return to live' }).click();
        await expect(page.locator('.kopi-bubble')).toContainText('Stored result:');
      }
      expect(errors).toEqual([]);
    });
  }
}

test('query flag hides Kopi without overwriting the dismissal preference', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Hide Kopi' }).click();
  await expect(page.getByRole('button', { name: 'Show Kopi' })).toBeVisible();
  await page.goto('/evals?kopi=off');
  await expect(page.getByRole('complementary', { name: 'Kopi guide' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('backfill-kopi-hidden'))).toBe('true');
  await page.goto('/evals');
  await page.getByRole('button', { name: 'Show Kopi' }).click();
  await page.goto('/demo?kopi=off');
  await expect(page.getByRole('complementary', { name: 'Kopi guide' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('backfill-kopi-hidden'))).toBe('false');
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`new SSE buyer cue and replay cancellation, motion=${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const fixture: DemoSnapshot = JSON.parse(await readFile('/tmp/backfill-s95-snapshot.json', 'utf8'));
    if (!fixture.scene) throw new Error('Local fixture must have a scene');
    const at = new Date().toISOString();
    const first: DemoSnapshot = { ...fixture, scene: { ...fixture.scene, phase: 'open', plan: null, buyers: [], events: [], pooled: { covers: 0, unlocked: false, filledCovers: 0, soldOut: false } } };
    const second: DemoSnapshot = { ...first, scene: { ...first.scene!, buyers: [{ agentId: 'e2e-local', label: 'Synthetic E2E', covers: 2, committedAt: at, soloUnlocks: false, outcome: 'pending' }], events: [{ kind: 'commitment', at, label: '+2 covers' }], pooled: { covers: 2, unlocked: false, filledCovers: 0, soldOut: false } } };
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
      response.write(`data: ${JSON.stringify(first)}\n\n`);
      const timer = setTimeout(() => response.write(`data: ${JSON.stringify(second)}\n\n`), 200);
      response.on('close', () => clearTimeout(timer));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local SSE server failed');
    await page.route('**/api/demo/stream', route => route.fulfill({ status: 307, headers: { location: `http://127.0.0.1:${address.port}/events` } }));
    try {
    await page.goto('/demo');
    await expect(page.locator('.kopi-companion')).toHaveAttribute('data-motion', 'nod');
    await expect(page.locator('.kopi-bubble')).toContainText('+2 covers committed');
    await expect(page.locator('.kopi-bubble [role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(await page.locator('.kopi-companion .cup-body').evaluate(el => getComputedStyle(el).animationName)).toBe(reducedMotion === 'reduce' ? 'none' : 'kopi-nod');
    await page.getByRole('button', { name: 'Replay this scene' }).click();
    await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion', { timeout: 900 });
    await expect(page.locator('.kopi-bubble')).toContainText('Replaying stored commitments');
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}

test('mobile dragging and keyboard movement stay inside the viewport and avoid controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/demo');
  const companion = page.locator('.kopi-companion');
  const handle = page.getByRole('button', { name: 'Move Kopi. Drag or use arrow keys.' });
  await expect(handle).toBeVisible();
  const before = await companion.boundingBox();
  const grip = await handle.boundingBox();
  if (!before || !grip) throw new Error('Companion geometry unavailable');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 160, { steps: 8 });
  await page.mouse.up();
  const after = await companion.boundingBox();
  expect(after).not.toEqual(before);
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  expect(await companion.boundingBox()).not.toEqual(after);
  for (const scroll of [0, 400, 900, 1600]) {
    await page.evaluate(y => scrollTo(0, y), scroll);
    await expect.poll(() => companion.evaluate(element => {
      const a = element.getBoundingClientRect();
      if (getComputedStyle(element).visibility === 'hidden') return true;
      return a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight && [...document.querySelectorAll('button,a,input,select,textarea,summary,[role="button"]')].filter(b => !element.contains(b)).every(b => {
        const r = b.getBoundingClientRect();
        return a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom;
      });
    })).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 500 });
  await expect.poll(() => companion.evaluate(e => getComputedStyle(e).visibility === 'hidden' || e.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
});
