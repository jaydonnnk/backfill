import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isEntrypoint} from '../../src/lib/entrypoint';
import {MAX_ROUNDS} from '../../src/domain/negotiation/rules';
import {parseCaseSet,fixedConcession,type CaseSet,type PricingCase} from './proof-s6-policy';
import {simulate,stepPolicy,type Outcome,type Policy,type World} from './proof-s6b-model';

// Offline diagnostic of the frozen S6 run. It reads saved evidence and writes only its own new output.
// Spark answers only from a recording whose input hash matches exactly; any other input is unmeasured.

const ROOT='docs/plans/backfill-proof',EVIDENCE=join(ROOT,'evidence/s6-live-authorized-2026-11-04-01'),OUTPUT=join(ROOT,'evidence/s6-diagnostic-2026-11-04');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export class Unmeasured extends Error{}
export const recordedPolicy=(recordings:ReadonlyMap<string,number>):Policy=>input=>{
 const price=recordings.get(sha(JSON.stringify(input)));
 if(price===undefined)throw new Unmeasured();
 return price;
};
const fixed:Policy=input=>fixedConcession(input);
export function worldOf(c:PricingCase,data:CaseSet,buyer:{delta:number|null;repeat?:boolean}):World{
 const bids=[...c.bidsCents];
 if(buyer.repeat)while(bids.length<MAX_ROUNDS)bids.push(bids.at(-1)??0);
 return {id:c.id,merchantName:c.merchantName,listPriceCents:data.ruleDefaults.listPriceCents,discountBps:data.ruleDefaults.discountBps,floorPriceCents:c.serverFixture.floorPriceCents,minPoolCovers:c.serverFixture.minPoolCovers,capacityCovers:c.serverFixture.capacityCovers,backgroundParties:c.backgroundParties,backgroundCovers:2,focalCovers:c.focalCovers,event:c.event,bids,reservationCents:buyer.delta===null?null:(bids.at(-1)??0)+buyer.delta};
}
type Totals={focalSeats:number;focalCents:number;poolSeats:number;poolCents:number;unmeasuredCases:string[]};
export function totals(data:CaseSet,policy:Policy,buyer:{delta:number|null;repeat?:boolean}):Totals{
 const t:Totals={focalSeats:0,focalCents:0,poolSeats:0,poolCents:0,unmeasuredCases:[]};
 for(const c of data.cases){
  try{const o=simulate(data,worldOf(c,data,buyer),policy);t.focalSeats+=o.focalCovers;t.focalCents+=o.focalCents;t.poolSeats+=o.poolCovers;t.poolCents+=o.poolCents;}
  catch(error){if(error instanceof Unmeasured)t.unmeasuredCases.push(c.id);else throw error;}
 }
 return t;
}
type SavedRun={acceptedQuoteCents:number|null;pooledCovers:number;focalConfirmedCovers:number;focalChargedCents:number;chargedCents:number;refusal:string|null;guardRejectedProposals:number;rounds:{round:number;bidCents:number;proposedCents:number|null;proposalVerdict:string|null;status:string;counterCents:number}[]};
export function matchesSaved(o:Outcome,s:SavedRun){
 assert.deepEqual({quote:o.acceptedQuoteCents,pool:o.poolCovers,focal:o.focalCovers,focalCents:o.focalCents,all:o.poolCents,refusal:o.refusal,rejected:o.guardRejected,rounds:o.rounds},{quote:s.acceptedQuoteCents,pool:s.pooledCovers,focal:s.focalConfirmedCovers,focalCents:s.focalChargedCents,all:s.chargedCents,refusal:s.refusal,rejected:s.guardRejectedProposals,rounds:s.rounds.map(t=>[t.round,t.bidCents,t.proposedCents??'',t.proposalVerdict??'',t.status,t.counterCents].join('/'))});
}
// Fails unless the simulator reproduces every saved baseline and Spark outcome.
export async function loadAndGate(){
 const data=parseCaseSet(JSON.parse(await readFile(join(ROOT,'s6-cases.json'),'utf8')));
 const recordings=new Map<string,number>(),results:{caseId:string;round:number;price:number;rationale:string;inputSha256:string}[]=[];
 for(const name of (await readdir(EVIDENCE)).filter(n=>/round-\d-result\.json$/u.test(n)).sort()){
  const r=JSON.parse(await readFile(join(EVIDENCE,name),'utf8')),out=JSON.parse(r.output);
  recordings.set(r.inputSha256,out.priceCents);results.push({caseId:r.caseId,round:r.round,price:out.priceCents,rationale:out.rationale,inputSha256:r.inputSha256});
 }
 assert.equal(recordings.size,15);
 const spark=recordedPolicy(recordings),saved=new Map<string,{baseline:SavedRun;model:SavedRun}>();
 for(const c of data.cases){
  const s=JSON.parse(await readFile(join(EVIDENCE,c.id+'.json'),'utf8'));saved.set(c.id,s);
  matchesSaved(simulate(data,worldOf(c,data,{delta:null}),fixed),s.baseline);
  matchesSaved(simulate(data,worldOf(c,data,{delta:null}),spark),s.model);
 }
 return {data,spark,results,reproduced:data.cases.length*2};
}
export function diagnose(data:CaseSet,spark:Policy,results:readonly {caseId:string;round:number;price:number;rationale:string}[]){
 const frozen={delta:null};
 const attribution=data.cases.map(c=>{
  const s=simulate(data,worldOf(c,data,frozen),spark),b=simulate(data,worldOf(c,data,frozen),fixed);
  return {id:c.id,bids:c.bidsCents,sparkQuote:s.acceptedQuoteCents,baselineQuote:b.acceptedQuoteCents,sparkLastCounter:s.counterCents,baselineLastCounter:b.counterCents,focalSeatsDelta:s.focalCovers-b.focalCovers,poolSeatsDelta:s.poolCovers-b.poolCovers,focalCentsDelta:s.focalCents-b.focalCents,poolCentsDelta:s.poolCents-b.poolCents,sparkRefusal:s.refusal,baselineRefusal:b.refusal};
 });
 const sensitivity=Array.from({length:45},(_,delta)=>{
  const buyer={delta},s=totals(data,spark,buyer);assert.deepEqual(s.unmeasuredCases,[]);
  let best={step:-1,focalSeats:-1,focalCents:-1};
  for(let step=0;step<=17;step++){const t=totals(data,stepPolicy(step),buyer);if(t.focalSeats>best.focalSeats||(t.focalSeats===best.focalSeats&&t.focalCents>best.focalCents))best={step,focalSeats:t.focalSeats,focalCents:t.focalCents};}
  const f=totals(data,fixed,buyer),h=totals(data,input=>input.previousPriceCents,buyer);
  return {delta,spark:{focalSeats:s.focalSeats,focalCents:s.focalCents,poolSeats:s.poolSeats,poolCents:s.poolCents},fixed:{focalSeats:f.focalSeats,focalCents:f.focalCents,poolSeats:f.poolSeats,poolCents:f.poolCents},alwaysHold:{focalSeats:h.focalSeats,focalCents:h.focalCents},bestStepAfterTheFact:best};
 });
 const repeat=totals(data,spark,{delta:null,repeat:true});
 const replicates=results.filter(r=>r.round===1&&data.cases.find(c=>c.id===r.caseId)?.bidsCents.join()==='535'&&data.cases.find(c=>c.id===r.caseId)?.focalCovers===2);
 const accepted=replicates.filter(r=>r.price===535).length;
 const firstRoundHolds=results.filter(r=>r.round===1&&r.price===544);
 return {
  attribution,sensitivity,
  horizon:{oneBidModelCases:data.cases.filter(c=>c.bidsCents.length===1&&c.bidsCents[0]!==544&&c.focalCovers<=2).map(c=>c.id),repeatBidUnmeasuredCases:repeat.unmeasuredCases,repeatBidFixed:totals(data,fixed,{delta:null,repeat:true}),firstRoundProposals:results.filter(r=>r.round===1).length,firstRoundHolds:firstRoundHolds.length,holdRationalesCitingRemainingRounds:firstRoundHolds.filter(r=>/remaining/u.test(r.rationale)).length,finalRoundRationales:results.filter(r=>/final/iu.test(r.rationale)).map(r=>({caseId:r.caseId,round:r.round,price:r.price,rationale:r.rationale})),causalEffectOfPromptText:null},
  replicates:{input:'bid 535, previous 544, round 1, covers 2',proposals:replicates.map(r=>({caseId:r.caseId,price:r.price})),accepted,total:replicates.length,exactUpper95:accepted===0?Math.round((1-Math.pow(0.025,1/replicates.length))*1000)/1000:null},
  breakEvenCostCents:{focal:(6408-3244)/6,wholePool:(25992-17388)/16},
 };
}
async function main(){
 globalThis.fetch=async()=>{throw Error('HTTP forbidden during S6 replay');};
 const {data,spark,results,reproduced}=await loadAndGate();
 const report={provenance:'offline_replay_of_saved_s6_evidence',assurance:'Budget and repeat-bid buyers are assumptions, not measured behavior. Spark answers only from exactly matching recordings. S6 evidence is unchanged and stays the result of record.',newInferenceCalls:0,savedOutcomesReproduced:reproduced,...diagnose(data,spark,results)};
 const text=JSON.stringify(report,null,2)+'\n',path=join(OUTPUT,'replay.json');
 if(process.argv[2]==='--check'){assert.equal(await readFile(path,'utf8'),text,'Saved replay differs');console.log(JSON.stringify({replayCheckPassed:true,savedOutcomesReproduced:reproduced,newInferenceCalls:0}));return;}
 await mkdir(OUTPUT,{recursive:true});await writeFile(path,text,{flag:'wx'});
 console.log(JSON.stringify({savedOutcomesReproduced:reproduced,newInferenceCalls:0,output:path}));
}
if(isEntrypoint(import.meta.url))main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'S6 replay failed');process.exitCode=1;});
