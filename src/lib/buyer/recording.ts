import { z } from 'zod';
import { BuyerDecision } from '../../../sim/buyers/buyer';
import { Session } from './service';
import { Intent, type Models } from './models';
const OfferSeen = z.strictObject({ merchantName: z.string(), about: z.string(), summary: z.string(), visitDate: z.iso.date(), commitBy: z.iso.datetime(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), perAgentCapCovers: z.int().positive() });
// No approval or commitment is replayed. New final terms always need new approval.
export const BuyerRecording = z.strictObject({
  version: z.literal('s4-buyer-1'), sessionId: z.uuid(), partyId: z.string(), revision: z.int().nonnegative(),
  request: Session.shape.request, referenceClock: z.iso.datetime(),
  parsed: Intent.nullable(), constraints: Intent, offer: OfferSeen, decision: BuyerDecision,
  parseReceipt: Session.shape.parseReceipt, decisionReceipt: Session.shape.decisionReceipt.unwrap(),
});
export function buyerRecording(session: Session) {
  if (!session.offer?.ok) throw Error('missing_evidence');
  const o = session.offer.terms;
  return BuyerRecording.parse({ version: 's4-buyer-1', sessionId: session.id, partyId: session.partyId, revision: session.revision, request: session.request, referenceClock: session.referenceClock, parsed: session.proposal, constraints: session.constraints,
    offer: { merchantName: o.merchantName, about: 'the public offer summary; no additional dietary or location guarantees', summary: o.summary, ...o.nextOccurrence, perAgentCapCovers: o.offer.perAgentCapCovers }, decision: session.decision, parseReceipt: session.parseReceipt, decisionReceipt: session.decisionReceipt });
}
export function replayBuyer(input: unknown): Models {
  const r = BuyerRecording.parse(input);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return {
    parse: async (request, referenceClock) => {
      if (!r.parsed || !r.parseReceipt) throw Error('missing_parser_recording');
      if (request !== r.request || referenceClock !== r.referenceClock) throw Error('replay_input_mismatch');
      return { value: r.parsed, receipt: { ...r.parseReceipt, source: 'recorded_replay' } };
    },
    decide: async (party, request, constraints, offer) => {
      if (party !== r.partyId || request !== r.request || !same(Intent.parse(constraints), r.constraints) || !same(OfferSeen.parse(offer), r.offer)) throw Error('replay_input_mismatch');
      return { value: r.decision, receipt: { ...r.decisionReceipt, source: 'recorded_replay' } };
    },
  };
}
