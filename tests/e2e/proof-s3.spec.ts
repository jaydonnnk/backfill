import { test } from './proof-s7-fixture';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { connectDb, type Db } from '../../src/lib/db/client';
import { ownerChanges, ownerChangeOutcomes, ownerVoiceEdits, rules } from '../../src/lib/db/schema';
import { demoSnapshot, DEMO_MERCHANT_NAME } from '../../src/lib/demo/snapshot';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';
import { publishDraft, readMenu } from '../../src/lib/onboarding/service';
import { MENU, PHOTO, SETTINGS } from '../support/proof-s1';
import { silentOwnerWav, S3_CORRECTION, S3_TRANSCRIPT } from '../support/proof-s3';

function configuration() {
  const app = new URL(process.env.S1_APP_URL ?? 'http://missing.invalid');
  expect(app.hostname).toBe('127.0.0.1');
  const admin = new URL(process.env.S1_ADMIN_URL ?? 'http://missing.invalid');
  expect([admin.hostname, admin.port]).toEqual(['127.0.0.1', '5432']);
  expect(admin.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
  const evidence = process.env.S3_EVIDENCE_DIR;
  if (!evidence) throw new Error('Use the S3 isolated browser launcher');
  return { admin, evidence };
}
async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([{ name: MERCHANT_COOKIE, value: token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
}
async function freshOffer(db: Db, name: string) {
  const owner = await mintMerchant(db, name);
  const draft = await readMenu(db, owner.id, PHOTO, async () => MENU, 'fixture:s3-menu');
  if (!('draftId' in draft)) throw new Error('Menu fixture failed');
  const publication = await publishDraft(db, owner.id, draft.draftId, SETTINGS);
  if (publication.status !== 'published') throw new Error('Publication failed');
  const before = (await db.select().from(rules).where(eq(rules.id, publication.ruleId)))[0];
  if (!before) throw new Error('Rule missing');
  return { owner, ruleId: publication.ruleId, before };
}
function group(page: Page, ruleId: string) { return page.getByRole('group', { name: `Voice edit for offer ${ruleId}`, exact: true }); }
async function transcribe(field: Locator, bytes = silentOwnerWav()) {
  await field.getByLabel('Owner instruction WAV', { exact: true }).setInputFiles({ name: 'synthetic-silence.wav', mimeType: 'audio/wav', buffer: bytes });
  await field.getByRole('button', { name: 'Transcribe audio', exact: true }).click();
}
async function uploadAndReview(field: Locator) {
  await transcribe(field);
  await expect(field.getByRole('textbox', { name: 'Review transcript', exact: true })).toHaveValue(S3_TRANSCRIPT);
  await expect(field.getByText('Fixture transcript.', { exact: false })).toBeVisible();
  await expect(field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true })).toHaveCount(0);
  await field.getByRole('button', { name: 'Save reviewed transcript', exact: true }).click();
  await expect(field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true })).toBeVisible();
}
async function proposed(field: Locator, discount = '25%') {
  await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
  await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toBeVisible();
  await expect(field.getByText('Fixture Wonder proposal.', { exact: false }).first()).toBeVisible();
  const table = field.getByRole('table', { name: 'Exact change for this offer' });
  await expect(table.getByRole('columnheader')).toHaveText(['Term', 'Current', 'Proposed']);
  await expect(table.getByRole('row').filter({ hasText: 'Discount' })).toContainText(`20%${discount}`);
  await expect(table.getByRole('row').filter({ hasText: 'Capacity' })).toContainText('810');
  await expect(table.getByRole('row').filter({ hasText: 'Minimum pool' })).toContainText('86');
  await expect(table.getByRole('row').filter({ hasText: 'Per-agent cap' })).toContainText('23');
}
async function capture(page: Page, evidence: string, name: string) {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const png = await page.screenshot({ path: `${evidence}/${name}-${width}.png`, fullPage: true });
    expect(png.readUInt32BE(16)).toBe(width);
  }
}
async function stored(db: Db, ownerId: string, ruleId: string) {
  const edits = await db.select().from(ownerVoiceEdits).where(and(eq(ownerVoiceEdits.merchantId, ownerId), eq(ownerVoiceEdits.ruleId, ruleId)));
  const changes = await db.select().from(ownerChanges).where(eq(ownerChanges.merchantId, ownerId));
  const outcomes = [];
  for (const change of changes) outcomes.push(...await db.select().from(ownerChangeOutcomes).where(eq(ownerChangeOutcomes.changeId, change.id)));
  return { edits, changes, outcomes, rule: (await db.select().from(rules).where(eq(rules.id, ruleId)))[0] };
}

