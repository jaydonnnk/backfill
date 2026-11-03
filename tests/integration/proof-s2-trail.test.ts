import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { eq, ne } from 'drizzle-orm';
import { demoTrails, merchants, rules } from '@/lib/db/schema';
import { storeScriptedTrail } from '../support/proof-s2';
import { expect, it } from 'vitest';
import { demoSnapshot, DEMO_MERCHANT_NAME } from '@/lib/demo/snapshot';
import { mintAgent } from '@/lib/agents/tokens';
import { submitCommitment, settleDue } from '@/lib/commitments/service';
import { mintMerchant } from '@/lib/onboarding/links';
import { publishDraft, readMenu, replanSoldOut } from '@/lib/onboarding/service';
import { createTestDatabase } from '../support/db';
import { BEFORE, AFTER, MENU, PHOTO, PLAN, SETTINGS, VISIT, submission } from '../support/proof-s1';

it('filters stored merchant rationale and labels fixture plans without claiming model provenance', async () => {
  const local = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
  expect([local.protocol, local.hostname, local.port, local.pathname]).toEqual(['postgres:', '127.0.0.1', '5432', '/postgres']);
  const t = await createTestDatabase('proof_s2_privacy');
  try {
    const owner = await mintMerchant(t.db, DEMO_MERCHANT_NAME);
    const draft = await readMenu(t.db, owner.id, PHOTO, async () => MENU, 'fixture:s2-menu', () => BEFORE);
    if (!('draftId' in draft)) throw new Error('Missing draft');
    const pub = await publishDraft(t.db, owner.id, draft.draftId, SETTINGS);
    if (pub.status !== 'published') throw new Error('Missing publication');
    for (let i = 0; i < 4; i++) {
      const agent = await mintAgent(t.db, `privacy-${i}`, 'Synthetic party');
      expect(await submitCommitment(t.db, agent.id, submission(pub.ruleId, VISIT, agent.id), () => BEFORE)).toMatchObject({ ok: true });
    }
    await settleDue(t.db, owner.id, () => AFTER);
    await replanSoldOut(t.db, { id: owner.id, name: DEMO_MERCHANT_NAME }, async () => ({ ...PLAN, rationale: 'MERCHANT_ONLY_CANARY private floor S$5.03 credential secret' }), 'fixture:s2-wonder', () => AFTER);
    const snapshot = await demoSnapshot(t.db, AFTER);
    expect(JSON.stringify(snapshot)).not.toMatch(/MERCHANT_ONLY_CANARY|5\.03|credential secret/);
    expect(snapshot.scene?.plan?.provenance).toBe('fixture');
  } finally { await t.drop(); }
});

it('links stored fixture decisions to exact commitments through pending, settlement and later owner terms', async () => {
  const local = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
  expect([local.protocol, local.hostname, local.port, local.pathname]).toEqual(['postgres:', '127.0.0.1', '5432', '/postgres']);
  const t = await createTestDatabase('proof_s2_trail');
  const receipts = [];
  try {
    for (const count of [4, 3]) {
      const runId = randomUUID();
      const owner = await mintMerchant(t.db, DEMO_MERCHANT_NAME);
      // Select only this fixture merchant in the public named scene.
      await t.db.update(merchants).set({ name: 'Retired S2 fixture' }).where(ne(merchants.id, owner.id));
      const draft = await readMenu(t.db, owner.id, PHOTO, async () => MENU, 'fixture:s2-menu', () => BEFORE);
      if (!('draftId' in draft)) throw new Error('Missing draft');
      const pub = await publishDraft(t.db, owner.id, draft.draftId, SETTINGS);
      if (pub.status !== 'published') throw new Error('Missing publication');
      const ruleId = pub.ruleId;
      const parties: { commitmentId: string; terms: import('@/lib/demo/trail').TrailTerms; variant: string }[] = [];
      for (let i = 0; i < count; i++) {
        const agent = await mintAgent(t.db, `s2-${count}-${i}`, `Synthetic party ${i + 1}`);
        const c = await submitCommitment(t.db, agent.id, submission(ruleId, VISIT, agent.id), () => BEFORE);
        if (!c.ok) throw new Error('Submission refused');
        const commitmentId = c.commitment.commitmentId;
        const terms = { runId, partyId: agent.id, ruleId, termsVersion: 1, visitDate: VISIT, covers: 2, pricePerCoverCents: 544, totalCents: 1088 };
        const variant = (['scripted', 'missing', 'changed_price', 'changed_version'] as const)[i]!;
        await storeScriptedTrail(t.db, terms, commitmentId, BEFORE, variant);
        parties.push({ commitmentId, terms, variant });
      }
      const proposalAgent = await mintAgent(t.db, `proposal-${count}`, 'Synthetic proposal only');
      await storeScriptedTrail(t.db, { runId, partyId: proposalAgent.id, ruleId, termsVersion: 1, visitDate: VISIT, covers: 2, pricePerCoverCents: 544, totalCents: 1088 }, null, BEFORE, 'no_output');
      // Malformed evidence must be ignored, never projected as success or approval.
      await t.db.insert(demoTrails).values({ ruleId, partyId: proposalAgent.id, visitDate: VISIT, record: { secret: 'MALFORMED_CANARY', approval: 'human_approved' } });
      const pending = await demoSnapshot(t.db, BEFORE);
      expect(pending.scene).toMatchObject({ phase: 'open', pooled: { covers: count * 2, filledCovers: 0, soldOut: false } });
      expect(pending.scene?.trail?.map(r => r.result).sort()).toEqual([...Array<string>(count).fill('pending'), 'proposal_only'].sort());
      const byParty = (s: Awaited<ReturnType<typeof demoSnapshot>>, i: number) => s.scene?.trail?.find(r => r.final?.partyId === parties[i]?.terms.partyId);
      expect(byParty(pending, 0)).toMatchObject({ approval: 'scripted', final: { pricePerCoverCents: 544, totalCents: 1088 } });
      expect(byParty(pending, 1)?.approval).toBe('unavailable');
      expect(byParty(pending, 2)?.approval).toBe('mismatch');
      if (count === 4) expect(byParty(pending, 3)?.approval).toBe('mismatch');
      expect(pending.scene?.buyers).toHaveLength(count);
      await settleDue(t.db, owner.id, () => AFTER);
      const settled = await demoSnapshot(t.db, AFTER);
      expect(settled.scene?.pooled.filledCovers).toBe(count === 4 ? 8 : 0);
      expect(settled.scene?.trail?.filter(r => r.result === (count === 4 ? 'filled' : 'not_filled'))).toHaveLength(count);
      expect(settled.ledger?.buyerShareCents).toBe(count === 4 ? 1088 : 0);
      // Owner changes public price and version after settlement. Final commitment terms stay v1.
      await t.db.update(rules).set({ discountBps: 1500 }).where(eq(rules.id, ruleId));
      const advanced = await demoSnapshot(t.db, AFTER);
      expect(advanced.scene?.offerPriceCents).toBe(578);
      expect(byParty(advanced, 0)).toMatchObject({ approval: 'scripted', final: { termsVersion: 1, pricePerCoverCents: 544, totalCents: 1088 } });
      expect(JSON.stringify(advanced)).not.toMatch(/MALFORMED_CANARY|floorPrice|tokenSha|human_approved|SCRIPTED S1 WONDER/);
      await expect(t.admin`update demo_trails set record='{}'::jsonb`).rejects.toThrow(/append-only/);
      receipts.push({ runId, ruleId, parties, pending, settled, advanced });
    }
    if (process.env.S2_EVIDENCE_DIR) await writeFile(`${process.env.S2_EVIDENCE_DIR}/service-trail.json`, JSON.stringify({ provenance: 'authored fixture requests and covers/reason outputs; local scripted authorizations', receipts }, null, 2) + '\n');
  } finally { await t.drop(); }
});

