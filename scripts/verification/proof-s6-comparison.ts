import assert from 'node:assert/strict';
import type {Db} from '../../src/lib/db/client';
import {runPricingCase} from './proof-s6-offline';
import {fixedConcession,summarizePricing,type CaseSet} from './proof-s6-policy';
import type {createPricingSession} from './proof-s6-live-contract';

export async function comparePricing(args:{data:CaseSet;baseline:{db:Db;admin:Db};model:{db:Db;admin:Db};session:ReturnType<typeof createPricingSession>;provenance:'live_meta'|'scripted_offline_transport';save:(id:string,value:unknown)=>Promise<void>}){
 assert.notEqual(args.baseline.db,args.model.db,'Policies require independent databases');
 const rows=[];
 for(const c of args.data.cases){
  const baseline=await runPricingCase(args.baseline.db,args.baseline.admin,args.data,c,async i=>fixedConcession(i));
  for(const [key,expected] of Object.entries(c.expectedBaseline))assert.deepEqual(Reflect.get(baseline,key),expected,`Frozen baseline mismatch: ${c.id}/${key}`);
  const outcome=await runPricingCase(args.model.db,args.model.admin,args.data,c,args.session.policy(args.data,c));
  const requests=args.session.records().filter(r=>r.caseId===c.id);
  const model={...outcome,provenance:args.provenance,ai:{status:requests.length===0?'no_proposal_needed':args.provenance==='live_meta'?'live_attempt_recorded':'scripted_offline_transport',invoiceCostUsd:null,requests}};
  const row={id:c.id,description:c.description,baseline,model};rows.push(row);await args.save(c.id,row);
 }
 const fixed=summarizePricing(rows.map(r=>r.baseline)),model=summarizePricing(rows.map(r=>r.model));
 const metrics=(s:typeof fixed)=>({cases:s.cases,focalConfirmedCases:s.focalConfirmedCases,focalConfirmedCovers:s.focalConfirmedCovers,focalChargedCents:s.focalChargedCents,pooledCovers:s.pooledCovers,soloCovers:s.soloCovers,poolChargedCents:s.poolChargedCents,poolSavingsCents:s.poolSavingsCents,guardRejectedProposals:s.guardRejectedProposals});
 const calls=args.session.records(),live=args.provenance==='live_meta';
 const summary={provenance:args.provenance,assurance:'Twelve synthetic worlds; scripted approvals, actual local services/DB settlement. Solo is a clearing-engine counterfactual. No real customers, payments, attendance or revenue. No general model ranking.',casesEvaluated:rows.length,casesWithSuccessfulProposal:calls.length?new Set(calls.filter(c=>c.ok).map(c=>c.caseId)).size:0,newInferenceCalls:live?args.session.dispatched():0,scriptedTransportCalls:live?0:args.session.dispatched(),successfulProposalRequests:calls.filter(c=>c.ok).length,failedProposalRequests:calls.filter(c=>!c.ok).length,baseline:metrics(fixed),model:metrics(model),focalCoverDelta:model.focalConfirmedCovers-fixed.focalConfirmedCovers,focalChargedCentsDelta:model.focalChargedCents-fixed.focalChargedCents,invoiceCostUsd:null,estimatedProviderCostUsd:live&&calls.every(c=>c.estimatedCostUsd!==null)?calls.reduce((n,c)=>n+(c.estimatedCostUsd??0),0):null,guardedAttemptLatenciesMs:live?calls.map(c=>({caseId:c.caseId,round:c.round,latencyMs:c.latencyMs,ok:c.ok})):null};
 return {summary,rows};
}
