import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import postgres from 'postgres';
import {and,eq} from 'drizzle-orm';
import {createTestDatabase} from '../../tests/support/db';
import {connectDb,type Db} from '../../src/lib/db/client';
import {rules,commitments,clearingFills,clearings,ledger,negotiations,negotiationRounds} from '../../src/lib/db/schema';
import {mintMerchant} from '../../src/lib/onboarding/links';
import {mintAgent} from '../../src/lib/agents/tokens';
import {negotiate} from '../../src/lib/negotiation/service';
import {type ProposalInput,type ProposeCounter} from '../../src/lib/negotiation/merchant-agent';
import {submitCommitment,settleDue,toRule,toCommitment} from '../../src/lib/commitments/service';
import {soloVsPooled} from '../../src/domain/demo/scene';
import type {TrailTerms} from '../../src/lib/demo/trail';
import {storeScriptedTrail} from '../../tests/support/proof-s2';
import {isEntrypoint} from '../../src/lib/entrypoint';
import {fixedConcession,parseCaseSet,summarizePricing,type CaseSet,type PricingCase} from './proof-s6-policy';

const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const publicKeys=['merchantName','listPriceCents','offerPriceCents','previousPriceCents','bidCents','covers','round','maxRounds','maxConcessionCents'].sort();
export async function runPricingCase(db:Db,admin:Db,data:CaseSet,c:PricingCase,policy:ProposeCounter){
 const owner=await mintMerchant(admin,c.merchantName),runId=randomUUID();
 const [created]=await admin.insert(rules).values({merchantId:owner.id,...data.ruleDefaults,...c.serverFixture}).returning();assert(created);
 let now=new Date(data.referenceClock);const clock=()=>new Date(now);
 const approvals:{source:'scripted_local_demo';terms:TrailTerms;approvedAt:string;observedTermsVersion:number}[]=[];const submissions=[];
 for(let i=0;i<c.backgroundParties;i++){
  const party=await mintAgent(admin,`${c.id}-background-${i}`,'SCRIPTED S6 background party');now=new Date(Date.parse(data.referenceClock)+i*1000);
  const terms={runId,partyId:party.id,ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:2,pricePerCoverCents:544,totalCents:1088};
  approvals.push({source:'scripted_local_demo',terms,approvedAt:now.toISOString(),observedTermsVersion:1});
  const submitted=await submitCommitment(db,party.id,{ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:2,maxPricePerCoverCents:544,idempotencyKey:`${c.id}-bg-${i}`},clock);assert(submitted.ok);
  await storeScriptedTrail(admin,terms,submitted.commitment.commitmentId,now);
  submissions.push({partyId:party.id,result:submitted});
 }
 const focal=await mintAgent(admin,`${c.id}-focal`,'SCRIPTED S6 focal party');now=new Date(data.focalClock);
 const secret=randomBytes(32).toString('hex'),inputs:{input:ProposalInput;sha256:string;proposal:number|null;localCallbackMs:number}[]=[];
 const focalEvents:{event:string;testClock:string;termsVersion?:number}[]=[];
 let quote:Awaited<ReturnType<typeof negotiate>>|null=null,acceptedQuoteCents:number|null=null,refusal:string|null=null;
 const propose:ProposeCounter=async input=>{assert.deepEqual(Object.keys(input).sort(),publicKeys);const t=performance.now();const proposal=await policy(input);inputs.push({input,sha256:sha(JSON.stringify(input)),proposal,localCallbackMs:performance.now()-t});return proposal;};
 for(const bid of c.bidsCents){
  quote=await negotiate(db,{secret,propose,clock},focal.id,{ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:c.focalCovers,bidCents:bid});
  if(!quote.ok){refusal=quote.reason;break;}
  if(quote.negotiation.status==='accepted'){acceptedQuoteCents=quote.negotiation.merchantPriceCents;focalEvents.push({event:'quote_accepted',testClock:now.toISOString(),termsVersion:1});break;}
 }
 const applyEvent=async()=>{
  if(c.event==='change_terms'){await admin.update(rules).set({discountBps:1500}).where(eq(rules.id,created.id));focalEvents.push({event:'terms_changed',testClock:now.toISOString(),termsVersion:2});}
  if(c.event==='past_deadline'){now=new Date(data.settlementClock);focalEvents.push({event:'deadline_passed',testClock:now.toISOString()});}
 };
 let focalCommitmentId:string|null=null;
 if(quote?.ok&&acceptedQuoteCents!==null){
  const terms={runId,partyId:focal.id,ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:c.focalCovers,pricePerCoverCents:acceptedQuoteCents,totalCents:c.focalCovers*acceptedQuoteCents};
  const [versionAtApproval]=await db.select({value:rules.termsVersion}).from(rules).where(eq(rules.id,created.id));assert(versionAtApproval);
  approvals.push({source:'scripted_local_demo',terms,approvedAt:now.toISOString(),observedTermsVersion:versionAtApproval.value});
  focalEvents.push({event:'scripted_approval',testClock:now.toISOString(),termsVersion:versionAtApproval.value});
  await applyEvent();
  const submitted=await submitCommitment(db,focal.id,{ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:c.focalCovers,maxPricePerCoverCents:acceptedQuoteCents,idempotencyKey:`${c.id}-focal`,counterOffer:quote.negotiation.counterOffer},clock,secret);
  submissions.push({partyId:focal.id,result:submitted});
  if(submitted.ok){
   focalCommitmentId=submitted.commitment.commitmentId;
   await storeScriptedTrail(admin,terms,focalCommitmentId,now);
   const duplicate=await submitCommitment(db,focal.id,{ruleId:created.id,termsVersion:1,visitDate:data.visitDate,covers:c.focalCovers,maxPricePerCoverCents:acceptedQuoteCents,idempotencyKey:`${c.id}-focal`,counterOffer:quote.negotiation.counterOffer},clock,secret);assert(duplicate.ok&&duplicate.replayed);assert.equal(duplicate.commitment.commitmentId,focalCommitmentId);
  }else refusal=submitted.reason;
  focalEvents.push({event:submitted.ok?'submitted':'submission_refused',testClock:now.toISOString()});
 }else await applyEvent();
 const before=await db.select().from(commitments).where(eq(commitments.ruleId,created.id));
 await settleDue(db,owner.id,()=>new Date(data.settlementClock));await settleDue(db,owner.id,()=>new Date(data.settlementClock));focalEvents.push({event:'settled',testClock:data.settlementClock});
 const [finalRule]=await db.select().from(rules).where(eq(rules.id,created.id));assert(finalRule);
 const stored=await db.select().from(commitments).where(eq(commitments.ruleId,created.id));assert.equal(before.length,stored.length);
 const fills=await db.select().from(clearingFills).where(eq(clearingFills.ruleId,created.id));
 const clearing=await db.select().from(clearings).where(eq(clearings.ruleId,created.id));
 const entries=await db.select().from(ledger).where(eq(ledger.ruleId,created.id));
 const [negotiation]=await db.select().from(negotiations).where(and(eq(negotiations.ruleId,created.id),eq(negotiations.agentId,focal.id)));
 const rounds=negotiation?await db.select().from(negotiationRounds).where(eq(negotiationRounds.negotiationId,negotiation.id)):[];
 const comparison=soloVsPooled(toRule(finalRule),data.visitDate,stored.map(toCommitment));
 const normalize=(rows:readonly {commitmentId:string;covers:number;pricePerCoverCents:number}[])=>rows.map(r=>({commitmentId:r.commitmentId,covers:r.covers,pricePerCoverCents:r.pricePerCoverCents})).sort((a,b)=>a.commitmentId.localeCompare(b.commitmentId));
 assert.deepEqual(normalize(fills),normalize(comparison.pooled.fills));
 for(const fill of fills){const commitment=stored.find(s=>s.id===fill.commitmentId);assert(commitment);assert(fill.pricePerCoverCents>=finalRule.floorPriceCents);assert(fill.pricePerCoverCents<=commitment.maxPricePerCoverCents);assert.equal(commitment.termsVersion,finalRule.termsVersion);}
 const pooledCovers=fills.reduce((n,f)=>n+f.covers,0),soloCovers=comparison.solo.reduce((n,s)=>n+(s.unlocked?(stored.find(c=>c.id===s.commitmentId)?.covers??0):0),0);
 const chargedCents=fills.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0),savingsCents=fills.reduce((n,f)=>n+f.covers*(finalRule.listPriceCents-f.pricePerCoverCents),0);
 assert.equal(entries.reduce((n,e)=>n+e.covers,0),pooledCovers);assert.equal(entries.reduce((n,e)=>n+e.covers*e.pricePerCoverCents,0),chargedCents);assert.equal(entries.reduce((n,e)=>n+e.savingsCents,0),savingsCents);
 const focalFills=fills.filter(f=>f.commitmentId===focalCommitmentId);
 return {id:c.id,description:c.description,acceptedQuoteCents,proposalCallbacks:inputs.length,pooledCovers,soloCovers,focalConfirmedCovers:focalFills.reduce((n,f)=>n+f.covers,0),chargedCents,savingsCents,focalChargedCents:focalFills.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0),guardRejectedProposals:rounds.filter(r=>r.proposalVerdict!==null&&r.proposalVerdict!=='ok').length,refusal,inputs,rounds,approvals,focalEvents,submissions,storedCommitments:stored,storedClearing:clearing,storedFills:fills,ledgerEntries:entries,soloCounterfactual:comparison.solo,ai:{status:'unmeasured',reason:'No matching recorded merchant-proposal outputs admitted; no new inference authorized.',costUsd:null,providerLatencyMs:null}};
}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]??c);
async function main(){
 const configured=new URL(process.env.TEST_DATABASE_URL??'http://missing.invalid');assert.deepEqual([configured.protocol,configured.hostname,configured.port,configured.pathname],['postgres:','127.0.0.1','5432','/postgres']);
 globalThis.fetch=async()=>{throw Error('Network forbidden during S6 offline evaluation');};
 const owned=resolve('docs/plans/backfill-proof/evidence/s6-local-2026-11-04'),output=resolve(process.env.S6_OUTPUT_DIR??join(owned,'run-01'));assert(output.startsWith(owned+'/'));
 const bytes=await readFile('docs/plans/backfill-proof/s6-cases.json'),freeze=JSON.parse(await readFile(join(owned,'case-freeze.json'),'utf8'));assert.equal(sha(bytes),freeze.sha256);const data=parseCaseSet(JSON.parse(bytes.toString('utf8')));
 await mkdir(output);
 const implementationFiles=['scripts/verification/proof-s6-offline.ts','scripts/verification/proof-s6-policy.ts','docs/plans/backfill-proof/s6-cases.json','src/lib/negotiation/service.ts','src/lib/negotiation/merchant-agent.ts','src/domain/negotiation/rules.ts','src/domain/negotiation/counter-offer.ts','src/lib/commitments/service.ts','src/domain/commitments/occurrence.ts','src/domain/commitments/schema.ts','src/domain/offers/evaluate.ts','src/domain/offers/schema.ts','src/domain/clearing/clear.ts','src/domain/clearing/schema.ts','src/domain/demo/scene.ts','src/domain/money.ts','src/domain/singapore-time.ts','src/lib/db/schema.ts','src/lib/db/client.ts','src/lib/db/migrate.ts','src/lib/onboarding/links.ts','src/lib/agents/tokens.ts','src/lib/demo/trail.ts','src/env.ts','tests/support/db.ts','tests/support/proof-s2.ts','package.json','package-lock.json','drizzle/meta/_journal.json',...(await readdir('drizzle')).filter(n=>n.endsWith('.sql')).map(n=>'drizzle/'+n)].sort();
 const implementation=await Promise.all(implementationFiles.map(async path=>({path,sha256:sha(await readFile(path))})));
 await writeFile(join(output,'source-manifest.json'),JSON.stringify({node:process.version,files:implementation},null,2)+'\n',{flag:'wx'});
 let database:Awaited<ReturnType<typeof createTestDatabase>>|undefined,app:ReturnType<typeof connectDb>|undefined,roleCreated=false;const role='backfill_t_s6_'+randomBytes(4).toString('hex');
 try{
  database=await createTestDatabase('proof_s6');await database.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);roleCreated=true;const url=new URL(database.url);url.username=role;app=connectDb(url.toString(),4);
  const rows=[];
  for(const c of data.cases){const row=await runPricingCase(app.db,database.db,data,c,async input=>fixedConcession(input));for(const [key,value]of Object.entries(c.expectedBaseline))assert.deepEqual(Reflect.get(row,key),value,`Frozen expected outcome mismatch in ${c.id}: ${key}`);rows.push(row);await writeFile(join(output,c.id+'.json'),JSON.stringify(row,null,2)+'\n',{flag:'wx'});}
  const summary=summarizePricing(rows);
  await writeFile(join(output,'summary.json'),JSON.stringify({assurance:'Twelve frozen synthetic case worlds. Fixed deterministic pricing policy only. Scripted party approvals; actual restricted-role services/DB settlement; solo is a clearing-engine counterfactual. No AI results, human customer consent, real payments or revenue.',caseFileSha256:freeze.sha256,...summary,newInferenceCalls:0,baselineProviderCostUsd:0,baselineCostMeaning:'No provider used. This is not cost per customer or historical model spending.',maxProspectiveAiRequests:16,prospectiveModel:'muse-spark-1.3',aiInferenceAuthorized:false,providerLatencyMs:null},null,2)+'\n',{flag:'wx'});
  const table=rows.map(r=>`<tr><th scope="row">${esc(r.id)}<small>${esc(r.description)}</small></th><td>${r.acceptedQuoteCents===null?'No agreement':(r.acceptedQuoteCents/100).toFixed(2)}</td><td>${r.focalConfirmedCovers}</td><td>${r.pooledCovers}</td><td>${r.soloCovers}</td><td>${r.guardRejectedProposals}</td><td>${esc(r.refusal??'None')}</td><td>Unmeasured</td><td><a href="${r.id}.json">Record</a></td></tr>`).join('');
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S6 offline pricing and pooling evidence</title><style>body{font:16px system-ui;margin:24px;background:#fffdf7;color:#20251f}main{max-width:1200px;margin:auto}h1{font-size:28px}p{line-height:1.6;max-width:85ch}.metric{font-size:32px;font-weight:600}small{display:block;font-weight:400;max-width:30ch}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ccc}thead{background:#ece9df}.scroll{overflow:auto}code{overflow-wrap:anywhere}</style><main><h1>S6: pooling is measured; AI pricing is still unmeasured</h1><p>Twelve frozen synthetic worlds, visit date ${data.visitDate}. Real local service/database settlement under a fixed maximum-concession policy. Independent parties' exact approvals are scripted test fixtures. The separate outcome uses the same stored commitments and clearing engine, one party at a time.</p><p class="metric">${summary.pooledCovers} pooled covers / ${summary.soloCovers} alone</p><p>This sum across twelve synthetic worlds is not a demand forecast. The pricing-policy focal party confirmed ${summary.focalConfirmedCovers} covers across ${summary.focalConfirmedCases}/${summary.cases} cases. Background parties are excluded from that focal metric.</p><p>AI measured cases: 0/${summary.cases}. No comparison, winner or AI-superiority claim is supported. New inference calls: 0. Costs and provider latency for unmeasured AI remain unavailable. No small-sample p95 is reported.</p><div class="scroll"><table><caption>Case-level fixed-policy outcomes. Prices are SGD per cover; cover counts come from stored fills. AI is not measured.</caption><thead><tr><th>Case</th><th>Agreed quote SGD</th><th>Focal confirmed covers</th><th>Pooled covers</th><th>Alone covers</th><th>Rejected proposals</th><th>Submission/precheck refusal</th><th>AI pricing</th><th>Evidence</th></tr></thead><tbody>${table}</tbody></table></div><p>Hypothetical amounts across all pooled fills: SGD ${(summary.poolChargedCents/100).toFixed(2)} accepted total and SGD ${(summary.poolSavingsCents/100).toFixed(2)} buyer savings. No money was collected and no attendance or revenue is established. Focal-party accepted total is separately SGD ${(summary.focalChargedCents/100).toFixed(2)}.</p><p>Frozen case hash: <code>${freeze.sha256}</code>. <a href="summary.json">Aggregates</a>. All twelve cases are retained, including no-deal, guard-refused, insufficient-pool and capacity outcomes.</p></main></html>`;
  await writeFile(join(output,'report.html'),html,{flag:'wx'});
  assert.equal(sha(await readFile('docs/plans/backfill-proof/s6-cases.json')),freeze.sha256);
  for(const entry of implementation)assert.equal(sha(await readFile(entry.path)),entry.sha256,'Implementation changed during run');
  console.log(JSON.stringify({cases:summary.cases,pooledCovers:summary.pooledCovers,soloCovers:summary.soloCovers,aiMeasuredCases:0,newInferenceCalls:0,report:join(output,'report.html')}));
 }finally{
  await app?.close();await database?.drop();const admin=postgres(configured.toString(),{max:1,onnotice:()=>{}});
  try{if(roleCreated)await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);const roles=await admin`select rolname from pg_roles where rolname=${role}`;const dbs=database?await admin`select datname from pg_database where datname=${new URL(database.url).pathname.slice(1)}`:[];assert.equal(roles.length,0);assert.equal(dbs.length,0);await writeFile(join(output,'cleanup.json'),JSON.stringify({ownedRoleRemaining:roles.length,ownedDatabaseRemaining:dbs.length,newInferenceCalls:0,productionChanges:false},null,2)+'\n',{flag:'wx'});}finally{await admin.end({timeout:5});}
 }
}
if(isEntrypoint(import.meta.url))main().catch(()=>{console.error('S6 offline evaluation failed; inspect its retained local receipts. No inference was permitted.');process.exitCode=1;});
