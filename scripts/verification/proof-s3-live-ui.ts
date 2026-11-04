import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { connectDb } from '../../src/lib/db/client';
import { llmCalls, ownerChangeOutcomes, ownerChanges, ownerVoiceEdits, rules } from '../../src/lib/db/schema';
import { mintMerchant, MERCHANT_COOKIE } from '../../src/lib/onboarding/links';

export async function proveLiveOwnerVoice(options: { appUrl: string; adminUrl: string; directory: string; inputs: string }) {
  const url = new URL(options.adminUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/backfill_t_proof_s3_live_/);
  const admin = connectDb(url.toString(), 2);
  const browser = await chromium.launch();
  const errors: string[] = [];
  async function capture(page: Page, name: string) {
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      const png = await page.screenshot({ path: join(options.directory, `${name}-${width}.png`), fullPage: true });
      assert.equal(png.readUInt32BE(16), width);
    }
  }
  const cases: unknown[] = [];
  let stage = 'initializing';
  try {
    for (const name of ['clear', 'ambiguous'] as const) {
      stage = `${name}-setup`;
      await writeFile(join(options.directory, 'current-case.json'), JSON.stringify({ name }));
      const owner = await mintMerchant(admin.db, `Synthetic café, genuine S3 ${name}`);
      const [before] = await admin.db.insert(rules).values({ merchantId: owner.id, listPriceCents: 680, capacityCovers: 8, weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720, discountBps: 2000, minPoolCovers: 8, perAgentCapCovers: 2, floorPriceCents: 503 }).returning();
      assert(before);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: MERCHANT_COOKIE, value: owner.token, domain: '127.0.0.1', path: '/merchant', httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.name));
      const state = async () => ({
        rule: (await admin.db.select().from(rules).where(eq(rules.id, before.id)))[0],
        edits: await admin.db.select().from(ownerVoiceEdits).where(eq(ownerVoiceEdits.ruleId, before.id)),
        proposals: await admin.db.select().from(ownerChanges).where(eq(ownerChanges.ruleId, before.id)),
        outcomes: await admin.db.select().from(ownerChangeOutcomes),
      });
      try {
        await page.goto(`${options.appUrl}/merchant`);
        await page.getByText('Change by voice', { exact: true }).click();
        const field = page.getByRole('group', { name: `Voice edit for offer ${before.id}`, exact: true });
        stage = `${name}-voice`;
        await field.getByLabel('Or upload an owner instruction WAV', { exact: true }).setInputFiles(join(options.inputs, `${name}.wav`));
        await field.getByRole('button', { name: 'Transcribe audio', exact: true }).click();
        await expect.poll(async () => ['transcribed', 'failed'].includes((await state()).edits[0]?.phase ?? ''), { timeout: 40_000 }).toBe(true);
        const transcribed = await state();
        await writeFile(join(options.directory, `${name}-transcribed-state.json`), JSON.stringify({ ownerId: owner.id, ruleId: before.id, before, ...transcribed }, null, 2) + '\n');
        assert.deepEqual(transcribed.rule, before);
        assert.equal(transcribed.edits[0]?.phase, 'transcribed', 'Genuine ASR did not produce a usable transcript; no retry');
        assert.equal(transcribed.edits[0]?.source, 'provider');
        assert.equal(transcribed.edits[0]?.voiceModel, 'muse-voice-transcribe-1.0');
        const raw = transcribed.edits[0].rawTranscript;
        assert(raw);
        const box = field.getByRole('textbox', { name: 'Review transcript', exact: true });
        await expect(box).toHaveValue(raw);
        assert(!raw.includes('S3_TRANSCRIPT'), 'Fixture text cannot be genuine evidence');
        const literalChecks = name === 'clear' ? [/twenty[\s-]*five|25/i, /\bten\b|\b10\b/i, /\bsix\b|\b6\b/i, /\bthree\b|\b3\b/i, /discount/i, /capacity/i, /pool/i, /cap/i] : [/offer/i, /better/i];
        for (const pattern of literalChecks) assert.match(raw, pattern, 'Transcript needs an explicit correction before continuing');
        await capture(page, `${name}-transcript`);
        stage = `${name}-review`;
        // Scripted owner review preserves actual ASR text; it is not model output or human consent.
        await field.getByRole('button', { name: 'Save reviewed transcript', exact: true }).click();
        await expect(field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true })).toBeVisible();
        const reviewed = await state();
        const edit = reviewed.edits[0]; assert(edit);
        assert.equal(edit.phase, 'reviewed'); assert.equal(edit.transcript, raw); assert.equal(edit.revision, 1);
        assert.deepEqual(reviewed.rule, before);
        await writeFile(join(options.directory, `review-${name}.json`), JSON.stringify({ source: 'scripted authenticated UI review; actual transcript retained without correction', ownerId: owner.id, ruleId: before.id, editId: edit.id, revision: edit.revision, audioSha256: edit.audioSha256, text: edit.transcript, reviewedAt: edit.reviewedAt }, null, 2) + '\n');
        stage = `${name}-wonder`;
        await field.getByRole('button', { name: 'Ask Wonder for proposal', exact: true }).click();
        await expect.poll(async () => ['proposed', 'failed'].includes((await state()).edits[0]?.phase ?? ''), { timeout: 40_000 }).toBe(true);
        await expect.poll(async () => (await state()).edits[0]?.proposalAttempts, { timeout: 5000 }).toBe(1);
        const proposed = await state();
        await writeFile(join(options.directory, `${name}-proposed-state.json`), JSON.stringify({ before, ...proposed }, null, 2) + '\n');
        assert.deepEqual(proposed.rule, before);
        assert.equal(proposed.proposals.length, 1, 'Genuine Wonder did not produce a stored proposal; no retry');
        const proposal = proposed.proposals[0]; assert(proposal);
        assert.equal(proposal.model, 'muse-wonder-1.0'); assert.equal(proposal.voiceEditId, edit.id); assert.equal(proposal.transcriptRevision, 1);
        if (name === 'clear') {
          assert.equal(proposed.edits[0]?.phase, 'proposed'); assert.equal(proposal.verdict, 'ok');
          assert.deepEqual([proposal.discountBps, proposal.capacityCovers, proposal.minPoolCovers, proposal.perAgentCapCovers], [2500, 10, 6, 3]);
          assert.equal(proposed.outcomes.length, 0);
          await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toBeVisible();
          await capture(page, 'clear-unapproved');
          stage = 'clear-separate-approval';
          await field.getByRole('button', { name: 'Approve this exact change', exact: true }).click();
          await expect(field.getByText('Applied. Your offer now uses the approved terms.', { exact: true })).toBeVisible();
          const applied = await state(); const r = applied.rule; assert(r);
          assert.deepEqual([r.termsVersion, r.discountBps, r.capacityCovers, r.minPoolCovers, r.perAgentCapCovers], [2, 2500, 10, 6, 3]);
          assert.equal(r.floorPriceCents, before.floorPriceCents); assert.equal(r.weekday, before.weekday); assert.equal(r.startMinute, before.startMinute); assert.equal(r.endMinute, before.endMinute);
          assert.equal(applied.outcomes.length, 1); assert.equal(applied.outcomes[0]?.changeId, proposal.id);
          assert.equal(applied.edits[0]?.approvedVersion, 2);
          await capture(page, 'clear-applied');
          cases.push({ name, ownerId: owner.id, ruleId: before.id, before, transcribed, reviewed, proposed, applied, approvalAssurance: 'separate scripted authenticated browser action; no real-person merchant consent claim' });
        } else {
          assert.equal(proposed.edits[0]?.phase, 'failed'); assert.equal(proposed.edits[0]?.reason, 'clarification'); assert.equal(proposal.verdict, 'not_understood');
          await expect(field.getByRole('button', { name: 'Approve this exact change', exact: true })).toHaveCount(0);
          assert.equal(proposed.edits[0]?.approvedAt, null);
          await capture(page, 'ambiguous-clarification');
          cases.push({ name, ownerId: owner.id, ruleId: before.id, before, transcribed, reviewed, proposed, unchanged: true });
        }
      } catch (error) {
        await capture(page, `${name}-failed`);
        await writeFile(join(options.directory, `${name}-failure-state.json`), JSON.stringify({ stage, ownerId: owner.id, ruleId: before.id, before, final: await state(), assertion: error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.name : 'Error', noRetry: true }, null, 2) + '\n');
        throw error;
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []);
    const calls = await admin.db.select().from(llmCalls);
    assert.equal(calls.length, 2); assert(calls.every(call => call.attempt === 1 && call.ok));
    await writeFile(join(options.directory, 'ui-receipt.json'), JSON.stringify({ result: 'genuine integration verified for prepared synthetic speech and scripted owner actions', cases, llmCalls: calls, browserErrors: errors, provenance: 'actual Voice and Wonder outputs through unchanged UI/actions/service/database; synthetic audio and scripted review/approval explicitly distinguished' }, null, 2) + '\n');
  } finally {
    await writeFile(join(options.directory, 'ui-stage.json'), JSON.stringify({ stage, casesCompleted: cases.length, browserErrors: errors }, null, 2) + '\n');
    await browser.close(); await admin.close();
  }
}
