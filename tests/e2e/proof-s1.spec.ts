import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { singaporeLocal } from '../../src/domain/singapore-time';
import { singaporeInstant } from '../../src/domain/commitments/occurrence';
import { mintAgent } from '../../src/lib/agents/tokens';
import { connectDb } from '../../src/lib/db/client';
import { clearings, clearingFills, ledger, llmCalls, offerPublications, planApplications, rules } from '../../src/lib/db/schema';
import { merchantLedger } from '../../src/lib/ledger/service';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';
import { readMenu, replanSoldOut } from '../../src/lib/onboarding/service';
import { call, connectBuyer, MENU, PHOTO, PLAN, submission } from '../support/proof-s1';

test('scripted S1 merchant review, seven independent MCP parties, deadline outcomes and owner approval', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000);
  expect(new URL(baseURL ?? '').hostname).toBe('127.0.0.1');
  const url = new URL(process.env.S1_DATABASE_URL ?? 'http://missing.invalid');
  expect(url.hostname).toBe('127.0.0.1');
  expect(url.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
  const adminUrl = new URL(process.env.S1_ADMIN_URL ?? 'http://missing.invalid');
  expect(adminUrl.hostname).toBe('127.0.0.1');
  expect(adminUrl.pathname).toBe(url.pathname);
  const connection = connectDb(url.toString(), 6);
  const admin = connectDb(adminUrl.toString(), 2);
  const db = connection.db;
  const evidence = process.env.S1_EVIDENCE_DIR;
  if (!evidence) throw new Error('Use the isolated S1 browser launcher');
  const clients: Awaited<ReturnType<typeof connectBuyer>>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const scenarios = [];
  try {
    const local = singaporeLocal(new Date(Date.now() + 120_000));
    // Keep enough same-day room for the real-time window and the deadline.
    expect(local.minute).toBeLessThan(1379);
    const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    for (const [scenario, partyCount] of [['success', 4], ['insufficient', 3]] as const) {
      const owner = await mintMerchant(admin.db, `SCRIPTED browser S1 ${scenario}`);
      const draft = await readMenu(db, owner.id, PHOTO, async () => MENU, 'fixture:s1-menu');
      if (!('draftId' in draft)) throw new Error('Menu fixture failed');
      await context.addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
      await page.goto(`/merchant/drafts/${draft.draftId}`);
      await expect(page.getByRole('heading', { name: 'Check your menu' })).toBeVisible();
      await expect(page.getByText('Fixture kaya toast', { exact: true })).toBeVisible();
      await page.getByRole('combobox', { name: 'Day', exact: true }).selectOption(String(local.weekday));
      await page.getByLabel('Starts', { exact: true }).fill(clock(local.minute + 1));
      await page.getByLabel('Ends', { exact: true }).fill(clock(local.minute + 60));
      await page.getByLabel('Buyers commit by').fill(clock(local.minute));
      await page.getByLabel('Discount (%)', { exact: true }).fill('20');
      await page.getByLabel('Covers available').fill('8');
      await page.getByLabel('Unlocks at (covers)').fill('8');
      await page.getByLabel('Most covers per agent').fill('2');
      await page.getByLabel('Your floor per cover', { exact: false }).fill('5.03');
      await page.getByRole('button', { name: 'Confirm and publish' }).click();
      await expect(page.getByText('Open to commitments', { exact: true })).toBeVisible();
      const [publication] = await db.select().from(offerPublications).where(eq(offerPublications.draftId, draft.draftId));
      if (!publication) throw new Error('Browser publication missing');
      const ruleId = publication.ruleId;
      const parties = [];
      for (let n = 1; n <= partyCount; n++) {
        const agent = await mintAgent(admin.db, `browser-s1-${scenario}-${n}`, `SCRIPTED browser party ${n}`);
        const client = await connectBuyer(agent.token, `${baseURL}/mcp`);
        clients.push(client);
        expect(await call(client, 'get_agent_terms', { ruleId })).toMatchObject({ ok: true, terms: { offer: { offerPriceCents: 544, minPoolCovers: 8 } } });
        const input = submission(ruleId, local.date, agent.id);
        const result = await call(client, 'submit_commitment', input);
        expect(result).toMatchObject({ ok: true, commitment: { status: 'pending' } });
        if (!result.ok || !('commitment' in result)) throw new Error('Browser MCP refused');
        const id = result.commitment.commitmentId;
        expect(await call(client, 'submit_commitment', input)).toMatchObject({ ok: true, replayed: true, commitment: { commitmentId: id } });
        parties.push({ id, agentId: agent.id, client });
      }
      for (const party of parties) expect(await call(party.client, 'get_commitment_status', { commitmentId: party.id })).toMatchObject({ ok: true, commitment: { status: 'pending' } });
      expect((await merchantLedger(db, owner.id)).totals.entries).toBe(0);
      await page.reload();
      await expect(page.getByText('0 filled commitments, 0 covers.', { exact: false })).toBeVisible();
      await page.screenshot({ path: `${evidence}/browser-${scenario}-pending.png`, fullPage: true });
      scenarios.push({ scenario, owner, ruleId, parties });
    }
    // The app's real wall clock settles; no test-only booking/settlement endpoint exists.
    const deadline = singaporeInstant(local.date, local.minute);
    const waitMs = deadline.getTime() - Date.now() + 100;
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    const receipts = [];
    for (const { scenario, owner, ruleId, parties } of scenarios) {
      for (let pass = 0; pass < 2; pass++) for (const party of parties) expect(await call(party.client, 'get_commitment_status', { commitmentId: party.id })).toMatchObject({ ok: true, commitment: { status: scenario === 'success' ? 'filled' : 'not_filled' } });
      const original = (await db.select().from(rules).where(eq(rules.id, ruleId)))[0];
      expect(await replanSoldOut(db, { id: owner.id, name: `SCRIPTED browser S1 ${scenario}` }, async () => PLAN, 'fixture:s1-wonder')).toEqual({ status: 'planned', planned: scenario === 'success' ? 1 : 0 });
      expect((await db.select().from(rules).where(eq(rules.id, ruleId)))[0]).toEqual(original);
      await context.addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
      await page.goto('/merchant');
      if (scenario === 'success') {
        await expect(page.getByText('4 filled commitments, 8 covers.', { exact: false })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Apply plan', exact: true })).toBeVisible();
        await expect(page.getByText('Terms v1', { exact: true })).toBeVisible();
        for (const width of [375, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: `${evidence}/browser-success-unapproved-${width}.png`, fullPage: true });
        }
        await page.getByRole('button', { name: 'Apply plan', exact: true }).click();
        await expect(page.getByText('The plan is applied. Your offer now has the new terms.', { exact: true })).toBeVisible();
        await expect(page.getByText('Terms v2', { exact: true })).toBeVisible();
        expect((await db.select().from(rules).where(eq(rules.id, ruleId)))[0]).toMatchObject({ termsVersion: 2, capacityCovers: 10, discountBps: 1500 });
        expect(await db.select().from(planApplications)).toHaveLength(1);
      } else {
        await expect(page.getByText('0 filled commitments, 0 covers.', { exact: false })).toBeVisible();
        await expect(page.getByText('Pool not reached', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Apply plan', exact: true })).toHaveCount(0);
      }
      const result = await merchantLedger(db, owner.id);
      expect(result).toMatchObject({ reconciled: true, totals: { entries: scenario === 'success' ? 4 : 0, covers: scenario === 'success' ? 8 : 0, buyerShareCents: scenario === 'success' ? 1088 : 0 } });
      expect(await db.select().from(clearings).where(eq(clearings.ruleId, ruleId))).toHaveLength(1);
      expect(await db.select().from(clearingFills).where(eq(clearingFills.ruleId, ruleId))).toHaveLength(scenario === 'success' ? 4 : 0);
      expect(await db.select().from(ledger).where(eq(ledger.ruleId, ruleId))).toHaveLength(scenario === 'success' ? 4 : 0);
      await page.screenshot({ path: `${evidence}/browser-${scenario}-final.png`, fullPage: true });
      receipts.push({ scenario, ruleId, parties: parties.map(p => ({ agentId: p.agentId, commitmentId: p.id, approval: 'scripted' })), original, finalRule: (await db.select().from(rules).where(eq(rules.id, ruleId)))[0], ledger: result });
    }
    expect(await db.select().from(llmCalls)).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(`${evidence}/browser-receipt.json`, JSON.stringify({ provenance: 'synthetic model fixtures and scripted buyer/owner actions', appUrl: baseURL, date: local.date, deadline: deadline.toISOString(), visitStart: clock(local.minute + 1), visitEnd: clock(local.minute + 60), modelCalls: 0, browserErrors: errors, receipts }, null, 2) + '\n');
  } finally {
    await Promise.all(clients.map(c => c.close()));
    await connection.close();
    await admin.close();
  }
});
