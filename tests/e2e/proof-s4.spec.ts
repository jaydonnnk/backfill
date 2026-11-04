import { test } from './proof-s7-fixture';
import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { eq, ne } from 'drizzle-orm';
import { connectDb } from '../../src/lib/db/client';
import { buyerSessions, commitments, merchants } from '../../src/lib/db/schema';
import { mintAgent } from '../../src/lib/agents/tokens';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';
import { creativeAssets, clearingFills, ledger, rules } from '../../src/lib/db/schema';
import { getCreative } from '../../src/lib/creative/service';
import { syntheticDishPhoto } from '../support/proof-s5';
import { readMenu, publishDraft } from '../../src/lib/onboarding/service';
import { settleDue } from '../../src/lib/commitments/service';
import { singaporeLocal } from '../../src/domain/singapore-time';
import { singaporeInstant } from '../../src/domain/commitments/occurrence';
import { demoSnapshot, DEMO_MERCHANT_NAME } from '../../src/lib/demo/snapshot';
import { MENU, PHOTO, SETTINGS } from '../support/proof-s1';
import { Session } from '../../src/lib/buyer/service';
function config() {
  const url = new URL(process.env.S1_ADMIN_URL ?? 'http://missing.invalid');
  expect([url.hostname, url.port]).toEqual(['127.0.0.1', '5432']);
  expect(url.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
  const evidence = process.env.S4_EVIDENCE_DIR;
  if (!evidence) throw Error('Use S4 isolated launcher');
  return { url, evidence };
}
async function capture(page: Page, evidence: string, name: string) {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const png = await page.screenshot({ path: `${evidence}/${name}-${width}.png`, fullPage: true });
    expect(png.readUInt32BE(16)).toBe(width);
  }
}
for (const repeat of [1, 2]) test(`S4 four independent reviewed buyers approve exact terms and settle, fresh run ${repeat}`, async ({ page }) => {
  test.setTimeout(100_000);
  const { url, evidence } = config();
  const app = connectDb(url.toString(), 5);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.setViewportSize({ width: repeat === 1 ? 1280 : 375, height: 900 });
    const local = singaporeLocal(new Date(Date.now() + 8 * 60_000));
    expect(local.minute).toBeLessThan(1370);
    const at = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const owner = await mintMerchant(app.db, DEMO_MERCHANT_NAME);
    await app.db.update(merchants).set({ name: 'Retained prior local proof merchant' }).where(ne(merchants.id, owner.id));
    const draft = await readMenu(app.db, owner.id, PHOTO, async () => MENU, 'fixture:s4-menu');
    if (!('draftId' in draft)) throw Error('draft');
    const pub = await publishDraft(app.db, owner.id, draft.draftId, { ...SETTINGS, terms: { ...SETTINGS.terms, window: { weekday: local.weekday, commitByMinute: local.minute, startMinute: local.minute + 1, endMinute: local.minute + 30 } } });
    if (pub.status !== 'published') throw Error('publication');
    const [originalRule] = await app.db.select().from(rules).where(eq(rules.id, pub.ruleId));
    await page.context().addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/merchant');
    const creative = page.getByRole('group', { name: `Creative asset for offer ${pub.ruleId}`, exact: true });
    await creative.getByLabel('Dish photo', { exact: true }).setInputFiles({ name: 'authored-rectangle.png', mimeType: 'image/png', buffer: await syntheticDishPhoto() });
    await creative.getByLabel('Dish or object to isolate', { exact: true }).fill('s7-segmentation-failure');
    await creative.getByLabel('Photo rights basis', { exact: true }).fill('Authored S7 geometry');
    await creative.getByLabel('I permit local processing and composition.', { exact: true }).check();
    await creative.getByLabel('This uses synthetic local offer terms.', { exact: true }).check();
    await creative.getByRole('button', { name: 'Save photo privately', exact: true }).click();
    await creative.getByRole('button', { name: 'Create dish cutout', exact: true }).click();
    await expect(creative.getByText('Optional media failed. Nothing was approved or posted. Your offer remains usable.', { exact: true })).toBeVisible();
    const [mediaRow] = await app.db.select().from(creativeAssets).where(eq(creativeAssets.ruleId, pub.ruleId));
    if (!mediaRow) throw Error('Missing failed media');
    const failedMedia = (await getCreative(app.db, owner.id, mediaRow.id)).asset;
    expect(failedMedia).toMatchObject({ phase: 'failed', reason: 'segmentation_failed' });
    expect((await app.db.select().from(rules).where(eq(rules.id, pub.ruleId)))[0]).toEqual(originalRule);
    await capture(page, evidence, `media-failed-${repeat}`);
    await page.setViewportSize({ width: repeat === 1 ? 1280 : 375, height: 900 });
    await page.context().clearCookies();
    const sessions = [];
    for (let i = 0; i < 4; i++) {
      const party = await mintAgent(app.db, randomUUID(), `Synthetic S4 browser party ${i}`);
      await page.goto('/buyer');
      await expect(page.getByText('Your request is sent to the hosted provider.', { exact: false })).toBeVisible();
      await page.getByLabel('Buyer credential', { exact: true }).fill(party.token);
      await page.getByLabel('Your request', { exact: true }).fill(`Two for kopi on ${local.date} from ${at(local.minute + 1)} to ${at(local.minute + 30)}, SGD6 each.`);
      await page.getByRole('button', { name: 'Save request', exact: true }).click();
      await page.getByRole('button', { name: 'Ask hosted Glimmer', exact: true }).click();
      await expect(page.getByLabel('Party size', { exact: true })).toHaveValue('2');
      await expect(page.getByText('Glimmer: fixture', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Save reviewed constraints', exact: true }).click();
      await expect(page.getByText('State: reviewed.', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Load public offers', exact: true }).click();
      await page.getByLabel('Offer', { exact: true }).selectOption(pub.ruleId);
      await page.getByRole('button', { name: 'Ask Spark Open for a decision', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Decision for this party', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit approved commitment', exact: true })).toBeDisabled();
      expect(await app.db.select().from(commitments).where(eq(commitments.agentId, party.id))).toHaveLength(0);
      if (repeat === 2 && i === 0) {
        // Local unsaved correction also blocks prior approval before it reaches the server.
        await page.getByLabel('Party size', { exact: true }).fill('1');
        await expect(page.getByRole('button', { name: 'Approve these exact terms', exact: true })).toBeDisabled();
        await page.getByLabel('Party size', { exact: true }).fill('2');
        await page.getByRole('button', { name: 'Save reviewed constraints', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Decision for this party', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Ask Spark Open for a decision', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Decision for this party', exact: true })).toBeVisible();
        await capture(page, evidence, 'buyer-unapproved');
      }
      await page.getByRole('button', { name: 'Approve these exact terms', exact: true }).click();
      await expect(page.getByText('Separate approval saved as agent_action.', { exact: true })).toBeVisible();
      // Drop the successful response after the real transaction. Recovery must not resubmit.
      if (repeat === 2 && i === 0) await page.route('**/api/buyer', async route => {
        const body = route.request().postDataJSON();
        if (body?.action === 'submit') { await route.fetch(); await route.abort('failed'); }
        else await route.continue();
      });
      await page.getByRole('button', { name: 'Submit approved commitment', exact: true }).click();
      if (repeat === 2 && i === 0) {
        await expect(page.locator('main').getByRole('status')).toContainText('response was interrupted');
        await page.unroute('**/api/buyer');
        await page.getByRole('button', { name: 'Check saved state', exact: true }).click();
      }
      await expect(page.getByText('Stored commitment', { exact: false })).toBeVisible();
      const rows = await app.db.select().from(buyerSessions).where(eq(buyerSessions.partyId, party.id));
      const s = Session.parse(rows[0]?.record);
      expect(s).toMatchObject({ phase: 'submitted', decision: { covers: 2 }, approval: { source: 'agent_action' }, parseReceipt: { source: 'fixture', route: 'nvidia_nim', model: 'fixture:glimmer' }, decisionReceipt: { source: 'fixture', model: 'fixture:spark-open' } });
      expect(await app.db.select().from(commitments).where(eq(commitments.agentId, party.id))).toHaveLength(1);
      sessions.push(s);
      if (repeat === 2 && i === 0) await capture(page, evidence, 'buyer-pending');
    }
    const pending = await demoSnapshot(app.db);
    expect(pending.scene?.id).toBe(`${pub.ruleId}:${local.date}`);
    expect(pending.scene?.pooled).toMatchObject({ filledCovers: 0, covers: 8 });
    await settleDue(app.db, owner.id, () => singaporeInstant(local.date, local.minute + 1));
    const settled = await demoSnapshot(app.db, singaporeInstant(local.date, local.minute + 1));
    expect(settled.scene?.pooled.filledCovers).toBe(8);
    expect(await app.db.select().from(clearingFills).where(eq(clearingFills.ruleId, pub.ruleId))).toHaveLength(4);
    expect(await app.db.select().from(ledger).where(eq(ledger.ruleId, pub.ruleId))).toHaveLength(4);
    expect(JSON.stringify({ pending, settled, sessions })).not.toMatch(/floorPriceCents|rawTranscript|audioSha256|sourceBytes|segmentation_failed/);
    expect(errors).toEqual([]);
    await writeFile(`${evidence}/browser-buyers-${repeat}.json`, JSON.stringify({ provenance: 'authored model fixtures; actual scripted buyer UI actions, MCP and PostgreSQL; not human consent', failedMedia: { id: failedMedia?.id, phase: failedMedia?.phase, reason: failedMedia?.reason }, sameOfferThroughMediaFailureAndSettlement: pub.ruleId, sessions, pending, settled, errors }, null, 2));
  } finally { await app.close(); }
});

test('S4 ambiguous request, manual clarification, discard and cross-party HTTP protection', async ({ page, request }) => {
  const { url, evidence } = config();
  const app = connectDb(url.toString(), 2);
  try {
    const party = await mintAgent(app.db, randomUUID(), 'Synthetic ambiguity');
    await page.goto('/buyer');
    await page.getByLabel('Buyer credential', { exact: true }).fill(party.token);
    await page.getByLabel('Your request', { exact: true }).fill('ambiguous afternoon for two');
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await page.getByRole('button', { name: 'Ask hosted Glimmer', exact: true }).click();
    await expect(page.getByText('Clarification required.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Budget currency', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Maximum per cover, in cents', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Ask Spark Open for a decision', exact: true })).toBeDisabled();
    await capture(page, evidence, 'buyer-clarification');
    const [row] = await app.db.select().from(buyerSessions).where(eq(buyerSessions.partyId, party.id));
    const s = Session.parse(row?.record);
    const other = await mintAgent(app.db, randomUUID(), 'Other synthetic party');
    const response = await request.post('/api/buyer', { headers: { Authorization: `Bearer ${other.token}` }, data: { action: 'get', id: s.id } });
    expect((await response.json()).session).toBeNull();
    await page.getByRole('button', { name: 'Discard request', exact: true }).click();
    await expect(page.getByText('State: discarded.', { exact: false })).toBeVisible();
    expect(await app.db.select().from(commitments).where(eq(commitments.agentId, party.id))).toHaveLength(0);
  } finally { await app.close(); }
});
test('S4 ignores delayed replies after credential changes and preserves text edited during parsing', async ({ page }) => {
  const { url } = config();
  const app = connectDb(url.toString(), 2);
  try {
    const a = await mintAgent(app.db, randomUUID(), 'Synthetic delayed A');
    const b = await mintAgent(app.db, randomUUID(), 'Synthetic delayed B');
    await page.goto('/buyer');
    await page.getByLabel('Buyer credential', { exact: true }).fill(a.token);
    await page.getByLabel('Your request', { exact: true }).fill('Private request A');
    let release!: () => void;
    let entered!: () => void;
    let pending = new Promise<void>(resolve => { release = resolve; });
    let started = new Promise<void>(resolve => { entered = resolve; });
    await page.route('**/api/buyer', async route => { const response = await route.fetch(); entered(); await pending; await route.fulfill({ response }); });
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await started;
    await page.getByLabel('Buyer credential', { exact: true }).fill(b.token);
    await page.getByLabel('Your request', { exact: true }).fill('New buyer request B');
    release();
    await expect(page.getByRole('button', { name: 'Save request', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Your request', { exact: true })).toHaveValue('New buyer request B');
    await expect(page.getByText('Private request A', { exact: true })).toHaveCount(0);
    await page.unroute('**/api/buyer');
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ask hosted Glimmer', exact: true })).toBeEnabled();
    pending = new Promise<void>(resolve => { release = resolve; });
    started = new Promise<void>(resolve => { entered = resolve; });
    await page.route('**/api/buyer', async route => { const response = await route.fetch(); entered(); await pending; await route.fulfill({ response }); });
    await page.getByRole('button', { name: 'Ask hosted Glimmer', exact: true }).click();
    await started;
    await page.getByLabel('Your request', { exact: true }).fill('Corrected while parsing');
    release();
    await expect(page.getByRole('button', { name: 'Save corrected request', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Your request', { exact: true })).toHaveValue('Corrected while parsing');
  } finally { await app.close(); }
});
test('S4 offers a new request after expiry', async ({ page }) => {
  const { url } = config(); const app = connectDb(url.toString(), 2);
  try {
    const party = await mintAgent(app.db, randomUUID(), 'Synthetic expired');
    await page.goto('/buyer'); await page.getByLabel('Buyer credential', { exact: true }).fill(party.token);
    await page.getByLabel('Your request', { exact: true }).fill('Expiry example');
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ask hosted Glimmer', exact: true })).toBeEnabled();
    const [row] = await app.db.select().from(buyerSessions).where(eq(buyerSessions.partyId, party.id));
    const s = Session.parse(row?.record);
    await app.db.update(buyerSessions).set({ record: { ...s, expiresAt: new Date(Date.now() - 1000).toISOString() } }).where(eq(buyerSessions.id, s.id));
    await page.getByRole('button', { name: 'Check saved state', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start a new request', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start a new request', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save request', exact: true })).toBeVisible();
  } finally { await app.close(); }
});