for (const repetition of [1, 2]) {
  test(`S3 owner upload, reviewed transcript, exact proposal and separate approval, fresh state ${repetition}`, async ({ page, context }) => {
    const { admin: url, evidence } = configuration();
    const admin = connectDb(url.toString(), 2);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const { owner, ruleId, before } = await freshOffer(admin.db, `SCRIPTED S3 fresh owner ${repetition}`);
      await signIn(context, owner.token); await page.goto('/merchant');
      const field = group(page, ruleId);
      await uploadAndReview(field);
      expect((await stored(admin.db, owner.id, ruleId)).rule).toEqual(before);
      await proposed(field);
      const unapproved = await stored(admin.db, owner.id, ruleId);
      expect(unapproved.rule).toEqual(before);
      expect(unapproved.outcomes).toEqual([]);
      expect(unapproved.edits).toHaveLength(1);
      expect(unapproved.edits[0]).toMatchObject({
        merchantId: owner.id, ruleId, termsVersion: 1, phase: 'proposed',
        source: 'fixture', voiceModel: 'fixture:s3-voice', wonderModel: 'fixture:s3-wonder',
        audioSha256: createHash('sha256').update(silentOwnerWav()).digest('hex'),
        audioDurationMs: 1000, sampleRate: 16000, rawTranscript: S3_TRANSCRIPT, transcript: S3_TRANSCRIPT,
        providerSessionId: 'fixture-s3-asr', audioCostNanoUsd: null, approvedAt: null,
      });
      expect(unapproved.edits[0]?.reviewedAt).not.toBeNull();
      expect(unapproved.changes[0]).toMatchObject({ voiceEditId: unapproved.edits[0]?.id, transcriptRevision: unapproved.edits[0]?.revision, wamid: null });
      if (repetition === 2) await capture(page, evidence, 'owner-unapproved');
      await field.getByRole('button', { name: 'Approve this exact change', exact: true }).click();
      await expect(field.getByText('Applied. Your offer now uses the approved terms.', { exact: true })).toBeVisible();
      await expect(page.getByText('Terms v2', { exact: true })).toBeVisible();
      const applied = await stored(admin.db, owner.id, ruleId);
      expect(applied.rule).toMatchObject({ termsVersion: 2, discountBps: 2500, capacityCovers: 10, minPoolCovers: 6, perAgentCapCovers: 3 });
      expect(applied.rule?.floorPriceCents).toBe(before.floorPriceCents);
      expect(applied.outcomes).toHaveLength(1);
      expect(applied.outcomes[0]).toMatchObject({ changeId: applied.edits[0]?.proposalId, outcome: 'applied' });
      expect(applied.edits[0]?.approvedAt).not.toBeNull();
      expect(applied.edits[0]?.approvedVersion).toBe(2);
      await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toHaveCount(0);
      if (repetition === 2) await capture(page, evidence, 'owner-applied');
      await page.reload();
      expect((await stored(admin.db, owner.id, ruleId)).rule?.termsVersion).toBe(2);
      expect((await stored(admin.db, owner.id, ruleId)).outcomes).toHaveLength(1);
      expect(errors).toEqual([]);
      await writeFile(`${evidence}/browser-owner-run-${repetition}.json`, JSON.stringify({
        provenance: '1-second generated silence WAV; authored Voice/Wonder boundary fixtures; scripted UI owner review and separate approval',
        ownerId: owner.id, ruleId, before, unapproved, applied, browserErrors: errors, genuineModelCalls: 0,
      }, null, 2) + '\n');
    } finally { await admin.close(); }
  });
}

