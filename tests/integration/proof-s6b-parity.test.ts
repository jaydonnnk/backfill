import {eq} from 'drizzle-orm';
import {randomBytes} from 'node:crypto';
import {expect,it} from 'vitest';
import {createTestDatabase} from '../support/db';
import cases from '../../docs/plans/backfill-proof/s6b-cases.json';
import {mintAgent} from '../../src/lib/agents/tokens';
import {settleDue,submitCommitment} from '../../src/lib/commitments/service';
import {clearingFills,rules} from '../../src/lib/db/schema';
import {negotiate} from '../../src/lib/negotiation/service';
import {mintMerchant} from '../../src/lib/onboarding/links';
import {POLICIES,expandWorlds,parseS6bCases,simulate,type Policy,type S6bWorld} from '../../scripts/verification/proof-s6b-model';

// The simulator's commit paths, held and countered counters included, must match the real services.
const data=parseS6bCases(cases);
type T=Awaited<ReturnType<typeof createTestDatabase>>;
async function realOutcome(t:T,w:S6bWorld,policy:Policy,tag:string){
 const owner=await mintMerchant(t.db,w.merchantName),d=data.ruleDefaults;
 const [rule]=await t.db.insert(rules).values({merchantId:owner.id,listPriceCents:w.listPriceCents,discountBps:w.discountBps,weekday:d.weekday,startMinute:d.startMinute,endMinute:d.endMinute,commitByMinute:d.commitByMinute,perAgentCapCovers:d.perAgentCapCovers,capacityCovers:w.capacityCovers,minPoolCovers:w.minPoolCovers,floorPriceCents:w.floorPriceCents}).returning();
 if(!rule)throw Error('No rule');
 const offer=w.listPriceCents-Math.floor(w.listPriceCents*w.discountBps/10000);
 for(let i=0;i<w.backgroundParties;i++){
  const party=await mintAgent(t.db,`${tag}-bg-${i}`,'S6b parity background');
  const at=new Date(Date.parse(data.referenceClock)+i*1000);
  const submitted=await submitCommitment(t.db,party.id,{ruleId:rule.id,termsVersion:1,visitDate:data.visitDate,covers:w.backgroundCovers,maxPricePerCoverCents:offer,idempotencyKey:`${tag}-bg-${i}`},()=>at);
  expect(submitted.ok).toBe(true);
 }
 const focal=await mintAgent(t.db,`${tag}-focal`,'S6b parity focal'),secret=randomBytes(32).toString('hex'),clock=()=>new Date(data.focalClock);
 let price=0,token='',status='',submitted=false,focalId:string|null=null;
 for(const bidCents of w.bids){
  const reply=await negotiate(t.db,{secret,clock,propose:async input=>policy(input,{focalIsPivotal:false})},focal.id,{ruleId:rule.id,termsVersion:1,visitDate:data.visitDate,covers:w.focalCovers,bidCents});
  if(!reply.ok)throw Error(reply.reason);
  price=reply.negotiation.merchantPriceCents;token=reply.negotiation.counterOffer;status=reply.negotiation.status;
  if(status==='accepted')break;
 }
 if(status==='accepted'||(w.reservationCents!==null&&price<=w.reservationCents)){
  const reply=await submitCommitment(t.db,focal.id,{ruleId:rule.id,termsVersion:1,visitDate:data.visitDate,covers:w.focalCovers,maxPricePerCoverCents:price,idempotencyKey:`${tag}-focal`,counterOffer:token},clock,secret);
  if(!reply.ok)throw Error(reply.reason);
  submitted=true;focalId=reply.commitment.commitmentId;
 }
 await settleDue(t.db,owner.id,()=>new Date(data.settlementClock));
 const fills=await t.db.select().from(clearingFills).where(eq(clearingFills.ruleId,rule.id));
 const mine=fills.filter(f=>f.commitmentId===focalId),sum=(rows:typeof fills)=>({covers:rows.reduce((n,f)=>n+f.covers,0),cents:rows.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0)});
 return {status,counterCents:price,submitted,focalCovers:sum(mine).covers,focalCents:sum(mine).cents,poolCovers:sum(fills).covers,poolCents:sum(fills).cents};
}
it('matches real negotiate, submit and settle on an even sample of frozen worlds',async()=>{
 const t=await createTestDatabase('proof_s6b_parity');
 try{
  const sample=expandWorlds(data).filter((_,i)=>i%31===0),statuses=new Set<string>();
  expect(sample.length).toBeGreaterThanOrEqual(24);
  for(const [i,w] of sample.entries())for(const id of ['fixed_max','quarter_step'] as const){
   const model=simulate(data,w,POLICIES[id]),real=await realOutcome(t,w,POLICIES[id],`parity-${i}-${id}`);
   statuses.add(`${real.status}:${real.submitted}`);
   expect(real,`${w.id} ${id}`).toEqual({status:model.status,counterCents:model.counterCents,submitted:model.submitted,focalCovers:model.focalCovers,focalCents:model.focalCents,poolCovers:model.poolCovers,poolCents:model.poolCents});
  }
  expect([...statuses].some(s=>s==='countered:true'||s==='held:true')).toBe(true);
  expect(statuses.has('accepted:true')).toBe(true);
 }finally{await t.drop();}
},180_000);
