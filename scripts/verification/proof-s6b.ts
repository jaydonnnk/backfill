import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isEntrypoint} from '../../src/lib/entrypoint';
import {loadAndGate} from './proof-s6-replay';
import {POLICIES,decide,expandWorlds,parseS6bCases,simulate,summarize,type Outcome,type S6bCases,type S6bWorld,type Slice} from './proof-s6b-model';

// Runs the frozen s6-pricing-2 worlds once under deterministic policies. Output is write-once;
// --check recomputes everything and compares it with what was saved. No model has an S6b arm.

const ROOT='docs/plans/backfill-proof',OWNED=join(ROOT,'evidence/s6b-offline-2026-11-04'),CASES=join(ROOT,'s6b-cases.json');
const SOURCES=[CASES,'scripts/verification/proof-s6b.ts','scripts/verification/proof-s6b-model.ts','scripts/verification/proof-s6-replay.ts','scripts/verification/proof-s6-policy.ts','src/domain/negotiation/rules.ts','src/domain/clearing/clear.ts','src/domain/offers/evaluate.ts','src/domain/offers/schema.ts','src/domain/commitments/occurrence.ts'];
const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
type Row={world:S6bWorld;outcome:Outcome};
export function evaluate(data:S6bCases){
 const worlds=expandWorlds(data),byPolicy:Record<string,Row[]>={},lines:string[]=[];
 for(const {id} of data.policies){
  const rows=worlds.map(world=>({world,outcome:simulate(data,world,POLICIES[id])}));
  byPolicy[id]=rows;
  for(const {outcome:o} of rows)lines.push([id,o.worldId,o.acceptedQuoteCents??'',o.counterCents??'',o.submitted,o.focalCovers,o.focalCents,o.poolCovers,o.poolCents,o.rounds.join(';')].join(','));
 }
 const group=(key:(w:S6bWorld)=>string)=>{
  const out:Record<string,Record<string,Slice>>={};
  for(const {id} of data.policies){
   const buckets=new Map<string,Row[]>();
   for(const row of byPolicy[id]??[]){const k=key(row.world);buckets.set(k,[...(buckets.get(k)??[]),row]);}
   out[id]=Object.fromEntries([...buckets].map(([k,rows])=>[k,summarize(rows,data.costBpsOfOffer)]));
  }
  return out;
 };
 const decisionSlices=group(w=>`${w.buyer}|${w.priceWorld}`);
 return {worlds:worlds.length,outcomes:lines.length,outcomesSha256:sha(lines.join('\n')+'\n'),byBuyer:group(w=>w.buyer),byPool:group(w=>w.pool),byPriceWorld:group(w=>w.priceWorld),byBuyerAndPriceWorld:decisionSlices,byBuyerAndPool:group(w=>`${w.buyer}|${w.pool}`),decisions:decide(data,decisionSlices)};
}
export type Evaluation=ReturnType<typeof evaluate>;
const esc=(s:string)=>s.replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]??c);
const pct=(n:number|null,d=1)=>n===null?'-':(n*100).toFixed(d)+'%';
export function reportHtml(data:S6bCases,e:Evaluation,caseSha:string){
 const costs=data.costBpsOfOffer.map(String);
 const table=(caption:string,labels:readonly string[],slices:Evaluation['byBuyer'])=>labels.map(label=>{
  const rows=data.policies.map(p=>{const s=slices[p.id]?.[label];assert(s);return `<tr${p.id===data.comparator?' class="comparator"':''}><th scope="row">${esc(p.id)}</th><td>${pct(s.focalDeals/s.worlds,0)}</td><td>${pct(s.focalPriceShareOfOffer)}</td><td>${s.poolSeats}</td>${costs.map(c=>`<td>${(s.poolMarginSeatsPerWorld[c]??0).toFixed(2)}</td>`).join('')}</tr>`;}).join('');
  return `<h3>${esc(caption)}: ${esc(label)}</h3><div class="scroll" tabindex="0"><table><thead><tr><th scope="col">Policy</th><th scope="col">Focal deal rate</th><th scope="col">Focal price, share of offer</th><th scope="col">Pool seats</th>${costs.map(c=>`<th scope="col">Pool margin at cost ${Number(c)/100}%</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
 }).join('');
 const decisions=e.decisions.map(d=>`<tr><th scope="row">${esc(d.policy)}</th><td>${d.focalSeatsBehind}/${d.slices}</td><td>${d.poolSeatsBehind}/${d.slices}</td><td>${d.marginBehind}</td><td>${d.marginAhead}</td><td>${d.defaultCandidate?'Yes':'No'}</td></tr>`).join('');
 const candidates=e.decisions.filter(d=>d.defaultCandidate).map(d=>d.policy);
 const verdict=candidates.length?`Passing the frozen rule: ${esc(candidates.join(', '))}.`:'No policy passed the frozen rule. No winner is named, and the choice stays a product decision.';
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S6b offline pricing</title><style>:root{color-scheme:light dark;--bg:#fffdf7;--fg:#20251f;--rule:#c9c5b8;--head:#ece9df;--mark:#f4efd9}@media (prefers-color-scheme:dark){:root{--bg:#171a17;--fg:#ecebe4;--rule:#454a43;--head:#262a25;--mark:#2f3226}}*{box-sizing:border-box}body{font:16px/1.55 system-ui,sans-serif;margin:0;padding:24px 16px;background:var(--bg);color:var(--fg)}main{max-width:1100px;margin:auto}h1{font-size:28px;line-height:1.2}h2{margin-top:36px;font-size:21px}h3{margin:26px 0 8px;font-size:16px}p{max-width:75ch}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:8px 10px;border-bottom:1px solid var(--rule);white-space:nowrap}th:first-child{text-align:left}thead th{background:var(--head);white-space:normal;vertical-align:bottom}.comparator{background:var(--mark)}.scroll{overflow-x:auto}code{overflow-wrap:anywhere}</style><main><h1>S6b offline pricing</h1><p><strong>${verdict}</strong></p><p>${e.worlds} frozen synthetic worlds across ${data.policies.length} deterministic policies, for ${e.outcomes} outcomes. Buyers, reservations, costs and arrival order are stated assumptions, not demand data. AI was not measured. New inference calls: 0. S6's genuine negative result stays the result of record.</p><h2>Frozen decision rule</h2><p>${esc(data.decisionRule)}</p><div class="scroll" tabindex="0"><table><thead><tr><th scope="col">Policy against ${esc(data.comparator)}</th><th scope="col">Focal seats behind</th><th scope="col">Pool seats behind</th><th scope="col">Margin checks behind</th><th scope="col">Margin checks ahead</th><th scope="col">Default candidate</th></tr></thead><tbody>${decisions}</tbody></table></div><h2>By buyer style</h2><p>Pool margin is in offer-priced seats per world, so price worlds compare. The shaded row is the comparator. Margin at 0% cost equals revenue.</p>${table('Buyer',data.buyers.map(b=>b.id),e.byBuyer)}<h2>By pool state</h2>${table('Pool',data.pools.map(p=>p.id),e.byPool)}<p>Frozen case hash: <code>${caseSha}</code>. Outcome hash: <code>${e.outcomesSha256}</code>. <a href="summary.json">Full slices</a>.</p></main></html>`;
}
async function main(){
 globalThis.fetch=async()=>{throw Error('HTTP forbidden during S6b');};
 const bytes=await readFile(CASES),freeze=JSON.parse(await readFile(join(OWNED,'case-freeze.json'),'utf8'));
 assert.equal(sha(bytes),freeze.sha256,'Frozen cases changed');
 const data=parseS6bCases(JSON.parse(bytes.toString('utf8')));
 const gate=await loadAndGate();
 const evaluation=evaluate(data);
 const summary={provenance:'deterministic_offline',assurance:'Synthetic worlds and scripted buyers. Not demand, attendance, revenue or profit. AI not measured.',caseFileSha256:freeze.sha256,newInferenceCalls:0,aiArm:null,savedS6OutcomesReproduced:gate.reproduced,...evaluation};
 const manifest={node:process.version,files:await Promise.all(SOURCES.map(async path=>({path,sha256:sha(await readFile(path))})))};
 const output=join(OWNED,'run-01'),summaryText=JSON.stringify(summary,null,2)+'\n',html=reportHtml(data,evaluation,freeze.sha256);
 if(process.argv[2]==='--check'){
  assert.equal(await readFile(join(output,'summary.json'),'utf8'),summaryText,'Saved summary differs');
  assert.equal(await readFile(join(output,'report.html'),'utf8'),html,'Saved report differs');
  assert.deepEqual(JSON.parse(await readFile(join(output,'source-manifest.json'),'utf8')).files,manifest.files,'Pinned source changed');
  console.log(JSON.stringify({s6bCheckPassed:true,worlds:evaluation.worlds,outcomes:evaluation.outcomes,defaultCandidates:evaluation.decisions.filter(d=>d.defaultCandidate).map(d=>d.policy),newInferenceCalls:0}));
  return;
 }
 await mkdir(output);
 await writeFile(join(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 await writeFile(join(output,'summary.json'),summaryText,{flag:'wx'});
 await writeFile(join(output,'report.html'),html,{flag:'wx'});
 console.log(JSON.stringify({worlds:evaluation.worlds,outcomes:evaluation.outcomes,output}));
}
if(isEntrypoint(import.meta.url))main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'S6b failed');process.exitCode=1;});
