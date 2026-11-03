import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, type Db } from '@/lib/db/client';
import { mintMerchant } from '@/lib/onboarding/links';
import { listOffers } from '@/lib/commitments/service';
import { approveVoice, discardVoice, getVoice, proposeVoice, reviewTranscript, uploadVoice, type VoiceDeps, type VoiceResult } from '@/lib/owner-voice/service';
import { createTestDatabase, type TestDatabase } from '../support/db';

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const login = `backfill_t_voice_${randomBytes(4).toString('hex')}`;
const receipts: unknown[] = [];
beforeAll(async () => {
  t = await createTestDatabase('proof_s3_voice');
  await t.admin.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url); url.username = login;
  app = connectDb(url.toString(), 6);
});
afterAll(async () => {
  if (process.env.S3_EVIDENCE_DIR) {
    const evidence = resolve(process.env.S3_EVIDENCE_DIR);
    await mkdir(evidence, { recursive: true });
    await writeFile(resolve(evidence, 'service-receipt.json'), JSON.stringify({ assurance: 'Authored Voice/Wonder fixtures, silent synthetic WAV bytes, scripted owner actions; not genuine inference or human consent.', receipts }, null, 2));
  }
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? '', { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${login}`); } finally { await root.end({ timeout: 5 }); }
});
function wav() {
  const b = Buffer.alloc(32044); b.write('RIFF'); b.writeUInt32LE(32036, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(32000, 40); return b;
}
const next = { understood: true, discountBps: 2000, capacityCovers: 10, minPoolCovers: 6, perAgentCapCovers: 4, reply: 'Propose 20% off, capacity 10, minimum pool 6 and per-agent cap 4.' };
function deps(text = 'Set discount to 20%, capacity to 10, minimum pool to 6 and per-agent cap to 4.'): VoiceDeps & { calls: { voice: number; wonder: number } } {
  const calls = { voice: 0, wonder: 0 };
  return { source: 'fixture', voiceModel: 'fixture:voice-s3', wonderModel: 'fixture:wonder-s3', calls,
    transcribe: async () => { calls.voice++; return { text, providerSessionId: null, audioDurationMs: null, costNanoUsd: null }; },
    propose: async () => { calls.wonder++; return { ...next }; },
  };
}
async function owner() {
  const m = await mintMerchant(t.db, `Synthetic Voice Cafe ${randomBytes(3).toString('hex')}`);
  const [r] = await t.admin`insert into rules ${t.admin({ merchant_id: m.id, list_price_cents: 680, capacity_covers: 8, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 1500, min_pool_covers: 8, per_agent_cap_covers: 2, floor_price_cents: 503 })} returning id`;
  return { id: m.id, ruleId: String(r?.id) };
}
const terms = async (o: { ruleId: string }) => (await t.admin`select terms_version, discount_bps, capacity_covers, min_pool_covers, per_agent_cap_covers from rules where id=${o.ruleId}`)[0];
async function uploaded(o: { id: string; ruleId: string }, d = deps()) {
  const input = { id: randomUUID(), ruleId: o.ruleId, termsVersion: 1, bytes: wav() };
  const out = await uploadVoice(app.db, o.id, input, d);
  expect(out.status).toBe('transcribed');
  return { out, input, d };
}
function editOf(out: VoiceResult) { if (!out.edit) throw new Error(`No edit: ${out.status}`); return out.edit; }
async function proposed(o: { id: string; ruleId: string }, d = deps()) {
  const u = await uploaded(o, d); const e = editOf(u.out);
  const review = await reviewTranscript(app.db, o.id, { id: e.id, revision: e.revision, text: e.transcript ?? '' });
  const r = editOf(review);
  const proposal = await proposeVoice(app.db, o.id, { id: r.id, revision: r.revision }, d);
  return { ...u, proposal, e: editOf(proposal) };
}
function approval(e: ReturnType<typeof editOf>) { if (!e.proposalId) throw new Error('No proposal'); return { id: e.id, revision: e.revision, proposalId: e.proposalId }; }

describe('S3 owner voice against real runtime/database paths', () => {
  it('keeps exact four-term proposal unchanged until explicit approval and deduplicates every stage', async () => {
    const o = await owner(); const before = await terms(o); const u = await proposed(o); const e = u.e;
    expect(u.proposal.status).toBe('proposed');
    expect(e.before).toEqual({ discountBps: 1500, capacityCovers: 8, minPoolCovers: 8, perAgentCapCovers: 2 });
    expect(e.proposal).toEqual(next); expect(e.source).toBe('fixture'); expect(e.approval).toBeNull();
    expect(await terms(o)).toEqual(before);
    await uploadVoice(app.db, o.id, u.input, u.d);
    await proposeVoice(app.db, o.id, { id: e.id, revision: e.revision }, u.d);
    expect(u.d.calls).toEqual({ voice: 1, wonder: 1 });
    const results = await Promise.all([approveVoice(app.db, o.id, approval(e)), approveVoice(app.db, o.id, approval(e))]);
    expect(results.map(r => r.status).sort()).toEqual(['already_applied', 'applied']);
    const after = await terms(o);
    expect(after).toEqual({ terms_version: 2, discount_bps: 2000, capacity_covers: 10, min_pool_covers: 6, per_agent_cap_covers: 4 });
    expect(await t.admin`select count(*)::int as count from owner_change_outcomes where change_id=${e.proposalId}`).toEqual([{ count: 1 }]);
    const saved = editOf(await getVoice(app.db, o.id, e.id)); expect(saved.approval?.version).toBe(2);
    const publicPayload = JSON.stringify(await listOffers(app.db));
    for (const privateValue of [e.transcript, e.audio.sha256, 'floorPriceCents', 'proposalOutput', 'rawTranscript']) if (privateValue) expect(publicPayload).not.toContain(privateValue);
    receipts.push({ case: 'separate-exact-approval-and-idempotence', ownerId: o.id, ruleId: o.ruleId, edit: saved, before, after, outcomes: results.map(r => r.status), calls: u.d.calls });
  });

  it('rejects cross-owner access at every service boundary and proposal identity tampering', async () => {
    const o = await owner(); const stranger = await owner(); const u = await proposed(o); const before = await terms(o);
    expect((await getVoice(app.db, stranger.id, u.e.id)).status).toBe('not_found');
    expect((await reviewTranscript(app.db, stranger.id, { id: u.e.id, revision: u.e.revision, text: '20% off' })).status).toBe('not_found');
    expect((await proposeVoice(app.db, stranger.id, { id: u.e.id, revision: u.e.revision }, deps())).status).toBe('not_found');
    expect((await approveVoice(app.db, stranger.id, approval(u.e))).status).toBe('not_found');
    expect((await discardVoice(app.db, stranger.id, { id: u.e.id })).status).toBe('not_found');
    expect((await uploadVoice(app.db, stranger.id, { ...u.input, id: randomUUID() }, deps())).status).toBe('not_found');
    await expect(t.admin`update owner_voice_edits set merchant_id=${stranger.id} where id=${u.e.id}`).rejects.toMatchObject({ constraint_name: 'owner_voice_identity' });
    await expect(t.admin`select apply_owner_change(${stranger.id}::uuid,${u.e.proposalId}::uuid)`).rejects.toMatchObject({ constraint_name: 'apply_owner_change_voice' });
    expect(await terms(o)).toEqual(before);
    receipts.push({ case: 'cross-owner', ownerId: o.id, strangerId: stranger.id, editId: u.e.id, unchanged: await terms(o) });
  });

  it('invalidates previous proposal on transcript correction and never interprets yes/okay as approval', async () => {
    const o = await owner(); const u = await proposed(o); const before = await terms(o);
    const corrected = editOf(await reviewTranscript(app.db, o.id, { id: u.e.id, revision: u.e.revision, text: 'yes' }));
    expect(corrected.proposalId).toBeNull(); expect(corrected.proposal).toBeNull();
    expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('revision_changed');
    await expect(t.admin`select apply_owner_change(${o.id}::uuid,${u.e.proposalId}::uuid)`).rejects.toMatchObject({ constraint_name: 'apply_owner_change_voice' });
    expect((await proposeVoice(app.db, o.id, { id: corrected.id, revision: corrected.revision }, u.d)).status).toBe('clarification');
    expect(u.d.calls.wonder).toBe(1); expect(await terms(o)).toEqual(before);
    for (const word of ['okay', 'confirm', 'yes!']) {
      const newer = await uploaded(o, deps(word)); const e = editOf(newer.out);
      const reviewed = editOf(await reviewTranscript(app.db, o.id, { id: e.id, revision: e.revision, text: word }));
      expect((await proposeVoice(app.db, o.id, { id: e.id, revision: reviewed.revision }, newer.d)).status).toBe('clarification');
      expect(newer.d.calls.wonder).toBe(0);
    }
    receipts.push({ case: 'corrected-transcript-invalidates-old-proposal', editId: u.e.id, oldProposalId: u.e.proposalId, revision: corrected.revision, unchanged: await terms(o) });
  });

  it('refuses mixed window/private-floor requests without partially applying supported terms', async () => {
    const o = await owner(); const before = await terms(o);
    for (const text of ['Set capacity to 10 and move the window to 3pm.', 'Make it 20% off and lower my private floor to $4.', 'Change the deadline and minimum pool to 6.']) {
      const u = await uploaded(o, deps(text)); const e = editOf(u.out);
      const reviewed = editOf(await reviewTranscript(app.db, o.id, { id: e.id, revision: 0, text }));
      expect((await proposeVoice(app.db, o.id, { id: e.id, revision: reviewed.revision }, u.d)).status).toBe('manual_route');
      expect(u.d.calls.wonder).toBe(0); expect(await terms(o)).toEqual(before);
    }
    receipts.push({ case: 'mixed-unsupported', ownerId: o.id, unchanged: await terms(o) });
  });

  it('requires clarification for ambiguous model output and refuses invalid/below-floor/failing output', async () => {
    const o = await owner(); const before = await terms(o);
    const scripts = [
      { expected: 'clarification', propose: async () => ({ ...next, understood: false, reply: 'Which discount would you like?' }) },
      { expected: 'invalid_output', propose: async () => JSON.parse('{"understood":true,"reply":"wrong shape"}') },
      { expected: 'invalid_output', propose: async () => ({ ...next, capacityCovers: 2_147_483_648 }) },
      { expected: 'invalid_output', propose: async () => ({ ...next, reply: 'bad\u0000reply' }) },
      { expected: 'invalid_output', propose: async () => ({ ...next, reply: 'bad\ud800reply' }) },
      { expected: 'below_floor', propose: async () => ({ ...next, discountBps: 9000 }) },
      { expected: 'no_proposal', propose: async () => { throw new Error('provider failed'); } },
    ];
    for (const script of scripts) {
      const d = { ...deps('Make it a better deal.'), propose: script.propose };
      const u = await proposed(o, d);
      expect(u.proposal.status).toBe(script.expected); expect(u.e.phase).toBe('failed');
      if (u.e.proposalId) expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('not_proposed');
      expect(await terms(o)).toEqual(before);
    }
    receipts.push({ case: 'ambiguity-invalid-provider-floor', ownerId: o.id, unchanged: await terms(o) });
  });

  it('keeps terms unchanged for failed transcription, malformed audio, cancellation and upload collision', async () => {
    const o = await owner(); const before = await terms(o); const d = deps();
    expect((await uploadVoice(app.db, o.id, { id: randomUUID(), ruleId: o.ruleId, termsVersion: 1, bytes: Buffer.from('not WAV') }, d)).status).toBe('invalid_wav');
    expect(d.calls.voice).toBe(0);
    const input = { id: randomUUID(), ruleId: o.ruleId, termsVersion: 1, bytes: wav() };
    expect((await uploadVoice(app.db, o.id, input, { ...d, transcribe: async () => null })).status).toBe('failed');
    const u = await proposed(o); const cancelled = await discardVoice(app.db, o.id, { id: u.e.id }); expect(cancelled.status).toBe('cancelled');
    expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('cancelled');
    const otherBytes = wav(); otherBytes[100] = 1;
    expect((await uploadVoice(app.db, o.id, { ...u.input, bytes: otherBytes }, u.d)).status).toBe('conflict');
    expect(await terms(o)).toEqual(before);
    receipts.push({ case: 'audio-failure-cancel-collision', ownerId: o.id, unchanged: await terms(o) });
  });

  it('refuses stale/superseded proposals including capacity-only drift with no terms-version bump', async () => {
    const o = await owner(); const u = await proposed(o);
    await t.admin`update rules set capacity_covers=12 where id=${o.ruleId}`;
    expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('stale');
    expect((await terms(o))?.capacity_covers).toBe(12);
    const p = await owner(); const old = await proposed(p); await uploaded(p);
    expect((await approveVoice(app.db, p.id, approval(old.e))).status).toBe('superseded');
    const q = await owner(); const stale = await proposed(q); await t.admin`update rules set discount_bps=1600 where id=${q.ruleId}`;
    expect((await approveVoice(app.db, q.id, approval(stale.e))).status).toBe('stale');
    receipts.push({ case: 'stale-and-superseded', capacityOnly: await terms(o), versionChanged: await terms(q), superseded: await terms(p) });
  });

  it('does not revive a cancelled transcription or corrected in-flight proposal', async () => {
    const o = await owner(); const before = await terms(o); const input = { id: randomUUID(), ruleId: o.ruleId, termsVersion: 1, bytes: wav() };
    let release: (() => void) | undefined; let entered: (() => void) | undefined;
    const gate = new Promise<void>(r => { release = r; }); const started = new Promise<void>(r => { entered = r; });
    const upload = uploadVoice(app.db, o.id, input, { ...deps(), transcribe: async () => { entered?.(); await gate; return { text: 'Set discount to 20%', providerSessionId: null, audioDurationMs: null, costNanoUsd: null }; } });
    await started; expect((await discardVoice(app.db, o.id, { id: input.id })).status).toBe('cancelled'); release?.(); expect((await upload).status).toBe('cancelled');
    const u = await uploaded(o); const e = editOf(u.out); const reviewed = editOf(await reviewTranscript(app.db, o.id, { id: e.id, revision: 0, text: e.transcript ?? '' }));
    let releaseProposal: (() => void) | undefined; let enteredProposal: (() => void) | undefined;
    const wait = new Promise<void>(r => { releaseProposal = r; }); const active = new Promise<void>(r => { enteredProposal = r; });
    const pending = proposeVoice(app.db, o.id, { id: e.id, revision: reviewed.revision }, { ...u.d, propose: async () => { enteredProposal?.(); await wait; return next; } });
    await active; const corrected = await reviewTranscript(app.db, o.id, { id: e.id, revision: reviewed.revision, text: 'Set discount to 18%' }); releaseProposal?.();
    expect((await pending).status).toBe('interrupted'); expect(editOf(corrected).proposalId).toBeNull(); expect(await terms(o)).toEqual(before);
    receipts.push({ case: 'interrupted-requests', cancelledAudioId: input.id, correctedEditId: e.id, unchanged: await terms(o) });
  });

  it('blocks pending buyer commitments and applies only after cancellation', async () => {
    const o = await owner(); const u = await proposed(o); const before = await terms(o);
    const [agent] = await t.admin`insert into agents ${t.admin({ id: `voice-${randomBytes(4).toString('hex')}`, label: 'synthetic party', token_sha256: randomBytes(32).toString('hex') })} returning id`;
    const [pending] = await t.admin`insert into commitments ${t.admin({ rule_id: o.ruleId, agent_id: agent?.id, idempotency_key: 'voice-pending', terms_version: 1, covers: 2, max_price_per_cover_cents: 680, visit_at: new Date('2026-11-24T14:00:00+08:00'), committed_at: new Date('2026-11-24T09:00:00+08:00') })} returning id`;
    expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('pending'); expect(await terms(o)).toEqual(before);
    await t.admin`update commitments set cancelled_at=now() where id=${pending?.id}`;
    expect((await approveVoice(app.db, o.id, approval(u.e))).status).toBe('applied');
    receipts.push({ case: 'pending-commitment', ownerId: o.id, ruleId: o.ruleId, commitmentId: pending?.id, before, after: await terms(o) });
  });

  it('rejects expired edits and forged provenance or cross-rule proposal bindings in SQL', async () => {
    const o = await owner(); const u = await uploaded(o); const e = editOf(u.out); const before = await terms(o);
    // Authored historical receipt, not a runtime rewrite of an existing edit's expiry.
    const expiredId = randomUUID();
    await t.admin`insert into owner_voice_edits (id,merchant_id,rule_id,terms_version,phase,audio_sha256,audio_duration_ms,sample_rate,source,voice_model,wonder_model,raw_transcript,transcript,before,created_at,expires_at)
      select ${expiredId}::uuid,merchant_id,rule_id,terms_version,'transcribed',audio_sha256,audio_duration_ms,sample_rate,source,voice_model,wonder_model,raw_transcript,transcript,before,now()-interval '30 minutes',now()-interval '15 minutes' from owner_voice_edits where id=${e.id}`;
    expect((await getVoice(app.db, o.id, expiredId)).status).toBe('expired');
    expect((await reviewTranscript(app.db, o.id, { id: expiredId, revision: 0, text: 'Set discount to 20%' })).status).toBe('expired');
    const reviewed = editOf(await reviewTranscript(app.db, o.id, { id: e.id, revision: 0, text: e.transcript ?? '' }));
    const another = await owner();
    await expect(t.admin`insert into owner_changes (merchant_id,rule_id,terms_version,voice_edit_id,transcript_revision,message_text,model,verdict,expires_at)
      values (${o.id},${another.ruleId},1,${e.id},${reviewed.revision},${e.transcript},'fixture:wonder-s3','no_proposal',${new Date(e.expiresAt)})`).rejects.toMatchObject({ constraint_name: 'owner_voice_proposal_binding' });
    await expect(t.admin`update owner_voice_edits set raw_transcript='forged transcript' where id=${e.id}`).rejects.toMatchObject({ constraint_name: 'owner_voice_identity' });
    await expect(t.admin`insert into owner_voice_edits (id,merchant_id,rule_id,terms_version,phase,audio_sha256,audio_duration_ms,sample_rate,source,voice_model,wonder_model,before,expires_at)
      values (${randomUUID()},${o.id},${o.ruleId},1,'transcribing',${e.audio.sha256},1000,16000,'fixture','fixture:voice-s3','fixture:wonder-s3','{}'::jsonb,now()+interval '15 minutes')`).rejects.toMatchObject({ constraint_name: 'owner_voice_identity' });
    expect(await terms(o)).toEqual(before);
    receipts.push({ case: 'expired-and-forged-binding', expiredId, editId: e.id, unchanged: await terms(o) });
  });

  it('bounds review and model reservations, counting failed/unfinished requests', async () => {
    const o = await owner(); const u = await uploaded(o); let e = editOf(u.out);
    for (let n = 0; n < 10; n++) e = editOf(await reviewTranscript(app.db, o.id, { id: e.id, revision: e.revision, text: 'Set discount to 20%' }));
    expect((await reviewTranscript(app.db, o.id, { id: e.id, revision: e.revision, text: 'Set discount to 19%' })).status).toBe('review_limit');
    await t.admin`update owner_voice_edits set proposal_attempts=30 where id=${e.id}`;
    expect((await proposeVoice(app.db, o.id, { id: e.id, revision: e.revision }, u.d)).status).toBe('daily_cap'); expect(u.d.calls.wonder).toBe(0);
    // Thirty historical failed upload reservations count against today's audio cap.
    await t.admin`insert into owner_voice_edits (id,merchant_id,rule_id,terms_version,phase,audio_sha256,audio_duration_ms,sample_rate,source,voice_model,wonder_model,before,expires_at)
      select gen_random_uuid(),merchant_id,rule_id,terms_version,'failed',audio_sha256,audio_duration_ms,sample_rate,source,voice_model,wonder_model,before,now()+interval '15 minutes' from owner_voice_edits cross join generate_series(1,29) where id=${e.id}`;
    expect((await uploadVoice(app.db, o.id, { ...u.input, id: randomUUID() }, u.d)).status).toBe('daily_cap'); expect(u.d.calls.voice).toBe(1);
    expect((await terms(o))?.terms_version).toBe(1);
    receipts.push({ case: 'rate-bounds', ownerId: o.id, editId: e.id, revision: e.revision, calls: u.d.calls, unchanged: await terms(o) });
  });
});
