import {z} from 'zod';
import type {ProposalInput} from '../../src/lib/negotiation/merchant-agent';

const Count=z.int().nonnegative(),Cents=z.int().nonnegative();
const Case=z.strictObject({
 id:z.string().regex(/^s6-\d{2}$/u),merchantName:z.string().min(1).max(80),description:z.string(),bidsCents:z.array(Cents).min(1).max(3),backgroundParties:Count.max(4),focalCovers:z.int().positive().max(4),
 serverFixture:z.strictObject({minPoolCovers:z.int().positive(),capacityCovers:z.int().positive(),floorPriceCents:Cents}),event:z.enum(['normal','change_terms','past_deadline']),
 expectedBaseline:z.strictObject({acceptedQuoteCents:Cents.nullable(),proposalCallbacks:Count.max(3),pooledCovers:Count,focalConfirmedCovers:Count,soloCovers:Count,guardRejectedProposals:Count,refusal:z.string().nullable()}),aiMeasurement:z.null(),
});
const Cases=z.strictObject({version:z.literal('s6-pricing-1'),frozenBeforeNewAiCalls:z.literal(true),visitDate:z.iso.date(),referenceClock:z.iso.datetime(),focalClock:z.iso.datetime(),settlementClock:z.iso.datetime(),policy:z.literal('max(bidCents, previousPriceCents - maxConcessionCents)'),maxRounds:z.literal(3),automaticRetries:z.literal(0),maxNewAiRequestsWithoutEarlyAcceptance:z.literal(16),liveAiAuthorized:z.literal(false),ruleDefaults:z.strictObject({listPriceCents:z.literal(680),discountBps:z.literal(2000),weekday:z.literal(4),startMinute:z.literal(840),endMinute:z.literal(1020),commitByMinute:z.literal(720),perAgentCapCovers:z.literal(2)}),cases:z.array(Case).length(12)})
 .refine(d=>new Set(d.cases.map(c=>c.id)).size===12,'Cases must be unique')
 .refine(d=>d.cases.every(c=>c.serverFixture.minPoolCovers<=c.serverFixture.capacityCovers),'Minimum must fit capacity');
export type CaseSet=z.infer<typeof Cases>;
export type PricingCase=CaseSet['cases'][number];
export const parseCaseSet=(input:unknown)=>Cases.parse(input);
// Only public round inputs. The same server applies hidden-floor and concession guards.
export const fixedConcession=(input:ProposalInput)=>Math.max(input.bidCents,input.previousPriceCents-input.maxConcessionCents);
export type PricingOutcome={id:string;pooledCovers:number;soloCovers:number;focalConfirmedCovers:number;chargedCents:number;savingsCents:number;focalChargedCents:number;proposalCallbacks:number;guardRejectedProposals:number};
export function summarizePricing(rows:readonly PricingOutcome[]){
 const sum=(pick:(r:PricingOutcome)=>number)=>rows.reduce((a,r)=>a+pick(r),0);
 return {cases:rows.length,pooledCovers:sum(r=>r.pooledCovers),soloCovers:sum(r=>r.soloCovers),incrementalSyntheticCovers:sum(r=>r.pooledCovers-r.soloCovers),focalConfirmedCases:rows.filter(r=>r.focalConfirmedCovers>0).length,focalConfirmedCovers:sum(r=>r.focalConfirmedCovers),poolChargedCents:sum(r=>r.chargedCents),poolSavingsCents:sum(r=>r.savingsCents),focalChargedCents:sum(r=>r.focalChargedCents),proposalCallbacks:sum(r=>r.proposalCallbacks),guardRejectedProposals:sum(r=>r.guardRejectedProposals),ai:{measuredCases:0,confirmedCovers:null,costUsd:null,latencyMs:null,winner:null}};
}
