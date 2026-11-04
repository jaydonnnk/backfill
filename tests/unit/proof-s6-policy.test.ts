import {expect,it} from 'vitest';
import {fixedConcession, summarizePricing, parseCaseSet} from '../../scripts/verification/proof-s6-policy';
import cases from '../../docs/plans/backfill-proof/s6-cases.json';
it('freezes twelve cases and a valid, public-input-only fixed policy',()=>{
 const data=parseCaseSet(cases);expect(data.cases).toHaveLength(12);
 const input={merchantName:'Synthetic',listPriceCents:680,offerPriceCents:544,previousPriceCents:544,bidCents:500,covers:2,round:1,maxRounds:3,maxConcessionCents:17};
 expect(fixedConcession(input)).toBe(527);expect(fixedConcession({...input,bidCents:535})).toBe(535);expect(fixedConcession({...input,previousPriceCents:527,bidCents:520})).toBe(520);
 expect(input).not.toHaveProperty('floorPriceCents');
});
it('keeps unmeasured AI metrics unavailable and reconciles literal focal/pool denominators',()=>{
 const row={id:'s6-01',pooledCovers:8,soloCovers:0,focalConfirmedCovers:2,chargedCents:4352,savingsCents:1088,focalChargedCents:1088,proposalCallbacks:0,guardRejectedProposals:0};
 expect(summarizePricing([row])).toMatchObject({cases:1,pooledCovers:8,soloCovers:0,incrementalSyntheticCovers:8,focalConfirmedCases:1,focalConfirmedCovers:2,poolChargedCents:4352,poolSavingsCents:1088,focalChargedCents:1088,ai:{measuredCases:0,confirmedCovers:null,costUsd:null,latencyMs:null,winner:null}});
});
it('rejects duplicate cases or a mutated case count',()=>{
 expect(()=>parseCaseSet({...cases,cases:cases.cases.slice(1)})).toThrow();
 expect(()=>parseCaseSet({...cases,cases:cases.cases.map((c,i)=>i?c:cases.cases[1])})).toThrow();
});