test('S3 transcript correction invalidates the prior proposal and spoken yes cannot approve it', async ({ page, context }) => {
  const { admin: url, evidence } = configuration(); const admin = connectDb(url.toString(), 2);
  try {
    const { owner, ruleId, before } = await freshOffer(admin.db, 'SCRIPTED S3 transcript correction');
    await signIn(context, owner.token); await page.goto('/merchant'); const field = group(page, ruleId);
    await uploadAndReview(field); await proposed(field);
    const first = await stored(admin.db, owner.id, ruleId);
    await field.getByRole('textbox', { name: 'Review transcript', exact: true }).fill('yes');
    await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toHaveCount(0);
    await field.getByRole('button', { name: 'Save reviewed transcript', exact: true }).click();
    await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
    await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toHaveCount(0);
    expect((await stored(admin.db, owner.id, ruleId)).rule).toEqual(before);
    expect((await stored(admin.db, owner.id, ruleId)).outcomes).toEqual([]);
    await field.getByRole('textbox', { name: 'Review transcript', exact: true }).fill(S3_CORRECTION);
    await field.getByRole('button', { name: 'Save reviewed transcript', exact: true }).click();
    await proposed(field, '15%');
    const corrected = await stored(admin.db, owner.id, ruleId);
    expect(corrected.edits[0]?.proposalId).not.toBe(first.edits[0]?.proposalId);
    expect(corrected.edits[0]?.revision).toBeGreaterThan(first.edits[0]?.revision ?? 0);
    expect(corrected.rule).toEqual(before);
    await capture(page, evidence, 'owner-corrected');
    await field.getByRole('button', { name: 'Approve this exact change', exact: true }).click();
    await expect(field.getByText('Applied. Your offer now uses the approved terms.', { exact: true })).toBeVisible();
    const applied = await stored(admin.db, owner.id, ruleId);
    expect(applied.rule).toMatchObject({ termsVersion: 2, discountBps: 1500 });
    expect(applied.outcomes).toHaveLength(1);
    await writeFile(`${evidence}/browser-transcript-correction.json`, JSON.stringify({ first, corrected, applied, provenance: 'fixture boundaries and scripted UI actions; no ASR/model proof' }, null, 2) + '\n');
  } finally { await admin.close(); }
});

