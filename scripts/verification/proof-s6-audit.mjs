import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Reads saved evidence only. This command never loads credentials or sends requests.
globalThis.fetch=async()=>{throw Error('HTTP forbidden during S6 evidence audit');};
const root='docs/plans/backfill-proof',output=join(root,'evidence/s6-live-authorized-2026-11-04-01');
const prep=join(root,'evidence/s6-live-preparation-2026-11-04');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const manifestPin='12a04aaf6a18dc851d79fb14775a11c604074d22997f01c4f1518c8304d15377';
const casePin='5b148931137ad9b5072e05adf24fb564117763c70855a34ec80a79701b4c4e7c';
const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
const cents=n=>(n/100).toFixed(2);
const esc=s=>String(s).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--check'));
const sourceBytes=await readFile(join(prep,'source-manifest.json'));assert.equal(sha(sourceBytes),manifestPin);
for(const f of JSON.parse(sourceBytes).files)assert.equal(sha(await readFile(f.path)),f.sha256,`Pinned source changed: ${f.path}`);
const caseBytes=await readFile(join(root,'s6-cases.json'));assert.equal(sha(caseBytes),casePin);
const data=JSON.parse(caseBytes),summary=await read(join(output,'summary.json')),run=await read(join(output,'run-consumed.json')),cleanup=await read(join(output,'cleanup.json'));
const approval=await read(join(prep,'inference-approval.json'));
for(const r of [summary,run,approval]){assert.equal(r.manifestSha256,manifestPin);assert.equal(r.caseFileSha256,casePin);}
assert.equal(run.provenance,'live_meta');assert.equal(run.approved,true);assert.equal(run.consumed,true);
assert.equal(summary.provenance,'live_meta');assert.equal(summary.scriptedTransportCalls,0);assert.equal(summary.invoiceCostUsd,null);
assert.equal(cleanup.ownedRolesRemaining,0);assert.equal(cleanup.ownedDatabasesRemaining,0);assert.deepEqual(cleanup.failures,[]);assert.equal(cleanup.productionChanges,false);
const names=await readdir(output);assert(!names.includes('failure.json'));
const slots=names.filter(n=>n.endsWith('-dispatch.json')).sort(),calls=[],httpTimes=[];
const publicKeys=['merchantName','listPriceCents','offerPriceCents','previousPriceCents','bidCents','covers','round','maxRounds','maxConcessionCents'].sort();
for(const name of slots){
 const id=name.replace('-dispatch.json',''),dispatch=await read(join(output,name)),http=await read(join(output,id+'-http.json')),result=await read(join(output,id+'-result.json'));
 assert.equal(dispatch.consumed,true);assert.equal(http.consumed,true);assert.equal(dispatch.endpoint,'https://api.meta.ai/v1/chat/completions');
 assert.deepEqual(Object.keys(dispatch.input).sort(),publicKeys);
 assert.equal(sha(JSON.stringify(dispatch.input)),dispatch.inputSha256);assert.equal(result.inputSha256,dispatch.inputSha256);
 assert.equal(sha(JSON.stringify(dispatch.requestBody)),dispatch.bodySha256);
 assert.equal(dispatch.requestBody.model,'muse-spark-1.3');assert.equal(dispatch.requestBody.max_completion_tokens,1024);assert.equal(dispatch.requestBody.reasoning_effort,'low');
 assert(!/floorPriceCents|capacityCovers|backgroundParties|expectedBaseline|Bearer |authorization/iu.test(JSON.stringify(dispatch)));
 assert.equal(result.caseId,dispatch.caseId);assert.equal(result.round,dispatch.round);assert.equal(result.attempt,1);assert.equal(result.invoiceCostUsd,null);
 const raw=JSON.parse(http.body),usage=raw.usage;assert.equal(http.status,result.httpStatus);
 if(usage){
  assert.equal(result.usageStatus,'reported');assert.equal(result.tokensIn,usage.prompt_tokens);assert.equal(result.tokensOut,usage.completion_tokens);assert.equal(result.tokensCachedIn,usage.prompt_tokens_details?.cached_tokens??0);
  assert(Number.isSafeInteger(result.tokensIn)&&result.tokensIn>=0&&result.tokensIn<=1048576);assert(Number.isSafeInteger(result.tokensOut)&&result.tokensOut>=0&&result.tokensOut<=1024);assert(result.tokensCachedIn<=result.tokensIn);
  const nano=(result.tokensIn-result.tokensCachedIn)*1250+result.tokensCachedIn*150+result.tokensOut*4250;
  assert.equal(result.costNanoUsd,nano);assert.equal(result.estimatedCostUsd,nano/1e9);
 }else{for(const k of ['tokensIn','tokensOut','tokensCachedIn','costNanoUsd','estimatedCostUsd'])assert.equal(result[k],null);}
 if(result.ok){
  assert.equal(http.status,200);const proposal=JSON.parse(raw.choices[0].message.content);
  assert.deepEqual(Object.keys(proposal).sort(),['priceCents','rationale']);assert(Number.isSafeInteger(proposal.priceCents));assert.equal(typeof proposal.rationale,'string');assert(proposal.rationale.length<=300);assert.equal(JSON.parse(result.output).priceCents,proposal.priceCents);
 }
 assert(Number.isFinite(http.providerRoundTripMs)&&http.providerRoundTripMs>=0);httpTimes.push(http.providerRoundTripMs);calls.push(result);
}
assert(slots.length<=16);assert.equal(slots.length,summary.newInferenceCalls);assert.equal(slots.length,cleanup.requestsDispatched);
assert.equal(names.filter(n=>n.endsWith('-result.json')).length,slots.length);assert.equal(names.filter(n=>n.endsWith('-http.json')).length,slots.length);
assert.equal(summary.successfulProposalRequests,calls.filter(c=>c.ok).length);assert.equal(summary.failedProposalRequests,calls.filter(c=>!c.ok).length);
const records=[];
for(const c of data.cases){
 const row=await read(join(output,c.id+'.json'));assert.equal(row.id,c.id);assert.equal(row.model.provenance,'live_meta');
 for(const [key,value] of Object.entries(c.expectedBaseline))assert.deepEqual(row.baseline[key],value,`${c.id} frozen baseline ${key}`);
 for(const policy of ['baseline','model']){
  const r=row[policy],fills=r.storedFills,stored=r.storedCommitments,entries=r.ledgerEntries;
  assert.equal(r.pooledCovers,sum(fills,'covers'));assert(r.pooledCovers<=c.serverFixture.capacityCovers);
  const charged=fills.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0),saved=fills.reduce((n,f)=>n+f.covers*(680-f.pricePerCoverCents),0);
  assert.equal(r.chargedCents,charged);assert.equal(r.savingsCents,saved);assert.equal(sum(entries,'covers'),r.pooledCovers);assert.equal(entries.reduce((n,e)=>n+e.covers*e.pricePerCoverCents,0),charged);assert.equal(sum(entries,'savingsCents'),saved);
  for(const f of fills){const commitment=stored.find(s=>s.id===f.commitmentId);assert(commitment);assert(f.pricePerCoverCents>=c.serverFixture.floorPriceCents);assert(f.pricePerCoverCents<=commitment.maxPricePerCoverCents);assert.equal(commitment.termsVersion,c.event==='change_terms'?2:1);assert(f.covers>0&&f.covers<=commitment.covers);}
  const focal=r.submissions[c.backgroundParties],focalId=focal?.result.ok?focal.result.commitment.commitmentId:null,focalFills=fills.filter(f=>f.commitmentId===focalId);
  assert.equal(r.focalConfirmedCovers,sum(focalFills,'covers'));assert.equal(r.focalChargedCents,focalFills.reduce((n,f)=>n+f.covers*f.pricePerCoverCents,0));
  assert.equal(r.soloCovers,r.soloCounterfactual.reduce((n,s)=>n+(s.unlocked?stored.find(t=>t.id===s.commitmentId).covers:0),0));
  assert.equal(r.guardRejectedProposals,r.rounds.filter(s=>s.proposalVerdict!==null&&s.proposalVerdict!=='ok').length);
 }
 const actual=calls.filter(r=>r.caseId===c.id);assert.deepEqual(row.model.ai.requests,actual);
 assert.equal(row.model.inputs.length,actual.length);
 for(const input of row.model.inputs){const r=actual.find(r=>r.round===input.input.round);assert(r);assert.equal(input.sha256,r.inputSha256);assert.equal(input.proposal,r.ok?JSON.parse(r.output).priceCents:null);}
 if(actual.length===0)assert.equal(row.model.ai.status,'no_proposal_needed');
 records.push(row);
}
assert.equal(records.length,12);assert.equal(summary.casesEvaluated,12);
for(const [policy,key] of [['baseline','baseline'],['model','model']]){
 const rows=records.map(r=>r[policy]),s=summary[key];
 for(const field of ['focalConfirmedCovers','focalChargedCents','pooledCovers','soloCovers','guardRejectedProposals'])assert.equal(sum(rows,field),s[field]);
 assert.equal(sum(rows,'chargedCents'),s.poolChargedCents);assert.equal(sum(rows,'savingsCents'),s.poolSavingsCents);assert.equal(rows.filter(r=>r.focalConfirmedCovers>0).length,s.focalConfirmedCases);
}
assert.equal(summary.focalCoverDelta,summary.model.focalConfirmedCovers-summary.baseline.focalConfirmedCovers);
assert.equal(summary.focalChargedCentsDelta,summary.model.focalChargedCents-summary.baseline.focalChargedCents);
const estimatedNano=calls.every(c=>c.costNanoUsd!==null)?sum(calls,'costNanoUsd'):null;
if(estimatedNano!==null)assert(Math.abs(summary.estimatedProviderCostUsd-estimatedNano/1e9)<1e-12);
assert(summary.estimatedProviderCostUsd<=21.05);
const rows=records.map(r=>`<tr><th scope="row">${esc(r.id)}<small>${esc(r.description)}</small></th><td>${r.baseline.focalConfirmedCovers}</td><td>${r.model.focalConfirmedCovers}</td><td>${r.baseline.acceptedQuoteCents===null?'No agreement':cents(r.baseline.acceptedQuoteCents)}</td><td>${r.model.acceptedQuoteCents===null?'No agreement':cents(r.model.acceptedQuoteCents)}</td><td>${r.baseline.pooledCovers}</td><td>${r.model.pooledCovers}</td><td>${r.model.ai.requests.length}</td><td><a href="${r.id}.json">Record</a></td></tr>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S6 genuine Spark pricing comparison</title><style>body{font:16px system-ui;margin:24px;background:#fffdf7;color:#20251f}main{max-width:1200px;margin:auto}h1{font-size:28px;max-width:36ch;line-height:1.2}h2{font-size:21px}p{line-height:1.6;max-width:85ch}.metric{font-size:30px;font-weight:600}.scroll{overflow-x:auto;max-width:100%}table{border-collapse:collapse;width:100%;font-size:14px;min-width:940px}th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #ccc}small{display:block;font-weight:400;max-width:28ch}thead{background:#ece9df}code{overflow-wrap:anywhere}a{color:#15593b}footer{margin-top:24px}@media(max-width:500px){body{margin:16px}.metric{font-size:26px}}</style><main><h1>Spark filled fewer focal seats than the fixed policy in this run</h1><p>12 frozen synthetic cases, with genuine Muse Spark 1.3 responses and actual local booking/settlement services. Parties and exact approvals are scripted. Visit date: ${data.visitDate}. This is one bounded comparison using the existing slow-concession prompt and fixed buyer bids.</p><p class="metric">Spark ${summary.model.focalConfirmedCovers} / fixed policy ${summary.baseline.focalConfirmedCovers} focal seats</p><p>Spark confirmed seats in ${summary.model.focalConfirmedCases}/12 cases; the fixed maximum-concession policy did so in ${summary.baseline.focalConfirmedCases}/12. Whole-pool totals, including background parties, were ${summary.model.pooledCovers} versus ${summary.baseline.pooledCovers} seats. Background parties are excluded from the focal metric.</p><h2>What this supports</h2><p>This run does not demonstrate an AI advantage on confirmed focal seats or total accepted amounts. Spark obtained slightly higher prices in two shared successful cases, but completed fewer deals. These twelve cases do not establish a general model ranking. No tuning or repeat run followed the results.</p><h2>Calls, safeguards and cost</h2><p>${calls.length} genuine proposal requests across ${summary.casesWithSuccessfulProposal} cases. Two cases needed no inference. ${summary.successfulProposalRequests} valid replies, ${summary.failedProposalRequests} provider/parser failures, zero retries. No unsafe proposal reached a confirmed booking. Changed-terms and deadline refusal proof comes from the fixed-policy service runs and integration tests; Spark did not reach an agreed quote in those two cases.</p><p>Estimated inference cost: US$${(estimatedNano/1e9).toFixed(8)}, calculated from reported usage and <a href="https://dev.meta.ai/docs/pricing-rate-limits">Meta's Standard rates</a>. Invoice cost is unknown. Guarded attempts took ${(Math.min(...calls.map(c=>c.latencyMs))/1000).toFixed(3)} to ${(Math.max(...calls.map(c=>c.latencyMs))/1000).toFixed(3)} seconds, including recording overhead. No small-sample p95 is reported.</p><div class="scroll"><table><caption>Per-case focal confirmations, accepted quotes in SGD per seat, and whole-pool confirmations. No money was collected.</caption><thead><tr><th>Case</th><th>Fixed focal seats</th><th>Spark focal seats</th><th>Fixed quote SGD</th><th>Spark quote SGD</th><th>Fixed pool seats</th><th>Spark pool seats</th><th>Spark requests</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div><h2>Hypothetical amounts and pooling</h2><p>Focal accepted totals were SGD ${cents(summary.model.focalChargedCents)} for Spark and SGD ${cents(summary.baseline.focalChargedCents)} for the fixed policy. Whole-pool accepted totals were SGD ${cents(summary.model.poolChargedCents)} and SGD ${cents(summary.baseline.poolChargedCents)}. These are simulated ledger amounts, not payments or revenue. The same stored commitments cleared alone fill ${summary.model.soloCovers} seats under Spark prices and ${summary.baseline.soloCovers} under fixed-policy prices; those alone outcomes are clearing-engine counterfactuals.</p><p>All owned databases and roles were removed. The authorized run is closed after ${calls.length}/16 requests; its unused request slot is unavailable for a later retry. No production changes, posting or publication occurred. No real customers, demand, attendance, payments or recovered revenue are proven.</p><footer><p><a href="summary.json">Aggregates</a> · <a href="audit.json">Reconciliation audit</a> · <a href="cleanup.json">Resource cleanup</a> · <a href="run-closure.json">Allowance closure</a></p><p>Frozen cases: <code>${casePin}</code><br>Approved manifest: <code>${manifestPin}</code></p></footer></main></html>`;
const receiptNames=['summary.json','cleanup.json','run-consumed.json',...data.cases.map(c=>c.id+'.json'),...slots.flatMap(n=>{const id=n.replace('-dispatch.json','');return [n,id+'-http.json',id+'-result.json'];})].sort();
const evidenceFiles=await Promise.all(receiptNames.map(async path=>({path,sha256:sha(await readFile(join(output,path)))})));
const audit={auditedAt:new Date().toISOString(),manifestSha256:manifestPin,caseFileSha256:casePin,casesReconciled:12,requests:calls.length,successfulRequests:calls.filter(c=>c.ok).length,failedRequests:calls.filter(c=>!c.ok).length,reportedTokensIn:sum(calls,'tokensIn'),reportedCachedTokensIn:sum(calls,'tokensCachedIn'),reportedTokensOut:sum(calls,'tokensOut'),estimatedCostNanoUsd:estimatedNano,estimatedCostUsd:estimatedNano===null?null:estimatedNano/1e9,invoiceCostUsd:null,unsafeConfirmedFills:0,httpRoundTripRangeMs:[Math.min(...httpTimes),Math.max(...httpTimes)],allowance:'closed after this run; no retries or reuse of unused slots',evidenceFiles,reportSha256:sha(html)};
if(process.argv[2]==='--check'){
 const saved=await read(join(output,'audit.json'));assert.deepEqual(saved.evidenceFiles,evidenceFiles);assert.equal(sha(await readFile(join(output,'report.html'))),sha(html));assert.equal(saved.estimatedCostNanoUsd,estimatedNano);
 console.log(JSON.stringify({auditPassed:true,cases:12,requests:calls.length,unsafeConfirmedFills:0,estimatedCostUsd:audit.estimatedCostUsd}));
}else{
 await writeFile(join(output,'report.html'),html,{flag:'wx'});await writeFile(join(output,'audit.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({audited:true,cases:12,requests:calls.length,unsafeConfirmedFills:0,estimatedCostUsd:audit.estimatedCostUsd,reportedTokensIn:audit.reportedTokensIn,reportedTokensOut:audit.reportedTokensOut,report:join(output,'report.html')}));
}
