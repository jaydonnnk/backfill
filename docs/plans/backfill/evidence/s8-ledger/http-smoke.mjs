// Run against a secret-free built archive, from an empty cwd with a minimal environment.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createTestDatabase } from '../../../../../tests/support/db.ts';
import { mintAgent } from '../../../../../src/lib/agents/tokens.ts';
import { mintMerchant } from '../../../../../src/lib/onboarding/links.ts';
import { submitCommitment } from '../../../../../src/lib/commitments/service.ts';
import { singaporeLocal } from '../../../../../src/domain/singapore-time.ts';

assert.equal(process.env.TEST_DATABASE_URL, 'postgres://postgres@127.0.0.1:5432/postgres', 'smoke requires the explicit disposable local PostgreSQL');
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const t = await createTestDatabase('s8_http');
const role = `backfill_t_http_${randomBytes(4).toString('hex')}`;
let server;
let roleCreated = false;
try {
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`); roleCreated = true;
  const runtimeUrl = new URL(t.url); runtimeUrl.username = role;
  const merchant = await mintMerchant(t.db, 'S8 HTTP verification (simulated)');
  const agent = await mintAgent(t.db, `s8-http-${randomBytes(4).toString('hex')}`, 'simulated HTTP buyer');
  const now = new Date(); const sg = singaporeLocal(now);
  assert(sg.minute >= 2 && sg.minute < 1380, 'smoke needs room for a same-day Singapore window');
  const [rule] = await t.admin`insert into rules ${t.admin({merchant_id:merchant.id,list_price_cents:1250,capacity_covers:2,weekday:sg.weekday,start_minute:sg.minute+5,end_minute:sg.minute+60,commit_by_minute:sg.minute-1,discount_bps:2500,min_pool_covers:2,per_agent_cap_covers:4,floor_price_cents:900})} returning id`;
  const made = await submitCommitment(t.db, agent.id, {ruleId:String(rule.id),termsVersion:1,visitDate:sg.date,covers:2,maxPricePerCoverCents:938,idempotencyKey:'s8-http'},()=>new Date(now.getTime()-10*60000));
  assert.equal(made.ok,true);
  const id = made.commitment.commitmentId;
  const probe = createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath,[`${root}node_modules/next/dist/bin/next`,'start','--hostname','127.0.0.1','--port',String(port)],{
    cwd:root,stdio:['ignore','ignore','ignore'],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:runtimeUrl.toString(),META_API_KEY:'local-blocked-provider',META_BASE_URL:'https://127.0.0.1:9/v1',META_MODEL_SPARK:'muse-spark-1.3',META_MODEL_WONDER:'muse-wonder-1.0'},
  });
  let healthy=false;
  for(let i=0;i<100&&!healthy;i++) {
    assert.equal(server.exitCode,null,'local server exited');
    healthy=await fetch(`${base}/api/health`).then(r=>r.status===200,()=>false);
    if(!healthy)await new Promise(resolve=>setTimeout(resolve,300));
  }
  assert(healthy,'local server ready');
  const headers={'content-type':'application/json',authorization:`Bearer ${agent.token}`};
  const createPath=`${base}/api/checkout_sessions`;
  assert.equal((await fetch(createPath,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  const created=await fetch(createPath,{method:'POST',headers,body:JSON.stringify({commitment_id:id})});assert.equal(created.status,201);
  const ready=await created.json();assert.equal(ready.status,'ready_for_payment');assert.deepEqual(ready.totals,[{type:'total',amount:1876}]);assert.deepEqual(ready.savings,{savings_cents:624,buyer_share_cents:624,agent_share_cents:0,network_share_cents:0});
  const complete=()=>fetch(`${createPath}/${id}/complete`,{method:'POST',headers,body:'{"simulate":true}'});
  const completed=await complete();assert.equal(completed.status,200);const receipt=await completed.json();assert.equal(receipt.status,'completed');assert.equal(receipt.simulated,true);assert.equal(receipt.money_moved,false);
  assert.deepEqual(await (await complete()).json(),receipt);
  assert.deepEqual(await (await fetch(`${createPath}/${id}`,{headers})).json(),receipt);
  assert.equal((await fetch(createPath)).status,405);
  const merchantPage=await fetch(`${base}/merchant`,{headers:{cookie:`backfill_merchant=${merchant.token}`}});
  assert.equal(merchantPage.status,200);const html=await merchantPage.text();assert(html.includes('Savings ledger')&&html.includes('S$6.24'));
  const [counts]=await t.admin`select (select count(*)::int from ledger) as ledger, (select count(*)::int from checkout_receipts) as receipts, (select count(*)::int from llm_calls) as model_attempts`;
  assert.deepEqual(counts,{ledger:1,receipts:1,model_attempts:0});
  const report={checkedAt:new Date().toISOString(),kind:'local production build, disposable PostgreSQL, runtime role',http:{unauthorized:401,create:201,complete:200,retrieve:200,unsupportedMethod:405},acceptedTotalCents:1876,buyerSavingsCents:624,agentShareCents:0,networkShareCents:0,simulated:true,moneyMoved:false,counts,merchantServerHtmlVerified:true,browserInteractionVerified:false};
  writeFileSync(`${root}docs/plans/backfill/evidence/s8-ledger/http-smoke.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  if(server&&server.exitCode===null) {
    const stopped=new Promise(resolve=>server.once('exit',resolve)); server.kill('SIGTERM');
    const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await stopped;clearTimeout(timer);
  }
  await t.drop();
  if(roleCreated) {
    const admin=postgres(process.env.TEST_DATABASE_URL,{max:1,onnotice:()=>{}});
    try{await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);}finally{await admin.end();}
  }
}
