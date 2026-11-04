import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import frozen from '../../docs/plans/backfill-proof/s6-cases.json';
import {parseCaseSet} from '../../scripts/verification/proof-s6-policy';
import * as live from '../../scripts/verification/proof-s6-live-contract';

const directories:string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function directory(){const d=await mkdtemp(join(tmpdir(),'s6-live-test-'));directories.push(d);return d;}
const data=parseCaseSet(frozen);
function scenario(id:string){const c=data.cases.find(c=>c.id===id);if(!c)throw Error('Missing frozen case');return c;}
const input={merchantName:'S6 synthetic cafe 03',listPriceCents:680,offerPriceCents:544,previousPriceCents:544,bidCents:500,covers:2,round:1,maxRounds:3,maxConcessionCents:17};
const reply=(price:number)=>new Response(JSON.stringify({id:'synthetic-test',choices:[{message:{content:JSON.stringify({priceCents:price,rationale:'Scripted test output'})}}],usage:{prompt_tokens:100,completion_tokens:20}}),{status:200,headers:{'x-request-id':'scripted-test'}});

it('derives 16 maximum requests and the documented conservative spend bound',()=>{
 expect(live.maximumRequests(data)).toBe(16);
 expect(live.S6_LIMITS).toMatchObject({maxRequests:16,maxCompletionTokens:1024,ceilingUsd:21.05,maximumCalculatedUsd:21.041152,retries:0});
});
it('validates adaptive public inputs and preserves the rejected hidden-floor round',()=>{
 const state=live.createRoundState(data,scenario('s6-12'));
 const first={...input,merchantName:'S6 synthetic cafe 12',bidCents:527};
 state.validate(first);state.advance(first,527);
 expect(()=>state.validate({...first,round:2,bidCents:535,previousPriceCents:527})).toThrow();
 state.validate({...first,round:2,bidCents:535});
 expect(()=>state.validate({...first,round:2,bidCents:535,floorPriceCents:535})).toThrow();
});
it('refuses model calls for immediate acceptance, over-cap and post-acceptance rounds',()=>{
 expect(()=>live.createRoundState(data,scenario('s6-01')).validate({...input,merchantName:'S6 synthetic cafe 01',bidCents:544})).toThrow();
 expect(()=>live.createRoundState(data,scenario('s6-10')).validate({...input,merchantName:'S6 synthetic cafe 10',bidCents:535,covers:3})).toThrow();
 const s=live.createRoundState(data,scenario('s6-02')),i={...input,merchantName:'S6 synthetic cafe 02',bidCents:535};
 s.validate(i);s.advance(i,535);expect(()=>s.validate({...i,round:2})).toThrow();
});
it('reserves a durable slot before dispatch and refuses reuse across policy instances',async()=>{
 const d=await directory();let calls=0;
 const upstream:typeof fetch=async(url,init)=>{calls++;expect(String(url)).toBe('https://api.meta.ai/v1/chat/completions');expect(init?.redirect).toBe('error');expect(JSON.parse(await readFile(join(d,'s6-03-round-1-dispatch.json'),'utf8')).consumed).toBe(true);return reply(527);};
 const session=live.createPricingSession({directory:d,upstream,verifySources:async()=>{},apiKey:'offline-dummy'});
 expect(await session.policy(data,scenario('s6-03'))(input)).toBe(527);
 const again=live.createPricingSession({directory:d,upstream,verifySources:async()=>{},apiKey:'offline-dummy'});
 await expect(again.policy(data,scenario('s6-03'))(input)).rejects.toThrow();
 expect(calls).toBe(1);
 expect((await readFile(join(d,'s6-03-round-1-http.json'),'utf8'))).not.toContain('offline-dummy');
});
it('records an HTTP failure without a retry and keeps invoice cost unknown',async()=>{
 const d=await directory();let calls=0;
 const session=live.createPricingSession({directory:d,upstream:async()=>{calls++;return new Response('{}',{status:429});},verifySources:async()=>{},apiKey:'offline-dummy'});
 expect(await session.policy(data,scenario('s6-03'))(input)).toBeNull();
 expect(calls).toBe(1);
 expect(session.records()).toMatchObject([{ok:false,httpStatus:429,invoiceCostUsd:null,estimatedCostUsd:null,tokensIn:null,tokensOut:null,tokensCachedIn:null,costNanoUsd:null,usageStatus:'unknown'}]);
});
it('preserves reported usage even when proposal content is malformed',async()=>{
 const d=await directory();
 const s=live.createPricingSession({directory:d,upstream:async()=>new Response(JSON.stringify({choices:[{message:{content:'invalid JSON'}}],usage:{prompt_tokens:100,completion_tokens:20}})),verifySources:async()=>{},apiKey:'offline-dummy'});
 expect(await s.policy(data,scenario('s6-03'))(input)).toBeNull();
 expect(s.records()).toMatchObject([{ok:false,tokensIn:100,tokensOut:20,costNanoUsd:210000,usageStatus:'reported',estimatedCostUsd:0.00021,invoiceCostUsd:null}]);
});
it('rejects a changed bid before dispatch and sends no private fixture fields',async()=>{
 const d=await directory();let calls=0;
 const session=live.createPricingSession({directory:d,upstream:async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));expect(body.model).toBe('muse-spark-1.3');expect(body.max_completion_tokens).toBe(1024);expect(JSON.stringify(body)).not.toMatch(/floor|capacity|backgroundParties|expectedBaseline/u);return reply(527);},verifySources:async()=>{},apiKey:'offline-dummy'});
 const policy=session.policy(data,scenario('s6-03'));
 await expect(policy({...input,bidCents:501})).rejects.toThrow();expect(calls).toBe(0);
 expect(await policy(input)).toBe(527);
});
it('keeps transport and malformed-output failures without another request',async()=>{
 for(const upstream of [async()=>{throw Error('offline failure');},async()=>new Response('{"choices":[]}')]){
  const d=await directory();let calls=0;
  const s=live.createPricingSession({directory:d,upstream:async()=>{calls++;return upstream();},verifySources:async()=>{},apiKey:'offline-dummy'});
  expect(await s.policy(data,scenario('s6-03'))(input)).toBeNull();expect(calls).toBe(1);expect(s.records()).toMatchObject([{ok:false,invoiceCostUsd:null,estimatedCostUsd:null}]);
  expect(JSON.parse(await readFile(join(d,'s6-03-round-1-dispatch.json'),'utf8')).consumed).toBe(true);
 }
});
it('stops before transport when pinned source verification fails',async()=>{
 let calls=0;const d=await directory();
 const s=live.createPricingSession({directory:d,upstream:async()=>{calls++;return reply(527);},verifySources:async()=>{throw Error('Source changed');},apiKey:'offline-dummy'});
 await expect(s.policy(data,scenario('s6-03'))(input)).rejects.toThrow('Source changed');expect(calls).toBe(0);
});
it('stops the session when a response exceeds documented token bounds',async()=>{
 const d=await directory();let calls=0;
 const s=live.createPricingSession({directory:d,upstream:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'{"priceCents":527,"rationale":"test"}'}}],usage:{prompt_tokens:100,completion_tokens:1025}}));},verifySources:async()=>{},apiKey:'offline-dummy'});
 await expect(s.policy(data,scenario('s6-03'))(input)).rejects.toThrow();
 await expect(s.policy(data,scenario('s6-02'))({...input,merchantName:'S6 synthetic cafe 02',bidCents:535})).rejects.toThrow();expect(calls).toBe(1);
});
it('blocks a response larger than 64 KiB and keeps its slot consumed',async()=>{
 const d=await directory();let calls=0;
 const s=live.createPricingSession({directory:d,upstream:async()=>{calls++;return new Response('x'.repeat(65537));},verifySources:async()=>{},apiKey:'offline-dummy'});
 expect(await s.policy(data,scenario('s6-03'))(input)).toBeNull();expect(calls).toBe(1);
 expect(JSON.parse(await readFile(join(d,'s6-03-round-1-failure.json'),'utf8')).consumed).toBe(true);
});
