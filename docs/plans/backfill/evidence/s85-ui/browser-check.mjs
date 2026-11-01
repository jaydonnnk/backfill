// Run against an isolated local fixture, never production. PLAYWRIGHT_MODULE may point to the bundled Playwright index.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.PREVIEW_URL ?? 'http://localhost:3185';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = new URL('./', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true });
const checks = [];
const failures = [];
const mutations = [];
try {
  for (const width of [375, 1280]) for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 720 }, colorScheme });
    page.on('pageerror', error => failures.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') mutations.push({ method: request.method(), url: request.url() }); });
    for (const route of ['/', '/demo', '/evals', '/system', '/merchant']) {
      const response = await page.goto(base + route);
      assert.equal(response.status(), 200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} overflow at ${width}/${colorScheme}`);
      if (route === '/' || route === '/demo') {
        await page.screenshot({ path: `${out}${route === '/' ? 'landing' : 'demo'}-${width}-${colorScheme}.png`, fullPage: true });
      }
      checks.push({ route, width, colorScheme, noOverflow: true });
      if (route === '/demo') {
        if (width === 1280) { const verdict = await page.locator('.pool-verdict').boundingBox(); assert(verdict.y + verdict.height <= 720, 'pool result must fit the recording viewport'); }
        await page.getByRole('button', { name: 'Alone', exact: true }).click();
        assert.equal(await page.getByRole('heading', { name: 'Each agent alone' }).count(), 1);
        await page.getByRole('button', { name: 'Pooled', exact: true }).click();
        const tokens = page.locator('.buyer-token');
        const total = await tokens.count();
        assert(total > 0, 'fixture must contain buyers');
        for (let i = 0; i < total; i++) {
          await tokens.nth(i).locator('summary').click();
          const box = await tokens.nth(i).locator('.buyer-popover').boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width, `popover ${i} outside ${width}px viewport`);
          await tokens.nth(i).locator('summary').click();
        }
        await page.getByRole('button', { name: 'Replay this scene' }).click();
        await page.getByText('Local animation only.', { exact: false }).waitFor();
        assert.equal(await page.locator('.ledger-panel').count(), 0);
        await page.waitForFunction(() => document.querySelector('.ledger-panel'), { timeout: 15000 });
        assert.equal(await tokens.count(), total);
        await page.getByRole('button', { name: 'Return to live' }).click();
        assert.equal(await page.getByRole('button', { name: 'Return to live' }).count(), 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.getByRole('button', { name: 'Replay this scene' }).click();
        assert.equal(await tokens.count(), total);
        assert.equal(await page.locator('.ledger-panel').count(), 1);
        assert.equal(await tokens.first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
      }
    }
    await page.close();
  }
  assert.deepEqual(failures, [], 'browser exceptions');
  assert.deepEqual(mutations, [], 'view/replay must not issue writes');
  await writeFile(`${out}browser-results.json`, JSON.stringify({ checks, failures, mutations, interactions: ['Alone/Pooled', 'all buyer popovers within viewport', 'replay finishes', 'return to live', 'reduced-motion immediate replay'] }, null, 2));
  console.log(`${checks.length} route/viewport/theme checks passed; replay and popovers passed; no page errors or HTTP writes.`);
} finally { await browser.close(); }
