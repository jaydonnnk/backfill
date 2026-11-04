import assert from 'node:assert/strict';
import {z} from 'zod';
import {clear} from '../../src/domain/clearing/clear';
import type {Commitment} from '../../src/domain/commitments/schema';
import {occurrenceOn} from '../../src/domain/commitments/occurrence';
import {MAX_ROUNDS,maxConcessionCents,settleRound,startRound} from '../../src/domain/negotiation/rules';
import {offerPriceCents} from '../../src/domain/offers/evaluate';
import {MerchantRule} from '../../src/domain/offers/schema';
import type {ProposalInput} from '../../src/lib/negotiation/merchant-agent';
import {fixedConcession} from './proof-s6-policy';

// A pure replay of one negotiation and its clearing, built on the real round and clearing functions.
// It stores nothing and calls nothing. proof-s6-replay.ts proves it against all saved S6 outcomes,
// and tests/integration/proof-s6b-parity.test.ts proves it against the real services.

const Id=z.string().regex(/^[a-z0-9_]+$/u),Bps=z.int().nonnegative();
const Calendar=z.strictObject({visitDate:z.iso.date(),referenceClock:z.iso.datetime(),focalClock:z.iso.datetime(),ruleDefaults:z.strictObject({weekday:z.int(),startMinute:z.int(),endMinute:z.int(),commitByMinute:z.int(),perAgentCapCovers:z.int().positive()})});
const Cases=Calendar.extend({
 version:z.literal('s6-pricing-2'),frozenBeforeResults:z.literal(true),evaluationKind:z.literal('deterministic_offline'),doesNotReplace:z.string(),liveAiAuthorized:z.literal(false),aiArm:z.null(),settlementClock:z.iso.datetime(),focalCovers:z.int().positive(),backgroundCoversPerParty:z.int().positive(),
 priceWorlds:z.array(z.strictObject({id:Id,listPriceCents:z.int().positive(),discountBps:Bps,floorPriceCents:z.int().positive()})).min(1),
 pools:z.array(z.strictObject({id:Id,backgroundParties:z.int().nonnegative(),minPoolCovers:z.int().positive(),capacityCovers:z.int().positive()})).min(1),
 reservationBpsOfOffer:z.array(Bps).min(1),buyerGapBpsOfOffer:Bps,buyerLowballBpsOfOffer:Bps,
 buyers:z.array(z.strictObject({id:z.enum(['walk_one','open_take','repeat_take','ladder_take','lowball_take']),bids:z.string(),commit:z.string()})).length(5),
 policies:z.array(z.strictObject({id:z.enum(['fixed_max','always_hold','half_step','quarter_step','hold_first_then_max','accept_in_band_else_hold','pivotal_max_else_hold']),inputs:z.string(),rule:z.string()})).length(7),
 costBpsOfOffer:z.array(Bps).min(1),comparator:z.literal('fixed_max'),decisionRule:z.string().min(1),
}).strict();
export type S6bCases=z.infer<typeof Cases>;
export const parseS6bCases=(input:unknown)=>Cases.parse(input);
export type Calendar=z.infer<typeof Calendar>;

export type PolicyContext={focalIsPivotal:boolean};
export type Policy=(input:ProposalInput,context:PolicyContext)=>number;
export const POLICIES:Record<S6bCases['policies'][number]['id'],Policy>={
 fixed_max:input=>fixedConcession(input),
 always_hold:input=>input.previousPriceCents,
 half_step:input=>stepPolicy(Math.floor(input.maxConcessionCents/2))(input,{focalIsPivotal:false}),
 quarter_step:input=>stepPolicy(Math.floor(input.maxConcessionCents/4))(input,{focalIsPivotal:false}),
 hold_first_then_max:input=>input.round===1?input.previousPriceCents:fixedConcession(input),
 accept_in_band_else_hold:input=>input.bidCents>=input.previousPriceCents-input.maxConcessionCents?input.bidCents:input.previousPriceCents,
 pivotal_max_else_hold:(input,context)=>context.focalIsPivotal?fixedConcession(input):input.previousPriceCents,
};
export function stepPolicy(step:number):Policy{return input=>Math.max(input.bidCents,input.previousPriceCents-step);}

export type World={id:string;merchantName:string;listPriceCents:number;discountBps:number;floorPriceCents:number;minPoolCovers:number;capacityCovers:number;backgroundParties:number;backgroundCovers:number;focalCovers:number;event:'normal'|'change_terms'|'past_deadline';bids:readonly number[];
 // Null commits only on an accepted round; otherwise the buyer also takes the last signed counter at or below this.
 reservationCents:number|null};
