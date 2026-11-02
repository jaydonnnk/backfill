import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { eq } from 'drizzle-orm';
import { connectDb } from '../../src/lib/db/client';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';
import { mintAgent } from '../../src/lib/agents/tokens';
import { readMenu } from '../../src/lib/onboarding/service';
import { singaporeLocal } from '../../src/domain/singapore-time';
import { offerPublications, llmCalls } from '../../src/lib/db/schema';
import { mcpConnector } from '../../sim/buyers/run';
import { merchantLedger } from '../../src/lib/ledger/service';

// The vision result is an explicit offline fixture. Publish, MCP and clearing use the real app.
test('merchant review and publication, two MCP buyers, clearing and ledger', async ({ page, context, baseURL }) => {
  test.setTimeout(260_000);
  const appUrl = new URL(baseURL ?? '');
  expect(appUrl.hostname).toBe('127.0.0.1');
  const config = parseEnv(await readFile('/tmp/backfill-s95-preview/.env.local', 'utf8'));
  const url = new URL(config.DATABASE_URL ?? '');
  expect(url.hostname).toBe('127.0.0.1');
  expect(url.pathname).toMatch(/^\/backfill_t_s95_preview_/);
  const connection = connectDb(url.toString(), 3);
  const { db } = connection;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const merchant = await mintMerchant(db, 'S9.5 synthetic browser merchant');
    const extracted = await readMenu(db, merchant.id, Buffer.from('89504e470d0a1a0a', 'hex'), async () => ({ currency: 'SGD', items: [{ name: 'Synthetic toast set', priceCents: 600 }], cover: { itemIndexes: [0], description: 'Synthetic toast set' } }), 'synthetic-browser-fixture');
    if (!('draftId' in extracted)) throw new Error('Offline draft fixture failed');
    const draftId = extracted.draftId;
    await context.addCookies([{ name: MERCHANT_COOKIE, value: merchant.token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/merchant?status=published&published=${draftId}`);
    await expect(page.locator('.kopi-bubble')).toContainText('Menu ready. Confirm your terms.');
    await expect(page.locator('.onboarding-steps [aria-current="step"]')).toHaveText('02 / Confirm your terms');
    // Rejected bytes cannot call a provider. Delay the actual request to observe form pending state.
    await page.route('**/merchant*', async route => {
      if (route.request().method() === 'POST') await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.getByLabel('Menu photo').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.getByRole('button', { name: 'Read menu', exact: true }).click();
    await expect(page.locator('.kopi-bubble')).toContainText('Reading menu');
    await expect(page.getByText('That file is not a JPEG, PNG or WebP photo.', { exact: true })).toBeVisible();
    await expect(page.locator('.kopi-bubble')).toContainText('Menu ready. Confirm your terms.');
    await page.unroute('**/merchant*');
    const refused = await readMenu(db, merchant.id, Buffer.from('89504e470d0a1a0a', 'hex'), async () => ({ currency: 'SGD', items: [], cover: { itemIndexes: [0], description: 'Unreadable fixture' } }), 'synthetic-refused-fixture');
    if (!('draftId' in refused)) throw new Error('Refused fixture missing');
    await page.goto(`/merchant/drafts/${refused.draftId}`);
    await expect(page.locator('.onboarding-steps [aria-current="step"]')).toHaveText('01 / Read your menu');
    await expect(page.getByRole('button', { name: 'Confirm and publish' })).toHaveCount(0);
    await page.goto(`/merchant/drafts/${draftId}`);
    for (const width of [375, 1280]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `docs/plans/backfill/evidence/s95/draft-${width}-${colorScheme}.png`, fullPage: true });
    }
    await page.getByLabel('Your floor per cover', { exact: false }).fill('6.00');
    await page.getByRole('button', { name: 'Confirm and publish' }).click();
    await expect(page.getByText('Your floor is above the discounted price', { exact: false })).toBeVisible();
    expect(await db.select().from(offerPublications).where(eq(offerPublications.draftId, draftId))).toHaveLength(0);
    let future = new Date(Date.now() + 120_000);
    if (singaporeLocal(future).minute === 1439) future = new Date(future.getTime() + 60_000);
    const now = singaporeLocal(future);
    const deadline = now.minute;
    const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    await page.getByRole('combobox', { name: 'Day', exact: true }).selectOption(String(now.weekday));
    await page.getByLabel('Starts', { exact: true }).fill(clock(deadline));
    await page.getByLabel('Ends', { exact: true }).fill(clock(Math.min(deadline + 60, 1439)));
    await page.getByLabel('Buyers commit by').fill(clock(deadline));
    await page.getByLabel('Covers available').fill('8');
    await page.getByLabel('Unlocks at (covers)').fill('4');
    await page.getByLabel('Most covers per agent').fill('2');
    await page.getByLabel('Your floor per cover', { exact: false }).fill('4.00');
    await page.getByRole('button', { name: 'Confirm and publish' }).click();
    await expect(page.locator('.kopi-bubble')).toContainText('This menu has a published offer.');
    await expect(page.getByText('Open to commitments', { exact: true })).toBeVisible();
    await expect(page.getByText('Menu confirmed', { exact: true })).toBeVisible();
    await expect(page.locator('.onboarding-steps [aria-current="step"]')).toHaveText('03 / Follow your offers');
    const [publication] = await db.select().from(offerPublications).where(eq(offerPublications.draftId, draftId));
    if (!publication) throw new Error('Publication missing');
    const tokens = new Map<string, string>();
    for (const index of [1, 2]) {
      const id = `s95-${merchant.id}-${index}`;
      tokens.set(id, (await mintAgent(db, id, 'Synthetic browser buyer')).token);
    }
    const connect = mcpConnector(appUrl.origin, tokens);
    const pending: { agentId: string; commitmentId: string }[] = [];
    for (const agentId of tokens.keys()) {
      const client = await connect(agentId);
      try {
        const result = await client.call('submit_commitment', { ruleId: publication.ruleId, termsVersion: 1, visitDate: now.date, covers: 2, maxPricePerCoverCents: 450, idempotencyKey: `browser-${agentId}` });
        expect(result).toMatchObject({ ok: true });
        const { ToolReplies } = await import('../../src/lib/mcp/server');
        const parsed = ToolReplies.submit_commitment.parse(result);
        if (!parsed.ok) throw new Error('Commitment refused');
        pending.push({ agentId, commitmentId: parsed.commitment.commitmentId });
      } finally { await client.close(); }
    }
    const first = pending[0]!;
    const client = await connect(first.agentId);
    try {
      await expect.poll(async () => client.call('get_commitment_status', { commitmentId: first.commitmentId }), { timeout: 210_000, intervals: [1000] }).toMatchObject({ ok: true, commitment: { status: 'filled' } });
    } finally { await client.close(); }
    const ledger = await merchantLedger(db, merchant.id);
    expect(ledger.reconciled).toBe(true);
    expect(ledger.totals).toMatchObject({ entries: 2, covers: 4, buyerShareCents: 600, agentShareCents: 0, networkShareCents: 0 });
    for (const width of [375, 1280]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/merchant');
      await expect(page.locator('.merchant-summary')).toContainText('S$6.00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `docs/plans/backfill/evidence/s95/merchant-auth-${width}-${colorScheme}.png`, fullPage: true });
      await page.goto(`/merchant/drafts/${draftId}`);
      await expect(page.locator('.onboarding-steps [aria-current="step"]')).toHaveText('03 / Follow your offers');
    }
    expect(await db.select().from(llmCalls)).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await connection.close(); }
});
