import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import cases from '../../docs/plans/backfill-proof/s6b-cases.json';
import {POLICIES,decide,expandWorlds,parseS6bCases,simulate,type World} from '../../scripts/verification/proof-s6b-model';
import {evaluate,reportHtml} from '../../scripts/verification/proof-s6b';
import {Unmeasured,diagnose,loadAndGate,recordedPolicy} from '../../scripts/verification/proof-s6-replay';

const data=parseS6bCases(cases);
const world:World={id:'w',merchantName:'S6b synthetic test',listPriceCents:680,discountBps:2000,floorPriceCents:503,minPoolCovers:8,capacityCovers:8,backgroundParties:3,backgroundCovers:2,focalCovers:2,event:'normal',bids:[535],reservationCents:null};

it('keeps the frozen cases at their pre-results hash and expands every combination',async()=>{
 const freeze=JSON.parse(await readFile('docs/plans/backfill-proof/evidence/s6b-offline-2026-11-04/case-freeze.json','utf8'));
 expect(createHash('sha256').update(await readFile('docs/plans/backfill-proof/s6b-cases.json')).digest('hex')).toBe(freeze.sha256);
 const worlds=expandWorlds(data);
 expect(worlds).toHaveLength(750);expect(new Set(worlds.map(w=>w.id)).size).toBe(750);
 expect(data.aiArm).toBeNull();expect(data.liveAiAuthorized).toBe(false);
 expect(worlds.every(w=>w.merchantName.startsWith('S6b synthetic'))).toBe(true);
});
it('reads an explicit reservation: a walking buyer loses a counter that a taking buyer commits',()=>{
 expect(simulate(data,world,POLICIES.quarter_step)).toMatchObject({status:'countered',counterCents:540,submitted:false,focalCovers:0,poolCovers:0});
 expect(simulate(data,{...world,reservationCents:540},POLICIES.quarter_step)).toMatchObject({status:'countered',submitted:true,focalCovers:2,focalCents:1080,poolCovers:8,poolCents:4344});
 expect(simulate(data,{...world,reservationCents:539},POLICIES.quarter_step)).toMatchObject({submitted:false,focalCovers:0});
 expect(simulate(data,{...world,reservationCents:544},POLICIES.always_hold)).toMatchObject({status:'held',submitted:true,focalCents:1088});
});
it('keeps guards in charge of every policy',()=>{
 const low={...world,floorPriceCents:535,bids:[527]};
 expect(simulate(data,low,POLICIES.fixed_max)).toMatchObject({status:'held',counterCents:544,guardRejected:1,focalCovers:0});
 expect(simulate(data,{...world,focalCovers:3},POLICIES.fixed_max)).toMatchObject({refusal:'over_agent_cap',proposalCalls:0});
});
it('uses server pool state only in the diagnostic policy, and only when the focal party is pivotal',()=>{
 expect(simulate(data,world,POLICIES.pivotal_max_else_hold)).toMatchObject({status:'accepted',counterCents:535});
 expect(simulate(data,{...world,backgroundParties:4,capacityCovers:12},POLICIES.pivotal_max_else_hold)).toMatchObject({status:'held',counterCents:544});
 const publicOnly=data.policies.filter(p=>p.inputs==='public').map(p=>p.id);
 expect(publicOnly).not.toContain('pivotal_max_else_hold');expect(publicOnly).toHaveLength(6);
});
it('names a default candidate only when no slice is behind the comparator',()=>{
 const slice=(seats:number,margin:number)=>({worlds:1,focalDeals:1,focalSeats:seats,focalCents:0,poolSeats:seats,poolCents:0,proposalCalls:0,guardRejected:0,poolMarginCents:Object.fromEntries(data.costBpsOfOffer.map(c=>[c,margin])),focalPriceShareOfOffer:null,poolMarginSeatsPerWorld:{}});
 const others=(s:ReturnType<typeof slice>)=>Object.fromEntries(data.policies.map(p=>[p.id,{a:s}]));
 const even=others(slice(2,10));
 expect(decide(data,even).every(d=>d.defaultCandidate)).toBe(true);
 const behind=decide(data,{...even,always_hold:{a:slice(1,99)}}).find(d=>d.policy==='always_hold');
 expect(behind).toMatchObject({focalSeatsBehind:1,poolSeatsBehind:1,marginAhead:4,defaultCandidate:false});
});
it('evaluates deterministically and reports without assuming a winner',()=>{
 const first=evaluate(data),second=evaluate(data);
 expect(second).toEqual(first);expect(first.outcomes).toBe(5250);
 expect(first.byBuyer.fixed_max?.walk_one?.worlds).toBe(150);
 const html=reportHtml(data,first,'hash');
 expect(html).toContain('AI was not measured');expect(html).not.toMatch(/[\u2014]|https?:\/\/(?!www\.w3)/u);
});
it('reproduces all saved S6 outcomes and refuses to invent Spark on a changed input',async()=>{
 const {data:s6,spark,results,reproduced}=await loadAndGate();
 expect(reproduced).toBe(24);
 const report=diagnose(s6,spark,results);
 expect(report.attribution.reduce((n,r)=>n+r.focalSeatsDelta,0)).toBe(-6);
 expect(report.attribution.reduce((n,r)=>n+r.poolCentsDelta,0)).toBe(-8604);
 expect(report.replicates).toMatchObject({accepted:0,total:7});
 expect(report.horizon.repeatBidUnmeasuredCases).toEqual(['s6-02','s6-05','s6-06','s6-07','s6-08','s6-09','s6-11']);
 expect(report.horizon.causalEffectOfPromptText).toBeNull();
 expect(report.sensitivity[0]).toMatchObject({spark:{focalSeats:6,focalCents:3244},fixed:{focalSeats:12,focalCents:6408}});
 expect(()=>recordedPolicy(new Map())({merchantName:'x',listPriceCents:680,offerPriceCents:544,previousPriceCents:544,bidCents:535,covers:2,round:2,maxRounds:3,maxConcessionCents:17},{focalIsPivotal:false})).toThrow(Unmeasured);
});
