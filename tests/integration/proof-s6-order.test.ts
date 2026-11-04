import {expect,it} from 'vitest';
import {createTestDatabase} from '../support/db';
import {runPricingCase} from '../../scripts/verification/proof-s6-offline';
import {parseCaseSet,fixedConcession} from '../../scripts/verification/proof-s6-policy';
import frozen from '../../docs/plans/backfill-proof/s6-cases.json';
it('records an exact v1 approval while v1 is current, then changes terms and refuses stale submission',async()=>{
 const t=await createTestDatabase('proof_s6_order');
 try{
  const cases=parseCaseSet(frozen),scenario=cases.cases.find(c=>c.id==='s6-08');if(!scenario)throw Error('Missing frozen case');
  const result=await runPricingCase(t.db,t.db,cases,scenario,async input=>fixedConcession(input));
  expect(result.approvals.at(-1)?.terms.termsVersion).toBe(1);
  expect(result.approvals.at(-1)?.observedTermsVersion).toBe(1);
  expect(result.focalEvents.map(e=>e.event)).toEqual(['quote_accepted','scripted_approval','terms_changed','submission_refused','settled']);
  expect(result.refusal).toBe('stale_terms');expect(result.focalConfirmedCovers).toBe(0);expect(result.pooledCovers).toBe(0);
 }finally{await t.drop();}
});