export type Outcome={worldId:string;rounds:string[];status:string|null;acceptedQuoteCents:number|null;counterCents:number|null;submitted:boolean;refusal:string|null;proposalCalls:number;guardRejected:number;focalCovers:number;focalCents:number;poolCovers:number;poolCents:number;offerPriceCents:number};

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function makeRule(calendar:Calendar,w:World,termsVersion=1,discountBps=w.discountBps){
 const d=calendar.ruleDefaults;
 return MerchantRule.parse({id:uuid(1),merchantId:uuid(2),termsVersion,listPriceCents:w.listPriceCents,capacityCovers:w.capacityCovers,terms:{window:{weekday:d.weekday,startMinute:d.startMinute,endMinute:d.endMinute,commitByMinute:d.commitByMinute},discountBps,minPoolCovers:w.minPoolCovers,perAgentCapCovers:d.perAgentCapCovers,floorPriceCents:w.floorPriceCents}});
}
export function simulate(calendar:Calendar,w:World,policy:Policy):Outcome{
 const rule=makeRule(calendar,w),offer=offerPriceCents(rule),background=w.backgroundParties*w.backgroundCovers;
 const context={focalIsPivotal:background<w.minPoolCovers&&background+w.focalCovers>=w.minPoolCovers&&background+w.focalCovers<=w.capacityCovers};
 const rounds:string[]=[];let previous=offer,status:string|null=null,counter:number|null=null,refusal:string|null=null,lastBid=0,proposalCalls=0,guardRejected=0;
 if(w.focalCovers>rule.terms.perAgentCapCovers)refusal='over_agent_cap';
 else for(const bid of w.bids){
  const round=rounds.length+1,ctx={rule,round,previousPriceCents:previous,bidCents:bid};
  assert(round<=MAX_ROUNDS);
  // Same key order as negotiate(), so a recording's input hash can match only an identical input.
  const input:ProposalInput={merchantName:w.merchantName,listPriceCents:w.listPriceCents,offerPriceCents:offer,previousPriceCents:previous,bidCents:bid,covers:w.focalCovers,round,maxRounds:MAX_ROUNDS,maxConcessionCents:maxConcessionCents(rule)};
  const start=startRound(ctx);assert(start.ok);
  const proposal=start.needsProposal?policy(input,context):null;if(proposal!==null)proposalCalls++;
  const settled=settleRound(ctx,proposal);assert(settled.counterCents!==undefined);
  if(settled.proposal&&!settled.proposal.verdict.ok)guardRejected++;
  status=settled.status;previous=counter=settled.counterCents;lastBid=bid;
  rounds.push([round,bid,proposal??'',settled.proposal?(settled.proposal.verdict.ok?'ok':settled.proposal.verdict.reason):'',status,counter].join('/'));
  if(status==='accepted')break;
 }
 const accepted=status==='accepted';
 const submitted=counter!==null&&(accepted||(w.reservationCents!==null&&counter<=w.reservationCents));
 if(accepted)assert(counter!==null&&counter<=lastBid);
 const occurrence=occurrenceOn(rule.terms.window,calendar.visitDate);assert(occurrence);
 const stored:Commitment[]=[];
 for(let i=0;i<w.backgroundParties;i++)stored.push({id:uuid(10+i),ruleId:rule.id,agentId:`background-${i}`,termsVersion:1,covers:w.backgroundCovers,maxPricePerCoverCents:offer,visitAt:occurrence.startsAt,committedAt:new Date(Date.parse(calendar.referenceClock)+i*1000)});
 const focalId=uuid(99);
 if(submitted&&counter!==null){
  if(w.event==='change_terms')refusal='stale_terms';
  else if(w.event==='past_deadline')refusal='past_deadline';
  else stored.push({id:focalId,ruleId:rule.id,agentId:'focal',termsVersion:1,covers:w.focalCovers,maxPricePerCoverCents:counter,negotiatedPriceCents:counter,visitAt:occurrence.startsAt,committedAt:new Date(calendar.focalClock)});
 }
 const finalRule=w.event==='change_terms'?makeRule(calendar,w,2,1500):rule;
 const fills=clear(finalRule,calendar.visitDate,stored).fills;
 for(const f of fills){assert(f.pricePerCoverCents>=w.floorPriceCents);assert(f.pricePerCoverCents<=offer);}
 const focal=fills.filter(f=>f.commitmentId===focalId);
 if(w.reservationCents!==null)for(const f of focal)assert(f.pricePerCoverCents<=w.reservationCents);
 const total=(rows:typeof fills)=>({covers:rows.reduce((n,f)=>n+f.covers,0),cents:rows.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0)});
 return {worldId:w.id,rounds,status,acceptedQuoteCents:accepted?counter:null,counterCents:counter,submitted,refusal,proposalCalls,guardRejected,focalCovers:total(focal).covers,focalCents:total(focal).cents,poolCovers:total(fills).covers,poolCents:total(fills).cents,offerPriceCents:offer};
}