test('S3 cancellation, invalid bytes, wrong owner, missing session and interrupted proposal preserve terms', async ({ page, context }) => {
  const { admin: url, evidence } = configuration(); const admin = connectDb(url.toString(), 2);
  try {
    const { owner, ruleId, before } = await freshOffer(admin.db, 'SCRIPTED S3 failure outcomes');
    await signIn(context, owner.token); await page.goto('/merchant'); let field = group(page, ruleId);
    await transcribe(field, Buffer.from('OggSnotWav'));
    await expect(field.getByText('This file is not a supported WAV.', { exact: false })).toBeVisible();
    expect((await stored(admin.db, owner.id, ruleId)).edits).toHaveLength(0);
    expect((await stored(admin.db, owner.id, ruleId)).rule).toEqual(before);
    await uploadAndReview(field);
    const beforeInterruption = await stored(admin.db, owner.id, ruleId);
    await page.route('**/merchant', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
    await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
    await expect(field.getByText('The request was interrupted.', { exact: false })).toBeVisible();
    expect(await stored(admin.db, owner.id, ruleId)).toEqual(beforeInterruption);
    await page.unroute('**/merchant');
    await proposed(field);
    await field.getByRole('button', { name: 'Discard voice edit', exact: true }).click();
    await expect(field.getByText('Discarded. Your offer is unchanged.', { exact: true })).toBeVisible();
    expect((await stored(admin.db, owner.id, ruleId)).rule).toEqual(before);
    expect((await stored(admin.db, owner.id, ruleId)).outcomes).toEqual([]);
    await capture(page, evidence, 'owner-refused');
    await page.reload(); field = group(page, ruleId); await uploadAndReview(field);
    const ownEdit = await stored(admin.db, owner.id, ruleId);
    const outsider = await mintMerchant(admin.db, 'SCRIPTED S3 other owner');
    await signIn(context, outsider.token);
    await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
    await expect(field.getByText('This voice edit is unavailable for your account.', { exact: true })).toBeVisible();
    expect(await stored(admin.db, owner.id, ruleId)).toEqual(ownEdit);
    await signIn(context, owner.token); await page.reload(); field = group(page, ruleId);
    await context.clearCookies(); await transcribe(field);
    await expect(field.getByText('Your session ended. Open your merchant link again.', { exact: true })).toBeVisible();
    expect(await stored(admin.db, owner.id, ruleId)).toEqual(ownEdit);
    const final = await stored(admin.db, owner.id, ruleId);
    expect(final.rule).toEqual(before);
    await writeFile(`${evidence}/browser-failures.json`, JSON.stringify({
      provenance: 'actual UI/actions/database with fixture boundaries; proposal request interrupted before delivery',
      invalidBytes: 'rejected without edit row', interrupted: 'state unchanged', cancelled: 'state unchanged',
      wrongOwner: 'unavailable; state unchanged', missingSession: 'signed out; state unchanged', before, final,
    }, null, 2) + '\n');
  } finally { await context.clearCookies(); await admin.close(); }
});

test('S3 mixed manual-only request changes nothing and private voice data stays out of public HTML, snapshot and SSE', async ({ page, context, baseURL }) => {
  const { admin: url, evidence } = configuration(); const admin = connectDb(url.toString(), 2);
  try {
    const { owner, ruleId, before } = await freshOffer(admin.db, DEMO_MERCHANT_NAME);
    await signIn(context, owner.token); await page.goto('/merchant'); const field = group(page, ruleId);
    await uploadAndReview(field);
    const privateText = 'S3_PRIVATE_TRANSCRIPT_CANARY set discount to 25 percent and private floor to 1 dollar.';
    await field.getByRole('textbox', { name: 'Review transcript', exact: true }).fill(privateText);
    await field.getByRole('button', { name: 'Save reviewed transcript', exact: true }).click();
    await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
    await expect(field.getByText('Window and private-floor edits need manual review.', { exact: false })).toBeVisible();
    await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toHaveCount(0);
    const unchanged = await stored(admin.db, owner.id, ruleId);
    expect(unchanged.rule).toEqual(before); expect(unchanged.outcomes).toEqual([]);
    const snapshot = await demoSnapshot(admin.db);
    const forbidden = /S3_PRIVATE_TRANSCRIPT_CANARY|rawTranscript|audioSha256|owner_voice|fixture-s3-asr|floorPriceCents/;
    expect(JSON.stringify(snapshot)).not.toMatch(forbidden);
    await page.goto('/demo');
    const html = await page.request.get('/demo'); expect(await html.text()).not.toMatch(forbidden);
    const controller = new AbortController(); const response = await fetch(`${baseURL}/api/demo/stream`, { signal: controller.signal });
    const reader = response.body?.getReader(); if (!reader) throw new Error('Missing SSE body');
    let sse = '';
    try {
      while (!sse.includes('data: ')) { const chunk = await reader.read(); if (chunk.done) throw new Error('SSE ended'); sse += new TextDecoder().decode(chunk.value); }
      expect(sse).not.toMatch(forbidden);
    } finally { await reader.cancel(); controller.abort(); }
    await writeFile(`${evidence}/browser-privacy.json`, JSON.stringify({ ownerId: owner.id, ruleId, unchanged, publicChecks: { snapshot: true, html: true, sse: true }, provenance: 'actual stored private fixture transcript excluded from public routes' }, null, 2) + '\n');
  } finally { await admin.close(); }
});

test('S3 upload response interruption retries the same edit without a duplicate transaction', async ({ page, context }) => {
  const { admin: url, evidence } = configuration(); const admin = connectDb(url.toString(), 2);
  try {
    const { owner, ruleId, before } = await freshOffer(admin.db, 'SCRIPTED S3 lost upload response');
    await signIn(context, owner.token); await page.goto('/merchant'); const field = group(page, ruleId);
    let dropped = false;
    await page.route('**/merchant', async route => {
      if (!dropped && route.request().method() === 'POST') {
        dropped = true;
        // The server's real upload transaction completes before its response is lost.
        const response = await route.fetch(); expect(response.ok()).toBe(true);
        await route.abort('failed');
      } else await route.continue();
    });
    await transcribe(field);
    await expect(field.getByText('The request was interrupted.', { exact: false })).toBeVisible();
    const interrupted = await stored(admin.db, owner.id, ruleId);
    expect(interrupted.edits).toHaveLength(1);
    expect(interrupted.edits[0]).toMatchObject({ phase: 'transcribed', rawTranscript: S3_TRANSCRIPT });
    expect(interrupted.rule).toEqual(before);
    await transcribe(field);
    await expect(field.getByRole('textbox', { name: 'Review transcript', exact: true })).toHaveValue(S3_TRANSCRIPT);
    const retried = await stored(admin.db, owner.id, ruleId);
    await writeFile(`${evidence}/browser-upload-response-retry.json`, JSON.stringify({
      provenance: 'actual upload transaction; its response deliberately aborted after route.fetch; repeated same WAV through UI',
      before, interrupted, retried, dropped,
    }, null, 2) + '\n');
    expect(retried.edits).toHaveLength(1);
    expect(retried.edits[0]?.id).toBe(interrupted.edits[0]?.id);
    expect(retried.rule).toEqual(before);
  } finally { await page.unroute('**/merchant'); await admin.close(); }
});
