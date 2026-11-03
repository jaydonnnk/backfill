import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createTestDatabase } from '../support/db';
import { mintMerchant } from '@/lib/onboarding/links';
import { mintAgent } from '@/lib/agents/tokens';
import { publishDraft, readMenu } from '@/lib/onboarding/service';
import { buyerRecording, replayBuyer } from '@/lib/buyer/recording';
import { buyerAction } from '@/lib/buyer/service';
import { buyerFixtures, INTENT } from '../support/proof-s4';
import { AFTER, BEFORE, MENU, PHOTO, SETTINGS } from '../support/proof-s1';
import { demoSnapshot, DEMO_MERCHANT_NAME } from '@/lib/demo/snapshot';
import { settleDue } from '@/lib/commitments/service';

it('runs four independent approved MCP commitments twice; three fill zero and a separate incompatible party declines', async () => {
  const receipts = [];
  for (const count of [4, 4, 3, 0]) {
    const t = await createTestDatabase('proof_s4_journey');
    try {
      const owner = await mintMerchant(t.db, DEMO_MERCHANT_NAME);
      const draft = await readMenu(t.db, owner.id, PHOTO, async () => MENU, 'fixture:s4-menu', () => BEFORE);
      if (!('draftId' in draft)) throw Error('draft');
      const pub = await publishDraft(t.db, owner.id, draft.draftId, SETTINGS);
      if (pub.status !== 'published') throw Error('publish');
      const sessions = [];
      for (let i = 0; i < Math.max(count, 1); i++) {
        const party = await mintAgent(t.db, `s4-${i}`, 'Synthetic party');
        const id = randomUUID();
        const act = (action: Record<string, unknown>) => buyerAction(t.db, party.id, { id, ...action }, buyerFixtures(), () => BEFORE);
        let r = await act({ action: 'start', request: 'Two for kopi on 2026-11-03 from 14:00 to 17:00, SGD6 each.' });
        expect(r.status).toBe('ok');
        r = await act({ action: 'parse', revision: 0 });
        expect(r.session?.proposal).toEqual(INTENT);
        r = await act({ action: 'review', revision: 0, constraints: count === 0 ? { ...INTENT, budgetPerCoverCents: 100 } : INTENT });
        r = await act({ action: 'decide', revision: 1, ruleId: pub.ruleId });
        expect(r.session?.decision?.covers).toBe(count === 0 ? 0 : 2);
        expect(await t.admin`select * from commitments`).toHaveLength(i);
        if (count === 0) {
          expect((await act({ action: 'approve', revision: 1, terms: r.session?.terms })).status).toBe('no_decision');
          sessions.push(r.session); continue;
        }
        const recording = buyerRecording(r.session!);
        const replay = replayBuyer(recording);
        expect((await replay.parse(recording.request, recording.referenceClock)).receipt.source).toBe('recorded_replay');
        expect((await replay.decide(party.id, recording.request, recording.constraints, recording.offer)).value.covers).toBe(2);
        await expect(replay.decide('wrong party', recording.request, recording.constraints, recording.offer)).rejects.toThrow('replay_input_mismatch');
        await expect(replay.decide(party.id, recording.request, recording.constraints, { ...recording.offer, visitDate: '2026-11-10' })).rejects.toThrow('replay_input_mismatch');
        expect(recording).not.toHaveProperty('approval');
        const terms = r.session!.terms;
        expect((await act({ action: 'submit', revision: 1 })).status).toBe('approval_required');
        r = await act({ action: 'approve', revision: 1, terms });
        expect(r.session?.approval).not.toBeNull();
        r = await act({ action: 'submit', revision: 1 });
        expect(r.session?.result).toMatchObject({ ok: true, commitment: { status: 'pending' } });
        const again = await act({ action: 'submit', revision: 1 });
        expect(again.session?.result).toEqual(r.session?.result);
        sessions.push(r.session);
      }
      const pending = await demoSnapshot(t.db, BEFORE);
      expect(pending.scene?.pooled).toMatchObject({ filledCovers: 0, covers: count * 2 });
      await settleDue(t.db, owner.id, () => AFTER);
      await settleDue(t.db, owner.id, () => AFTER);
      const settled = await demoSnapshot(t.db, AFTER);
      expect(settled.scene?.pooled.filledCovers).toBe(count === 4 ? 8 : 0);
      expect(await t.admin`select * from commitments`).toHaveLength(count);
      expect(await t.admin`select * from clearing_fills`).toHaveLength(count === 4 ? 4 : 0);
      expect(JSON.stringify(settled)).not.toMatch(/floorPrice|tokenSha|owner_voice|merchant rationale/);
      receipts.push({ count, sessions, pending, settled });
    } finally { await t.drop(); }
  }
  if (process.env.S4_EVIDENCE_DIR) await writeFile(`${process.env.S4_EVIDENCE_DIR}/service-journeys.json`, JSON.stringify({ provenance: 'model-boundary fixtures; scripted synthetic buyer approvals; actual MCP/database', receipts }, null, 2));
});
