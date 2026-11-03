import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { connectDb } from '../../src/lib/db/client';
import { demoTrails, llmCalls, merchants } from '../../src/lib/db/schema';
import { demoSnapshot, DEMO_MERCHANT_NAME } from '../../src/lib/demo/snapshot';
import { mintAgent } from '../../src/lib/agents/tokens';
import { mintMerchant } from '../../src/lib/onboarding/links';
import { publishDraft, readMenu, replanSoldOut } from '../../src/lib/onboarding/service';
import { singaporeLocal } from '../../src/domain/singapore-time';
import { singaporeInstant } from '../../src/domain/commitments/occurrence';
import { call, connectBuyer, MENU, PHOTO, PLAN, SETTINGS, submission } from '../support/proof-s1';
import { storeScriptedTrail } from '../support/proof-s2';

test('stored S2 trail on the real demo, with pending and settled pools, interrupted feed and recovery', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const url = new URL(process.env.S1_ADMIN_URL ?? 'http://missing.invalid');
  expect([url.hostname, url.port]).toEqual(['127.0.0.1', '5432']);
  expect(url.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
  const evidence = process.env.S2_EVIDENCE_DIR;
  if (!evidence) throw new Error('Use the isolated S2 launcher');
  const admin = connectDb(url.toString(), 4);
  const clients: Awaited<ReturnType<typeof connectBuyer>>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const local = singaporeLocal(new Date(Date.now() + 90_000));
  expect(local.minute).toBeLessThan(1379);
  const deadline = singaporeInstant(local.date, local.minute);
  const scenarios = [];
  let revoked = false;
  try {
    for (const count of [4, 3]) {
      const runId = randomUUID();
      const owner = await mintMerchant(admin.db, DEMO_MERCHANT_NAME);
      const draft = await readMenu(admin.db, owner.id, PHOTO, async () => MENU, 'fixture:s2-menu');
      if (!('draftId' in draft)) throw new Error('Missing draft');
      const terms = { ...SETTINGS, terms: { ...SETTINGS.terms, window: { weekday: local.weekday, startMinute: local.minute + 1, endMinute: local.minute + 60, commitByMinute: local.minute } } };
      const pub = await publishDraft(admin.db, owner.id, draft.draftId, terms);
      if (pub.status !== 'published') throw new Error('Publication failed');
      const ruleId = pub.ruleId;
      const parties = [];
      for (let i = 0; i < count; i++) {
        const agent = await mintAgent(admin.db, `s2-browser-${count}-${i}`, `Synthetic party ${i + 1}`);
        const client = await connectBuyer(agent.token, `${baseURL}/mcp`);
        clients.push(client);
        const at = new Date();
        const submitted = await call(client, 'submit_commitment', submission(ruleId, local.date, agent.id));
        if (!submitted.ok || !('commitment' in submitted)) throw new Error('MCP refused');
        const commitmentId = submitted.commitment.commitmentId;
        const variant = (['scripted', 'missing', 'changed_price', 'changed_version'] as const)[i]!;
        await storeScriptedTrail(admin.db, { runId, partyId: agent.id, ruleId, termsVersion: 1, visitDate: local.date, covers: 2, pricePerCoverCents: 544, totalCents: 1088 }, commitmentId, at, variant);
        parties.push({ client, commitmentId, agentId: agent.id, variant });
      }
      const proposal = await mintAgent(admin.db, `s2-browser-proposal-${count}`, 'Proposal only fixture');
      await storeScriptedTrail(admin.db, { runId, partyId: proposal.id, ruleId, termsVersion: 1, visitDate: local.date, covers: 2, pricePerCoverCents: 544, totalCents: 1088 }, null, new Date(), 'no_output');
      await page.goto('/demo');
      await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible();
      await expect(page.getByText('Minimum reached. Waiting for confirmation.', { exact: true })).toHaveCount(count === 4 ? 1 : 0);
      await expect(page.locator('.trail-party')).toHaveCount(count + 1);
      for (const detail of await page.locator('.trail-party').all()) await detail.locator('summary').click();
      await expect(page.getByText('Scripted authorization matches exact terms', { exact: true })).toHaveCount(1);
      await expect(page.getByText('Unavailable. No approval established', { exact: true })).toHaveCount(2);
      await expect(page.getByText('Approval mismatch. No matching authorization', { exact: true })).toHaveCount(count - 2);
      await expect(page.getByText('None. Proposal only', { exact: true })).toBeVisible();
      await expect(page.getByText('Pending. No confirmed booking yet', { exact: true })).toHaveCount(count);
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `${evidence}/demo-${count}-pending-${width}.png`, fullPage: true });
      }
      const pending = await demoSnapshot(admin.db);
      scenarios.push({ ownerId: owner.id, runId, ruleId, count, parties, pending });
      await admin.db.update(merchants).set({ name: `Inactive S2 ${count}` }).where(eq(merchants.id, owner.id));
    }
    // The app's real clock and authenticated status route settle both pools.
    while (Date.now() <= deadline.getTime() + 100) await page.waitForTimeout(Math.min(1000, deadline.getTime() + 101 - Date.now()));
    const receipts = [];
    for (const s of scenarios) {
      for (const party of s.parties) expect(await call(party.client, 'get_commitment_status', { commitmentId: party.commitmentId })).toMatchObject({ ok: true, commitment: { status: s.count === 4 ? 'filled' : 'not_filled' } });
      await admin.db.update(merchants).set({ name: DEMO_MERCHANT_NAME }).where(eq(merchants.id, s.ownerId));
      if (s.count === 4) await replanSoldOut(admin.db, { id: s.ownerId, name: DEMO_MERCHANT_NAME }, async () => ({ ...PLAN, rationale: 'S2_MERCHANT_ONLY_CANARY private floor S$5.03' }), 'fixture:s2-wonder');
      await page.goto('/demo');
      for (const detail of await page.locator('.trail-party').all()) await detail.locator('summary').click();
      await expect(page.getByText(s.count === 4 ? 'Filled at settlement. Simulated checkout' : 'Not filled. No discounted booking or savings', { exact: true })).toHaveCount(s.count);
      if (s.count === 3) {
        await expect(page.getByText('No bookings were confirmed for this group.', { exact: true })).toBeVisible();
        await expect(page.getByText(/diners confirmed/)).toHaveCount(0);
      }
      await page.setViewportSize({ width: 375, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const mobileCapture = await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-375.png`, fullPage: true });
      expect(mobileCapture.readUInt32BE(16)).toBe(375);
      await page.setViewportSize({ width: 1280, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const desktopCapture = await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-1280.png`, fullPage: true });
      expect(desktopCapture.readUInt32BE(16)).toBe(1280);
      const actual = await demoSnapshot(admin.db);
      expect(actual.scene?.pooled.filledCovers).toBe(s.count === 4 ? 8 : 0);
      expect(actual.ledger?.buyerShareCents).toBe(s.count === 4 ? 1088 : 0);
      const html = await page.request.get('/demo');
      expect(await html.text()).not.toMatch(/floorPrice|tokenSha|SCRIPTED S1 WONDER|S2_MERCHANT_ONLY_CANARY|5\.03/);
      const controller = new AbortController();
      const response = await fetch(`${baseURL}/api/demo/stream`, { signal: controller.signal });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing SSE body');
      let publicSse = '';
      try {
        while (!publicSse.includes('data: ')) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('SSE ended before snapshot');
          publicSse += new TextDecoder().decode(chunk.value);
        }
        expect(publicSse).not.toMatch(/floorPrice|tokenSha|SCRIPTED S1 WONDER|S2_MERCHANT_ONLY_CANARY|5\.03/);
        expect(publicSse).toContain(s.ruleId);
      } finally { await reader.cancel(); controller.abort(); }
      if (s.count === 4) {
        // Real storage permission loss interrupts the actual SSE reader. Restore in finally.
        await admin.db.execute(sql`REVOKE SELECT ON demo_trails FROM backfill_app`); revoked = true;
        await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.kopi-bubble')).toContainText('Results may be stale');
        await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
        await page.screenshot({ path: `${evidence}/demo-feed-interrupted.png`, fullPage: true });
        await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`); revoked = false;
        await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
        await page.screenshot({ path: `${evidence}/demo-feed-recovered.png`, fullPage: true });
        await page.context().setOffline(true);
        await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
        await page.screenshot({ path: `${evidence}/demo-feed-disconnected.png`, fullPage: true });
        await page.context().setOffline(false);
        await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
        await page.route('**/api/demo/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"scene":{"phase":"cleared","pooled":{"unlocked":true}},"muse":null,"ledger":null}\n\n' }));
        await page.reload();
        await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible();
        await expect(page.locator('.trail-party')).toHaveCount(5);
        await page.screenshot({ path: `${evidence}/demo-malformed-feed.png`, fullPage: true });
        await page.unroute('**/api/demo/stream');
      }
      receipts.push({ runId: s.runId, count: s.count, ruleId: s.ruleId, parties: s.parties.map(p => ({ commitmentId: p.commitmentId, agentId: p.agentId, variant: p.variant })), pending: s.pending, settled: actual });
      await admin.db.update(merchants).set({ name: `Inactive settled S2 ${s.count}` }).where(eq(merchants.id, s.ownerId));
    }
    expect(await admin.db.select().from(llmCalls)).toEqual([]);
    expect(await admin.db.select().from(demoTrails)).toHaveLength(9);
    expect(errors).toEqual([]);
    await writeFile(`${evidence}/browser-receipt.json`, JSON.stringify({ provenance: 'authored synthetic requests/outputs and scripted approvals; actual HTTP MCP and stored settlement', deadline, date: local.date, modelCalls: 0, browserErrors: errors, feed: { interrupted: 'real SELECT permission loss', recovered: 'restored SELECT, no fresh animation', malformed: 'supplemental malformed SSE retained SSR view' }, receipts }, null, 2) + '\n');
  } finally {
    await page.context().setOffline(false);
    if (revoked) await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`);
    await Promise.all(clients.map(c => c.close()));
    await admin.close();
  }
});