it('does not reuse an earlier approval when the actual submitted price and version change', async () => {
  const t = await createTestDatabase('proof_s2_changed_terms');
  try {
    const owner = await mintMerchant(t.db, DEMO_MERCHANT_NAME);
    const draft = await readMenu(t.db, owner.id, PHOTO, async () => MENU, 'fixture:s2-menu', () => BEFORE);
    if (!('draftId' in draft)) throw new Error('Missing draft');
    const pub = await publishDraft(t.db, owner.id, draft.draftId, SETTINGS);
    if (pub.status !== 'published') throw new Error('Missing publication');
    const agent = await mintAgent(t.db, 'changed-actual-terms', 'Synthetic changed terms party');
    const old = { runId: randomUUID(), partyId: agent.id, ruleId: pub.ruleId, termsVersion: 1, visitDate: VISIT, covers: 2, pricePerCoverCents: 544, totalCents: 1088 };
    await t.db.update(rules).set({ discountBps: 1500 }).where(eq(rules.id, pub.ruleId));
    const c = await submitCommitment(t.db, agent.id, { ...submission(pub.ruleId, VISIT, agent.id), termsVersion: 2, maxPricePerCoverCents: 578 }, () => BEFORE);
    if (!c.ok) throw new Error('Submission refused');
    await storeScriptedTrail(t.db, old, c.commitment.commitmentId, BEFORE);
    const snapshot = await demoSnapshot(t.db, BEFORE);
    expect(snapshot.scene?.trail?.[0]).toMatchObject({ approval: 'mismatch', result: 'pending', terms: { termsVersion: 1, pricePerCoverCents: 544 }, final: { termsVersion: 2, pricePerCoverCents: 578, totalCents: 1156 } });
    // A fractional-cent discount uses the same merchant-favouring rounding as the booking engine.
    await t.db.update(rules).set({ listPriceCents: 681 }).where(eq(rules.id, pub.ruleId));
    const next = await mintAgent(t.db, 'rounding-actual-terms', 'Synthetic rounding party');
    const rounded = await submitCommitment(t.db, next.id, { ...submission(pub.ruleId, VISIT, next.id), termsVersion: 3, maxPricePerCoverCents: 579 }, () => BEFORE);
    expect(rounded.ok).toBe(true);
    const stored = await t.admin`select accepted_price_per_cover_cents as price from commitments where agent_id=${next.id}`;
    expect(stored[0]?.price).toBe(579);
    if (!rounded.ok) throw new Error('Rounded commitment refused');
    await t.db.insert(demoTrails).values({ ruleId: pub.ruleId, partyId: agent.id, visitDate: VISIT, commitmentId: rounded.commitment.commitmentId, record: {
      terms: { ...old, termsVersion: 3, pricePerCoverCents: 579, totalCents: 1158 }, request: 'DISCONNECTED_CANARY',
      output: { covers: 2, reason: 'Unrelated party output' }, provenance: 'fixture', proposedAt: BEFORE.toISOString(), approval: null,
    } });
    const latest = await demoSnapshot(t.db, BEFORE);
    expect(JSON.stringify(latest)).not.toContain('DISCONNECTED_CANARY');
    expect(latest.scene?.trail?.find(r => r.final?.partyId === next.id)).toMatchObject({ request: null, output: null, provenance: 'unavailable', approval: 'unavailable', final: { pricePerCoverCents: 579 } });
  } finally { await t.drop(); }
});