export type S6bWorld=World&{priceWorld:string;pool:string;buyer:S6bCases['buyers'][number]['id'];reservationBps:number};
export function expandWorlds(data:S6bCases):S6bWorld[]{
 const worlds:S6bWorld[]=[];
 for(const price of data.priceWorlds)for(const pool of data.pools)for(const buyer of data.buyers)for(const reservationBps of data.reservationBpsOfOffer){
  const offer=price.listPriceCents-Math.floor(price.listPriceCents*price.discountBps/10000),part=(bps:number)=>Math.floor(offer*bps/10000);
  const reservation=part(reservationBps),ask=Math.min(reservation,offer),gap=part(data.buyerGapBpsOfOffer),low=part(data.buyerLowballBpsOfOffer);
  const bids={walk_one:[ask],open_take:[ask-gap],repeat_take:[ask,ask,ask],ladder_take:[ask-2*gap,ask-gap,ask],lowball_take:[low,low,low]}[buyer.id];
  const id=`${price.id}-${pool.id}-${buyer.id}-r${reservationBps}`;
  worlds.push({id,merchantName:`S6b synthetic ${price.id}`,listPriceCents:price.listPriceCents,discountBps:price.discountBps,floorPriceCents:price.floorPriceCents,minPoolCovers:pool.minPoolCovers,capacityCovers:pool.capacityCovers,backgroundParties:pool.backgroundParties,backgroundCovers:data.backgroundCoversPerParty,focalCovers:data.focalCovers,event:'normal',bids,reservationCents:buyer.id==='walk_one'?null:reservation,priceWorld:price.id,pool:pool.id,buyer:buyer.id,reservationBps});
 }
 return worlds;
}

export type Slice={worlds:number;focalDeals:number;focalSeats:number;focalCents:number;poolSeats:number;poolCents:number;proposalCalls:number;guardRejected:number;poolMarginCents:Record<string,number>;
 // Comparable across price worlds: mean focal price as a share of the offer, and pool margin in offer-priced seats per world.
 focalPriceShareOfOffer:number|null;poolMarginSeatsPerWorld:Record<string,number>};
const round4=(n:number)=>Math.round(n*10000)/10000;
export function summarize(rows:readonly {world:S6bWorld;outcome:Outcome}[],costs:readonly number[]):Slice{
 const margin:Record<string,number>={},index:Record<string,number>={};
 for(const c of costs){margin[c]=0;index[c]=0;}
 let focalDeals=0,focalSeats=0,focalCents=0,poolSeats=0,poolCents=0,proposalCalls=0,guardRejected=0,share=0;
 for(const {outcome:o} of rows){
  focalDeals+=o.focalCovers>0?1:0;focalSeats+=o.focalCovers;focalCents+=o.focalCents;poolSeats+=o.poolCovers;poolCents+=o.poolCents;proposalCalls+=o.proposalCalls;guardRejected+=o.guardRejected;share+=o.focalCents/o.offerPriceCents;
  for(const c of costs){const value=o.poolCents-o.poolCovers*Math.floor(o.offerPriceCents*c/10000);margin[c]=(margin[c]??0)+value;index[c]=(index[c]??0)+value/o.offerPriceCents;}
 }
 const n=rows.length;
 return {worlds:n,focalDeals,focalSeats,focalCents,poolSeats,poolCents,proposalCalls,guardRejected,poolMarginCents:margin,focalPriceShareOfOffer:focalSeats?round4(share/focalSeats):null,poolMarginSeatsPerWorld:Object.fromEntries(costs.map(c=>[String(c),round4((index[c]??0)/n)]))};
}

export type Decision={policy:string;slices:number;focalSeatsBehind:number;poolSeatsBehind:number;marginBehind:number;marginAhead:number;defaultCandidate:boolean};
// Applies the frozen decision rule mechanically, slice by slice against the comparator.
export function decide(data:S6bCases,bySlice:Readonly<Record<string,Readonly<Record<string,Slice>>>>):Decision[]{
 const base=bySlice[data.comparator];assert(base);
 return data.policies.filter(p=>p.id!==data.comparator).map(p=>{
  const own=bySlice[p.id];assert(own);
  let focalSeatsBehind=0,poolSeatsBehind=0,marginBehind=0,marginAhead=0;
  const keys=Object.keys(base);
  for(const key of keys){
   const a=own[key],b=base[key];assert(a&&b);
   if(a.focalSeats<b.focalSeats)focalSeatsBehind++;
   if(a.poolSeats<b.poolSeats)poolSeatsBehind++;
   for(const c of data.costBpsOfOffer){const x=a.poolMarginCents[c]??0,y=b.poolMarginCents[c]??0;if(x<y)marginBehind++;if(x>y)marginAhead++;}
  }
  return {policy:p.id,slices:keys.length,focalSeatsBehind,poolSeatsBehind,marginBehind,marginAhead,defaultCandidate:focalSeatsBehind===0&&poolSeatsBehind===0&&marginBehind===0};
 });
}
