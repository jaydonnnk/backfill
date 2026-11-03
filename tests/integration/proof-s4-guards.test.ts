import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/db';
import { connectDb, type Db } from '@/lib/db/client';
import { mintAgent } from '@/lib/agents/tokens';
import { mintMerchant } from '@/lib/onboarding/links';
import { publishDraft, readMenu } from '@/lib/onboarding/service';
import { buyerAction } from '@/lib/buyer/service';
import { buyerHandler } from '@/lib/buyer/http';
import { buyerFixtures, INTENT } from '../support/proof-s4';
import type { Models } from '@/lib/buyer/models';
import { BEFORE, MENU, PHOTO, SETTINGS } from '../support/proof-s1';
let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
let ruleId: string;
const role = `backfill_t_s4_guard_${randomBytes(4).toString('hex')}`;
beforeAll(async () => {
  t = await createTestDatabase('proof_s4_guards');
  const owner = await mintMerchant(t.db, 'Guard cafe');
  const d = await readMenu(t.db, owner.id, PHOTO, async () => MENU, 'fixture:s4-menu', () => BEFORE);
  if (!('draftId' in d)) throw Error('draft');
  const p = await publishDraft(t.db, owner.id, d.draftId, SETTINGS);
  if (p.status !== 'published') throw Error('publication');
  ruleId = p.ruleId;
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url); url.username = role;
  app = connectDb(url.toString(), 5);
});
afterAll(async () => {
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${role}`); } finally { await root.end(); }
});
async function setup(models: Models = buyerFixtures()) {
  const party = await mintAgent(t.db, randomUUID(), 'Synthetic guard party');
  const id = randomUUID();
  const act = (input: Record<string, unknown>, clock = () => BEFORE) => buyerAction(app.db, party.id, { id, ...input }, models, clock, 'scripted_local_demo');
  await act({ action: 'start', request: 'Two for kopi, 2026-11-03 14:00 to 17:00 SGD6 each' });
  return { party, id, act };
}
async function ready(models?: Models) {
  const x = await setup(models);
  await x.act({ action: 'parse', revision: 0 });
  await x.act({ action: 'review', revision: 0, constraints: INTENT });
  const r = await x.act({ action: 'decide', revision: 1, ruleId });
  expect(r.session?.phase).toBe('decided');
  return { ...x, session: r.session! };
}
const noCommitments = async (party: string) => expect(await t.admin`select * from commitments where agent_id=${party}`).toHaveLength(0);
it('authenticates before access; another party cannot read, edit, decide, approve or submit', async () => {
  const x = await ready();
  const other = await mintAgent(t.db, randomUUID(), 'Other party');
  const handler = buyerHandler(() => app.db, buyerFixtures, () => BEFORE);
  const request = (token: string, body: unknown) => handler(new Request('http://127.0.0.1/api/buyer', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  expect((await request('bad', { id: x.id, action: 'get' })).status).toBe(401);
  for (const action of ['get', 'edit', 'review', 'decide', 'approve', 'submit', 'discard']) {
    const input = { id: x.id, action, ...(action === 'get' ? {} : { revision: 1 }), ...(action === 'edit' ? { request: 'changed' } : {}), ...(action === 'review' ? { constraints: INTENT } : {}), ...(action === 'decide' ? { ruleId } : {}), ...(action === 'approve' ? { terms: x.session.terms } : {}) };
    const result = await (await request(other.token, input)).json();
    expect(result.session).toBeNull();
  }
  await noCommitments(x.party.id);
  expect(JSON.stringify(await (await request(other.token, { id: x.id, action: 'get' })).json())).not.toContain(x.party.id);
});
it('request and constraint corrections clear decisions and exact approvals', async () => {
  for (const action of ['edit', 'review']) {
    const x = await ready();
    await x.act({ action: 'approve', revision: 1, terms: x.session.terms });
    const r = await x.act({ action, revision: 1, ...(action === 'edit' ? { request: 'New text' } : { constraints: { ...INTENT, partySize: 1 } }) });
    expect(r.session).toMatchObject({ revision: 2, decision: null, approval: null, terms: null });
    expect((await x.act({ action: 'submit', revision: 1 })).status).toBe('revision_changed');
    expect((await x.act({ action: 'submit', revision: 2 })).status).toBe('no_decision');
    await noCommitments(x.party.id);
  }
});
it('exact approval rejects every changed dimension and missing evidence', async () => {
  const x = await ready();
  const terms = x.session.terms!;
  for (const patch of [{ partyId: 'wrong' }, { ruleId: randomUUID() }, { runId: randomUUID() }, { termsVersion: 2 }, { visitDate: '2026-11-10' }, { covers: 1, totalCents: 544 }, { pricePerCoverCents: 545, totalCents: 1090 }]) {
    expect((await x.act({ action: 'approve', revision: 1, terms: { ...terms, ...patch } })).status).toBe('approval_mismatch');
  }
  expect((await x.act({ action: 'submit', revision: 1 })).status).toBe('approval_required');
  await noCommitments(x.party.id);
});
it('terms change after approval blocks submission and preserves old approved terms', async () => {
  const x = await ready();
  await x.act({ action: 'approve', revision: 1, terms: x.session.terms });
  await t.admin`update rules set discount_bps=1500 where id=${ruleId}`;
  expect((await x.act({ action: 'submit', revision: 1 })).status).toBe('stale_terms');
  await noCommitments(x.party.id);
  await t.admin`update rules set discount_bps=2000 where id=${ruleId}`;
});
it('duplicate parse and decision dispatch reserve once even concurrently', async () => {
  let parses = 0, decisions = 0;
  const fixtures = buyerFixtures();
  const x = await setup({ parse: async (...args) => { parses++; return fixtures.parse(...args); }, decide: async (...args) => { decisions++; return fixtures.decide(...args); } });
  await Promise.all([x.act({ action: 'parse', revision: 0 }), x.act({ action: 'parse', revision: 0 })]);
  expect(parses).toBe(1);
  await x.act({ action: 'review', revision: 0, constraints: INTENT });
  await Promise.all([x.act({ action: 'decide', revision: 1, ruleId }), x.act({ action: 'decide', revision: 1, ruleId })]);
  expect(decisions).toBe(1);
});
it('in-flight parse and decision cannot restore discarded or corrected state', async () => {
  for (const stage of ['parse', 'decide']) {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const f = buyerFixtures();
    const models: Models = stage === 'parse' ? { ...f, parse: async (...args) => { entered(); await blocked; return f.parse(...args); } } : { ...f, decide: async (...args) => { entered(); await blocked; return f.decide(...args); } };
    const x = await setup(models);
    if (stage === 'decide') await x.act({ action: 'review', revision: 0, constraints: INTENT });
    const revision = stage === 'parse' ? 0 : 1;
    const pending = x.act({ action: stage, revision, ...(stage === 'decide' ? { ruleId } : {}) });
    await started;
    const edited = await x.act({ action: 'edit', revision, request: 'Corrected request' });
    expect(edited.session?.decision).toBeNull(); release();
    expect((await pending).status).toBe('revision_changed');
    const state = (await x.act({ action: 'get' })).session;
    expect(state).toMatchObject({ request: 'Corrected request', phase: 'draft', decision: null, proposal: null, approval: null });
    await noCommitments(x.party.id);
  }
});
it('invalid model output, timeout and provider failure submit nothing and cannot auto-retry', async () => {
  const f = buyerFixtures();
  for (const reason of ['timeout', 'provider_error', 'invalid_covers']) {
    const models: Models = { ...f, decide: async (...args) => { if (reason !== 'invalid_covers') throw Error(reason); const r = await f.decide(...args); return { ...r, value: { covers: 3, reason: 'Invalid party' } }; } };
    const x = await setup(models);
    await x.act({ action: 'review', revision: 0, constraints: INTENT });
    expect((await x.act({ action: 'decide', revision: 1, ruleId })).status).toBe('model_failed');
    expect((await x.act({ action: 'decide', revision: 1, ruleId })).status).toBe('review_required');
    expect((await x.act({ action: 'submit', revision: 1 })).status).toBe('no_decision');
    await noCommitments(x.party.id);
  }
});
it('clarifies missing fields and refuses incomplete review, expired requests and session caps', async () => {
  const x = await setup();
  const r = await x.act({ action: 'review', revision: 0, constraints: { ...INTENT, currency: null } });
  expect(r.session?.phase).toBe('clarification');
  expect((await x.act({ action: 'decide', revision: 1, ruleId })).status).toBe('review_required');
  expect((await x.act({ action: 'parse', revision: 1 }, () => new Date(BEFORE.getTime() + 21 * 60_000))).status).toBe('expired');
  for (let i = 1; i < 10; i++) expect((await buyerAction(app.db, x.party.id, { action: 'start', id: randomUUID(), request: 'Synthetic request' }, buyerFixtures(), () => BEFORE)).status).toBe('ok');
  expect((await buyerAction(app.db, x.party.id, { action: 'start', id: randomUUID(), request: 'Synthetic request' }, buyerFixtures(), () => BEFORE)).status).toBe('daily_cap');
  await noCommitments(x.party.id);
});
it('the runtime role cannot write approval labels into the public S2 trail', async () => {
  const x = await setup();
  await expect(app.db.execute('insert into demo_trails default values')).rejects.toThrow();
  await noCommitments(x.party.id);
});
it('approves and submits through MCP with a one-connection pool without starving its own transaction', async () => {
  const x = await ready();
  const url = new URL(t.url); url.username = role;
  const single = connectDb(url.toString(), 1);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const approved = await buyerAction(single.db, x.party.id, { id: x.id, action: 'approve', revision: 1, terms: x.session.terms }, buyerFixtures(), () => BEFORE);
      expect(approved.status).toBe('ok');
      const submitted = await buyerAction(single.db, x.party.id, { id: x.id, action: 'submit', revision: 1 }, buyerFixtures(), () => BEFORE);
      expect(submitted.session?.result).toMatchObject({ ok: true });
    })();
    await Promise.race([work, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(Error('Connection pool starved by nested MCP dispatch')), 1000); })]);
  } finally { clearTimeout(timeout); await single.close(); }
});
it('six reservations cap repeated explicit revisions; request collisions and concurrent submissions stay idempotent', async () => {
  const x = await setup();
  expect((await x.act({ action: 'start', request: 'Different request with reused id' })).status).toBe('request_collision');
  let revision = 0;
  for (let i = 0; i < 6; i++) {
    expect((await x.act({ action: 'parse', revision })).status).toBe('ok');
    expect((await x.act({ action: 'edit', revision, request: `New explicit revision ${i}` })).status).toBe('ok');
    revision++;
  }
  expect((await x.act({ action: 'parse', revision })).status).toBe('attempt_cap');
  await noCommitments(x.party.id);
  const y = await ready();
  await y.act({ action: 'approve', revision: 1, terms: y.session.terms });
  const replies = await Promise.all(Array.from({ length: 6 }, () => y.act({ action: 'submit', revision: 1 })));
  expect(replies.every(r => r.session?.result?.ok)).toBe(true);
  expect(new Set(replies.map(r => r.session?.result?.ok ? r.session.result.commitment.commitmentId : null)).size).toBe(1);
  expect(await t.admin`select * from commitments where agent_id=${y.party.id}`).toHaveLength(1);
});
it('retains returned usage for rejected final output without retaining invalid text or approval', async () => {
  const { ModelOutputError } = await import('@/lib/buyer/models');
  const f = buyerFixtures();
  const x = await setup({ ...f, decide: async () => { throw new ModelOutputError({ source: 'provider', route: 'vercel_gateway', model: 'meta/muse-spark-open', servedModel: 'synthetic-served-id', upstream: 'baseten', inputTokens: 100, outputTokens: 40, costUsd: null }); } });
  await x.act({ action: 'review', revision: 0, constraints: INTENT });
  const r = await x.act({ action: 'decide', revision: 1, ruleId });
  expect(r.session).toMatchObject({ phase: 'failed', decision: null, approval: null, decisionReceipt: { inputTokens: 100, outputTokens: 40, costUsd: null } });
  await noCommitments(x.party.id);
});
it('records and replays an independently reviewed Gateway decision while parser evidence stays explicitly missing', async () => {
  const { buyerRecording, replayBuyer } = await import('@/lib/buyer/recording');
  const x = await setup();
  await x.act({ action: 'review', revision: 0, constraints: INTENT });
  const r = await x.act({ action: 'decide', revision: 1, ruleId });
  const recording = buyerRecording(r.session!); const replay = replayBuyer(recording);
  expect(recording.parsed).toBeNull(); expect(recording.parseReceipt).toBeNull();
  await expect(replay.parse(recording.request, recording.referenceClock)).rejects.toThrow('missing_parser_recording');
  expect((await replay.decide(x.party.id, recording.request, recording.constraints, recording.offer)).value).toEqual({ covers: 2, reason: 'Authored fixture selects two covers within reviewed constraints.' });
  expect(recording).not.toHaveProperty('approval');
});
it('keeps rejected hosted parser usage in parser evidence and cannot submit or retry it', async () => {
  const { ModelOutputError } = await import('@/lib/buyer/models');
  const f = buyerFixtures();
  let calls = 0;
  const x = await setup({ ...f, parse: async () => { calls++; throw new ModelOutputError({ source: 'provider', route: 'vercel_gateway', model: 'meta/muse-glimmer-30b', servedModel: null, upstream: 'togetherai', inputTokens: 100, outputTokens: 40, costUsd: null }); } });
  const r = await x.act({ action: 'parse', revision: 0 });
  expect(r.status).toBe('model_failed');
  expect(r.session).toMatchObject({ phase: 'failed', proposal: null, decisionReceipt: null, approval: null, parseReceipt: { model: 'meta/muse-glimmer-30b', inputTokens: 100, outputTokens: 40, costUsd: null } });
  expect((await x.act({ action: 'parse', revision: 0 })).status).toBe('already_attempted');
  expect((await x.act({ action: 'submit', revision: 0 })).status).toBe('no_decision');
  expect(calls).toBe(1);
  await noCommitments(x.party.id);
});
it('records NVIDIA parser output with exact-input replay and preserves fixture provenance even with a real model name', async () => {
  const { glimmerParser } = await import('@/lib/buyer/models');
  const { buyerRecording, replayBuyer } = await import('@/lib/buyer/recording');
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  try {
    const f = buyerFixtures();
    const x = await ready({ ...f, parse: glimmerParser(async () => Response.json({ choices: [{ message: { content: JSON.stringify(INTENT) }, finish_reason: 'stop' }] })) });
    const recording = buyerRecording(x.session);
    expect(recording.parseReceipt).toMatchObject({ route: 'nvidia_nim', model: 'meta/muse-glimmer-30b', servedModel: null, upstream: null, inputTokens: null, outputTokens: null, costUsd: null });
    const replay = replayBuyer(recording);
    expect((await replay.parse(recording.request, recording.referenceClock)).value).toEqual(INTENT);
    expect((await replay.parse(recording.request, recording.referenceClock)).receipt.source).toBe('recorded_replay');
    await expect(replay.parse('Changed request', recording.referenceClock)).rejects.toThrow('replay_input_mismatch');
    await expect(replay.parse(recording.request, '2026-11-04T01:00:00.000Z')).rejects.toThrow('replay_input_mismatch');
    const authored = { ...recording, parseReceipt: { ...recording.parseReceipt!, source: 'fixture', model: 'meta/muse-glimmer-30b' } };
    expect((await import('@/lib/buyer/recording')).BuyerRecording.parse(authored).parseReceipt?.source).toBe('fixture');
    expect((await replayBuyer(authored).parse(recording.request, recording.referenceClock)).receipt.source).toBe('recorded_replay');
    await noCommitments(x.party.id);
  } finally { delete process.env.NVIDIA_API_KEY; }
});
