import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { mintAgent, authenticateAgent } from '@/lib/agents/tokens';
import { settleDue } from '@/lib/commitments/service';
import { connectDb } from '@/lib/db/client';
import { clearingFills, clearings, commitments, ledger, llmCalls, planApplications, rules } from '@/lib/db/schema';
import { publicDemoLedger } from '@/lib/demo/ledger';
import { merchantLedger } from '@/lib/ledger/service';
import { mcpPostHandler } from '@/lib/mcp/http';
import { authenticateMerchant, mintMerchant } from '@/lib/onboarding/links';
import { applyPlan, dashboard, getDraft, publishDraft, readMenu, replanSoldOut } from '@/lib/onboarding/service';
import { createTestDatabase } from '../support/db';
import { AFTER, BEFORE, call, connectBuyer, MENU, PHOTO, PLAN, SETTINGS, submission, VISIT } from '../support/proof-s1';

for (const repetition of [1, 2]) it(`complete revised S1 journey from disposable state, repetition ${repetition}`, async () => {
  // Fail before the shared helper can fall back to a developer's .env.local.
  const local = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
  expect(local.protocol).toMatch(/^postgres(ql)?:$/);
  expect(local.hostname).toBe('127.0.0.1');
  expect(local.port).toBe('5432');
  expect(local.pathname).toBe('/postgres');
  const t = await createTestDatabase('proof_s1');
  const role = `backfill_t_proof_s1_${randomBytes(4).toString('hex')}`;
  let runtime: ReturnType<typeof connectDb> | undefined;
  const clients: Awaited<ReturnType<typeof connectBuyer>>[] = [];
  const receipts: unknown[] = [];
  try {
    await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
    const url = new URL(t.url);
    url.username = role;
    runtime = connectDb(url.toString(), 6);
    const db = runtime.db;
    let now = BEFORE;
    const handler = mcpPostHandler(() => db, () => now);
    const route: typeof fetch = async (url, init) => handler(new Request(url, init));
    for (const [scenario, partyCount] of [['success', 4], ['insufficient', 3]] as const) {
      now = BEFORE;
      const name = `SCRIPTED S1 ${scenario} ${repetition}`;
      const owner = await mintMerchant(t.db, name);
      expect(await authenticateMerchant(db, owner.token)).toEqual({ id: owner.id, name });
      const draft = await readMenu(db, owner.id, PHOTO, async () => MENU, 'fixture:s1-menu', () => now);
      expect(draft.status).toBe('ok');
      if (!('draftId' in draft)) throw new Error('Menu fixture failed');
      const reviewed = await getDraft(db, owner.id, draft.draftId);
      expect(reviewed).toMatchObject({ listPriceCents: 680, ruleId: null, draft: MENU });
      expect(await db.select().from(rules).where(eq(rules.merchantId, owner.id))).toEqual([]);
      const publication = await publishDraft(db, owner.id, draft.draftId, SETTINGS);
      if (publication.status !== 'published') throw new Error(`Publication: ${publication.status}`);
      const ruleId = publication.ruleId;
      const readRule = async () => (await db.select().from(rules).where(eq(rules.id, ruleId)))[0];
      const original = await readRule();
      expect(original).toMatchObject({ capacityCovers: 8, termsVersion: 1, discountBps: 2000, minPoolCovers: 8, floorPriceCents: 503 });
      const parties = [];
      const publicReplies: unknown[] = [];
      for (let n = 1; n <= partyCount; n++) {
        const agent = await mintAgent(t.db, `s1-${repetition}-${scenario}-${n}`, `SCRIPTED party ${n}, two people`);
        expect(await authenticateAgent(db, `Bearer ${agent.token}`)).toBe(agent.id);
        const client = await connectBuyer(agent.token, 'http://backfill.test/mcp', route);
        clients.push(client);
        const terms = await call(client, 'get_agent_terms', { ruleId });
        expect(terms).toMatchObject({ ok: true, terms: { offer: { offerPriceCents: 544, minPoolCovers: 8, perAgentCapCovers: 2, termsVersion: 1 } } });
        publicReplies.push(terms, await call(client, 'list_offers'));
        const input = submission(ruleId, VISIT, agent.id);
        const result = await call(client, 'submit_commitment', input);
        expect(result).toMatchObject({ ok: true, replayed: false, commitment: { status: 'pending', covers: 2 } });
        if (!result.ok || !('commitment' in result)) throw new Error('Submission refused');
        const id = result.commitment.commitmentId;
        const retry = await call(client, 'submit_commitment', input);
        expect(retry).toMatchObject({ ok: true, replayed: true, commitment: { commitmentId: id, status: 'pending' } });
        publicReplies.push(result, retry);
        parties.push({ agent, client, id, approval: { provenance: 'scripted', ...input } });
      }
      expect(new Set(parties.map(p => p.agent.token)).size).toBe(partyCount);
      expect(new Set(parties.map(p => p.agent.id)).size).toBe(partyCount);
      const first = parties[0];
      const second = parties[1];
      if (!first || !second) throw new Error('Missing parties');
      expect(await call(second.client, 'get_commitment_status', { commitmentId: first.id })).toMatchObject({ ok: false, reason: 'not_found' });
      await settleDue(db, owner.id, () => now);
      for (const party of parties) expect(await call(party.client, 'get_commitment_status', { commitmentId: party.id })).toMatchObject({ ok: true, commitment: { status: 'pending', pooledCovers: partyCount * 2 } });
      expect(await db.select().from(clearings).where(eq(clearings.ruleId, ruleId))).toEqual([]);
      expect((await merchantLedger(db, owner.id)).totals.entries).toBe(0);
      now = AFTER;
      const outcomes = [];
      for (let pass = 0; pass < 3; pass++) {
        await settleDue(db, owner.id, () => now);
        for (const party of parties) {
          const result = await call(party.client, 'get_commitment_status', { commitmentId: party.id });
          expect(result).toMatchObject({ ok: true, commitment: { status: scenario === 'success' ? 'filled' : 'not_filled' } });
          outcomes.push(result);
        }
        await dashboard(db, owner.id, () => now);
      }
      const saved = await db.select().from(clearings).where(eq(clearings.ruleId, ruleId));
      const fills = await db.select().from(clearingFills).where(eq(clearingFills.ruleId, ruleId));
      const entries = await db.select().from(ledger).where(eq(ledger.ruleId, ruleId));
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ unlocked: scenario === 'success', termsVersion: 1 });
      expect((await db.select().from(commitments).where(eq(commitments.ruleId, ruleId))).map(c => c.agentId).sort()).toEqual(parties.map(p => p.agent.id).sort());
      expect(fills.map(f => f.commitmentId).sort()).toEqual(scenario === 'success' ? parties.map(p => p.id).sort() : []);
      expect(entries.map(e => e.commitmentId).sort()).toEqual(fills.map(f => f.commitmentId).sort());
      expect(fills.reduce((sum, f) => sum + f.covers, 0)).toBe(scenario === 'success' ? 8 : 0);
      for (const entry of entries) expect(entry).toMatchObject({ covers: 2, listPriceCents: 680, pricePerCoverCents: 544, savingsCents: 272, buyerShareCents: 272, agentShareCents: 0, networkShareCents: 0 });
      const reconciled = await merchantLedger(db, owner.id);
      expect(reconciled).toMatchObject({ reconciled: true, missing: [], mismatched: [], orphaned: [], totals: { entries: scenario === 'success' ? 4 : 0, covers: scenario === 'success' ? 8 : 0, chargedCents: scenario === 'success' ? 4352 : 0, buyerShareCents: scenario === 'success' ? 1088 : 0, agentShareCents: 0, networkShareCents: 0 } });
      const publicLedger = await publicDemoLedger(db, name);
      expect(publicLedger).toMatchObject({ reconciled: true, covers: scenario === 'success' ? 8 : 0 });
      const memories: unknown[] = [];
      expect(await replanSoldOut(db, { id: owner.id, name }, async memory => { memories.push(memory); return PLAN; }, 'fixture:s1-wonder', () => now)).toEqual({ status: 'planned', planned: scenario === 'success' ? 1 : 0 });
      expect(await readRule()).toEqual(original);
      const board = await dashboard(db, owner.id, () => now);
      let approval: unknown = null;
      if (scenario === 'success') {
        const plan = board.plans[0];
        expect(plan).toMatchObject({ verdict: 'ok', applied: false, model: 'fixture:s1-wonder' });
        if (!plan) throw new Error('Missing plan');
        expect(await db.select().from(planApplications).where(eq(planApplications.planId, plan.id))).toEqual([]);
        const outsider = await mintMerchant(t.db, 'SCRIPTED different owner');
        expect(await applyPlan(db, outsider.id, plan.id, () => now)).toEqual({ status: 'not_found' });
        expect(await readRule()).toEqual(original);
        approval = await applyPlan(db, owner.id, plan.id, () => now);
        expect(approval).toEqual({ status: 'applied', termsVersion: 2 });
        expect(await readRule()).toMatchObject({ termsVersion: 2, capacityCovers: 10, discountBps: 1500, minPoolCovers: 8, perAgentCapCovers: 2, floorPriceCents: 503 });
        // The existing function checks the now-old terms version before its unique application key.
        expect(await applyPlan(db, owner.id, plan.id, () => now)).toEqual({ status: 'stale' });
        expect(await db.select().from(planApplications).where(eq(planApplications.planId, plan.id))).toHaveLength(1);
        publicReplies.push(await call(first.client, 'get_agent_terms', { ruleId }));
      } else expect(board.plans).toEqual([]);
      expect(await replanSoldOut(db, { id: owner.id, name }, async () => PLAN, 'fixture:s1-wonder', () => now)).toEqual({ status: 'planned', planned: 0 });
      const publicJson = JSON.stringify([...publicReplies, ...outcomes, publicLedger]);
      expect(publicJson).not.toMatch(/floor|rationale|SCRIPTED S1 WONDER|capacityCovers|token/i);
      expect(JSON.stringify(memories)).not.toMatch(/floorPriceCents|503|5\.03/);
      expect(await merchantLedger(db, owner.id)).toEqual(reconciled);
      receipts.push({ scenario, merchantId: owner.id, ruleId, draftId: draft.draftId, beforeDeadline: 'all pending, zero clearings/ledger entries', parties: parties.map(p => ({ agentId: p.agent.id, commitmentId: p.id, approval: p.approval })), distinctCredentials: true, crossPartyRead: 'not_found', clearings: saved, fills, ledger: entries, reconciliation: reconciled, publicLedger, unchangedUntilOwnerApproval: true, ownerApproval: approval, finalRule: await readRule() });
    }
    expect(await db.select().from(llmCalls)).toEqual([]);
    if (process.env.S1_EVIDENCE_DIR) await writeFile(`${process.env.S1_EVIDENCE_DIR}/service-run-${repetition}.json`, JSON.stringify({ provenance: 'authored synthetic fixtures; scripted approvals; offline model boundaries', repetition, runtimeRole: 'backfill_app member; not database owner', settings: SETTINGS, menu: MENU, wonder: PLAN, clocks: { before: BEFORE, after: AFTER }, receipts, modelCalls: 0 }, null, 2) + '\n');
  } finally {
    await Promise.all(clients.map(c => c.close()));
    await runtime?.close();
    await t.drop();
    const root = postgres(process.env.TEST_DATABASE_URL ?? '', { max: 1, onnotice: () => {} });
    try { await root.unsafe(`DROP ROLE IF EXISTS ${role}`); } finally { await root.end({ timeout: 5 }); }
  }
});
