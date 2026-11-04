import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import frozen from '../../docs/plans/backfill-proof/s6-cases.json';
import {parseCaseSet} from '../../scripts/verification/proof-s6-policy';
import {createPricingSession} from '../../scripts/verification/proof-s6-live-contract';
import * as comparison from '../../scripts/verification/proof-s6-comparison';
import {createTestDatabase} from '../support/db';

it('compares identical worlds in separate databases and labels scripted transport honestly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'s6-comparison-'));
 const baseline=await createTestDatabase('s6_comparison_fixed');let model:Awaited<ReturnType<typeof createTestDatabase>>|undefined;
 let requests=0;
 try{
  model=await createTestDatabase('s6_comparison_model');expect(model.url).not.toBe(baseline.url);
  const data=parseCaseSet(frozen);
  const session=createPricingSession({directory:dir,apiKey:'offline-dummy',verifySources:async()=>{},upstream:async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:'{"priceCents":544,"rationale":"Scripted holding policy for offline test"}'}}],usage:{prompt_tokens:100,completion_tokens:20}}));}});
  const result=await comparison.comparePricing({data,baseline:{db:baseline.db,admin:baseline.db},model:{db:model.db,admin:model.db},session,provenance:'scripted_offline_transport',save:async()=>{}});
  expect(requests).toBe(16);
  expect(result.summary).toMatchObject({provenance:'scripted_offline_transport',newInferenceCalls:0,scriptedTransportCalls:16,baseline:{focalConfirmedCovers:12,pooledCovers:48,soloCovers:2},model:{focalConfirmedCovers:2,pooledCovers:16,soloCovers:0},focalCoverDelta:-10,invoiceCostUsd:null,estimatedProviderCostUsd:null});
  expect(result.rows).toHaveLength(12);
  expect(result.rows.find(r=>r.id==='s6-01')?.model.ai.status).toBe('no_proposal_needed');
  expect(result.rows.find(r=>r.id==='s6-08')?.baseline.focalEvents.map(e=>e.event)).toEqual(['quote_accepted','scripted_approval','terms_changed','submission_refused','settled']);
  expect(result.rows.every(r=>r.model.provenance==='scripted_offline_transport')).toBe(true);
 }finally{await baseline.drop();await model?.drop();await rm(dir,{recursive:true,force:true});}
});
