import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {z} from 'zod';
import {MerchantRule} from '../../src/domain/offers/schema';
import {settleRound} from '../../src/domain/negotiation/rules';
import {createMetaProvider,type LlmCallRecord} from '../../src/integrations/meta/provider';
import {costNanoUsd} from '../../src/integrations/meta/pricing';
import {MerchantProposal,proposalPrompt,sparkMerchant,type ProposalInput,type ProposeCounter} from '../../src/lib/negotiation/merchant-agent';
import type {CaseSet,PricingCase} from './proof-s6-policy';

export const S6_ENDPOINT='https://api.meta.ai/v1/chat/completions';
export const S6_APPROVAL='s6-pricing-2026-11-04-16-requests-usd21.05';
export const S6_LIMITS=Object.freeze({maxRequests:16,maxCompletionTokens:1024,contextTokens:1_048_576,ceilingUsd:21.05,maximumCalculatedUsd:21.041152,retries:0,timeoutMs:60_000,totalTimeoutMs:960_000,maxRequestBytes:8192,maxResponseBytes:65_536});
export const sha256=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
export async function syncDirectory(path:string){const directory=await open(path,'r');try{await directory.sync();}finally{await directory.close();}}
export async function durableJson(path:string,value:unknown){
 const file=await open(path,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
 await syncDirectory(dirname(path));
}
export function maximumRequests(data:CaseSet){
 return data.cases.reduce((sum,c)=>sum+(c.focalCovers>data.ruleDefaults.perAgentCapCovers?0:c.bidsCents.filter(b=>b<544).length),0);
}
const Proposal=z.strictObject({merchantName:z.string(),listPriceCents:z.int(),offerPriceCents:z.int(),previousPriceCents:z.int(),bidCents:z.int(),covers:z.int(),round:z.int(),maxRounds:z.int(),maxConcessionCents:z.int()});
const Usage=z.object({prompt_tokens:z.int().nonnegative().max(S6_LIMITS.contextTokens),completion_tokens:z.int().nonnegative().max(S6_LIMITS.maxCompletionTokens),prompt_tokens_details:z.object({cached_tokens:z.int().nonnegative().optional()}).nullish()}).refine(u=>(u.prompt_tokens_details?.cached_tokens??0)<=u.prompt_tokens);
export function createRoundState(data:CaseSet,c:PricingCase){
 let round=1,previousPriceCents=544,accepted=false;
 const d=data.ruleDefaults;
 const rule=MerchantRule.parse({id:'00000000-0000-4000-8000-000000000001',merchantId:'00000000-0000-4000-8000-000000000002',termsVersion:1,listPriceCents:d.listPriceCents,capacityCovers:c.serverFixture.capacityCovers,terms:{window:{weekday:d.weekday,startMinute:d.startMinute,endMinute:d.endMinute,commitByMinute:d.commitByMinute},discountBps:d.discountBps,minPoolCovers:c.serverFixture.minPoolCovers,perAgentCapCovers:d.perAgentCapCovers,floorPriceCents:c.serverFixture.floorPriceCents}});
 function validate(input:unknown){
  const i=Proposal.parse(input),bid=c.bidsCents[round-1];
  assert(!accepted&&c.focalCovers<=d.perAgentCapCovers&&bid!==undefined&&bid<previousPriceCents,'Model request not needed for this round');
  assert.deepEqual(i,{merchantName:c.merchantName,listPriceCents:680,offerPriceCents:544,previousPriceCents,bidCents:bid,covers:c.focalCovers,round,maxRounds:3,maxConcessionCents:17},'Changed public round inputs');
 }
 return {validate,advance(input:ProposalInput,price:number|null){
  validate(input);
  const outcome=settleRound({rule,round,previousPriceCents,bidCents:input.bidCents},price);
  assert(outcome.counterCents!==undefined);previousPriceCents=outcome.counterCents;
  accepted=outcome.status==='accepted';round++;
 }};
}
function requestBody(input:ProposalInput){
 const schema=z.toJSONSchema(MerchantProposal,{target:'draft-2020-12'});delete schema.$schema;
 return {model:'muse-spark-1.3',messages:[{role:'system',content:'You are the pricing agent of a small Singapore food and drink merchant on Backfill. Reply only with JSON matching the schema.'},{role:'user',content:proposalPrompt(input)}],max_completion_tokens:1024,reasoning_effort:'low',response_format:{type:'json_schema',json_schema:{name:'MerchantProposal',schema,strict:true}}};
}
type RecordedCall=Omit<LlmCallRecord,'tokensIn'|'tokensCachedIn'|'tokensOut'|'costNanoUsd'>&{tokensIn:number|null;tokensCachedIn:number|null;tokensOut:number|null;costNanoUsd:number|null;usageStatus:'reported'|'unknown';caseId:string;round:number;inputSha256:string;invoiceCostUsd:null;estimatedCostUsd:number|null};
export function createPricingSession(options:{directory:string;upstream:typeof fetch;verifySources:()=>Promise<void>;apiKey:string}){
 let reserved=0,dispatched=0,fatal:unknown=null;
 const started=performance.now(),records:RecordedCall[]=[];
 return {records:()=>[...records],dispatched:()=>dispatched,policy(data:CaseSet,c:PricingCase):ProposeCounter{
  const state=createRoundState(data,c);
  return async input=>{
   if(fatal)throw fatal;
   state.validate(input);await options.verifySources();
   assert(reserved<S6_LIMITS.maxRequests,'Request ceiling reached');
   assert(performance.now()-started<S6_LIMITS.totalTimeoutMs,'Session time limit reached');
   const id=`${c.id}-round-${input.round}`,inputSha256=sha256(JSON.stringify(input));
   let reportedUsage:z.infer<typeof Usage>|null=null;
   const protectedFetch:typeof fetch=async(url,init)=>{
    try{
     assert.equal(String(url),S6_ENDPOINT);assert.equal(init?.method,'POST');assert(typeof init.body==='string');
     assert(Buffer.byteLength(init.body)<S6_LIMITS.maxRequestBytes);assert.deepEqual(JSON.parse(init.body),requestBody(input));
     reserved++;
     await durableJson(join(options.directory,id+'-dispatch.json'),{caseId:c.id,round:input.round,consumed:true,endpoint:S6_ENDPOINT,input,inputSha256,requestBody:JSON.parse(init.body),bodySha256:sha256(init.body),startedAt:new Date().toISOString(),limits:S6_LIMITS});
    }catch(error){fatal=error;throw error;}
    const t=performance.now();
    dispatched++;
    try{
     const response=await options.upstream(S6_ENDPOINT,{...init,redirect:'error'});
     const chunks:Uint8Array[]=[];let bytes=0;const reader=response.body?.getReader();
     if(reader)try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>S6_LIMITS.maxResponseBytes){await reader.cancel();throw Error('Response size limit');}chunks.push(next.value);}}finally{reader.releaseLock();}
     const body=Buffer.concat(chunks).toString('utf8');
     await durableJson(join(options.directory,id+'-http.json'),{status:response.status,requestId:response.headers.get('x-request-id'),providerRoundTripMs:performance.now()-t,body,invoiceCostUsd:null,consumed:true});
     let parsed:unknown;try{parsed=JSON.parse(body);}catch{parsed=null;}
     if(parsed!==null&&typeof parsed==='object'&&'usage' in parsed&&parsed.usage!==null){
      try{reportedUsage=Usage.parse(parsed.usage);}catch(error){fatal=error;throw error;}
     }
     return new Response(body,{status:response.status,headers:{'content-type':'application/json'}});
    }catch(error){
     await durableJson(join(options.directory,id+'-failure.json'),{transportOrResponseFailed:true,errorName:error instanceof Error?error.name:'Error',latencyMs:performance.now()-t,invoiceCostUsd:null,consumed:true}).catch(e=>{fatal=e;});
     throw Error('s6_transport_or_response_failed_no_retry');
    }
   };
   const provider=createMetaProvider({baseUrl:'https://api.meta.ai/v1',apiKey:options.apiKey,fetch:protectedFetch,maxAttempts:1,timeoutMs:Math.max(1,Math.min(S6_LIMITS.timeoutMs,S6_LIMITS.totalTimeoutMs-(performance.now()-started))),record:async record=>{
    const usage=reportedUsage?{tokensIn:reportedUsage.prompt_tokens,tokensCachedIn:reportedUsage.prompt_tokens_details?.cached_tokens??0,tokensOut:reportedUsage.completion_tokens}:null;
    const cost=usage?costNanoUsd('muse-spark-1.3',usage):null;
    const row:RecordedCall={...record,tokensIn:usage?.tokensIn??null,tokensCachedIn:usage?.tokensCachedIn??null,tokensOut:usage?.tokensOut??null,costNanoUsd:cost,usageStatus:usage?'reported':'unknown',caseId:c.id,round:input.round,inputSha256,invoiceCostUsd:null,estimatedCostUsd:cost===null?null:cost/1e9};
    records.push(row);try{await durableJson(join(options.directory,id+'-result.json'),row);}catch(error){fatal=error;throw error;}
   }});
   const price=await sparkMerchant(provider,'muse-spark-1.3')(input);
   if(fatal)throw fatal;
   state.advance(input,price);return price;
  };
 }};
}
