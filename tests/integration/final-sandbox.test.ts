import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDb } from '@/lib/db/client';
import { authenticateAgent, mintAgent } from '@/lib/agents/tokens';
import { buyerAction } from '@/lib/buyer/service';
import { buyerHandler } from '@/lib/buyer/http';
import { gatewayBuyer, glimmerParser } from '@/lib/buyer/models';
import { mintSandboxAgent, sandboxHandler } from '@/lib/buyer/sandbox';
import { mcpPostHandler } from '@/lib/mcp/http';
import { seedSandbox } from '../../scripts/ops/seed-sandbox';
import { createTestDatabase, type TestDatabase } from '../support/db';
import { buyerFixtures, INTENT } from '../support/proof-s4';

let t: TestDatabase;
let app: ReturnType<typeof connectDb>;
const role = `sandbox_${randomBytes(5).toString('hex')}`;
const clock = () => new Date('2026-11-03T01:00:00Z');
beforeAll(async () => {
  t = await createTestDatabase('final_sandbox');
  await t.admin.unsafe(`create role ${role} login in role backfill_app`);
  const url = new URL(t.url); url.username = role; app = connectDb(url.toString(), 8);
});
beforeEach(async () => { await t.admin`truncate rate_limits`; });
afterAll(async () => {
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
  try { await root.unsafe(`drop role if exists ${role}`); } finally { await root.end(); }
});
async function sandbox() {
  const result = await mintSandboxAgent(app.db, null);
  if (result.status !== 'ok') throw Error('mint failed');
  const id = await authenticateAgent(app.db, `Bearer ${result.token}`);
  if (!id) throw Error('authentication failed');
  return { id, token: result.token };
}
const mcp = (token: string, name: string, args = {}) => mcpPostHandler(() => app.db, clock)(new Request('http://test/mcp', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
})).then(r => r.json());
it('seeds seven sandbox weekdays idempotently without altering a real merchant', async () => {
  await seedSandbox(t.db); await seedSandbox(t.db);
  const rows = await t.admin`select r.*, m.name, m.visibility from rules r join merchants m on m.id = r.merchant_id where m.visibility = 'sandbox' order by weekday`;
  expect(rows).toHaveLength(7);
  expect(rows.map(r => r.weekday)).toEqual([1,2,3,4,5,6,7]);
  for (const row of rows) expect(row).toMatchObject({ name: 'Backfill Sandbox Cafe (synthetic)', list_price_cents: 680, discount_bps: 2000, floor_price_cents: 500, capacity_covers: 200, min_pool_covers: 4, per_agent_cap_covers: 4, start_minute: 840, end_minute: 1020, commit_by_minute: 720 });
});
it('scopes HTTP and MCP offers and refuses a sandbox token on a known real rule', async () => {
  await seedSandbox(t.db);
  const [merchant] = await t.admin`insert into merchants(name) values ('Real fixture') returning id`;
  const [rule] = await t.admin`insert into rules(merchant_id,list_price_cents,capacity_covers,weekday,start_minute,end_minute,commit_by_minute,discount_bps,min_pool_covers,per_agent_cap_covers,floor_price_cents) values (${merchant!.id},680,200,2,840,1020,720,2000,4,4,500) returning id`;
  const sb = await sandbox(); const standard = await mintAgent(t.db, randomUUID(), 'standard fixture');
  for (const party of [sb, standard]) {
    const get = await buyerHandler(() => app.db, buyerFixtures, clock)(new Request('http://test/api/buyer', { headers: { authorization: `Bearer ${party.token}` } }));
    const http = await get.json(); const rpc = await mcp(party.token, 'list_offers');
    expect(http.offers.length).toBeGreaterThan(0);
    expect(rpc.result.structuredContent.offers).toEqual(http.offers);
    for (const offer of http.offers) expect(offer.merchantName === 'Backfill Sandbox Cafe (synthetic)').toBe(party === sb);
  }
  const refused = await mcp(sb.token, 'submit_commitment', { ruleId: rule!.id, termsVersion: 1, visitDate: '2026-11-03', covers: 2, maxPricePerCoverCents: 600, idempotencyKey: randomUUID() });
  expect(refused.result.structuredContent).toMatchObject({ ok: false, reason: 'offer_unavailable' });
});
it('caps mints per client and globally, and the public handler never caches credentials', async () => {
  for (let i=0;i<5;i++) expect((await mintSandboxAgent(app.db, 'a')).status).toBe('ok');
  expect((await mintSandboxAgent(app.db, 'a')).status).toBe('rate_limited');
  for (let i=0;i<55;i++) expect((await mintSandboxAgent(app.db, null)).status).toBe('ok');
  const res = await sandboxHandler(() => app.db)(new Request('http://test/api/buyer/sandbox', { method: 'POST' }));
  expect(res.status).toBe(429); expect(res.headers.get('cache-control')).toBe('no-store');
  await t.admin`truncate rate_limits`;
  const ok = await sandboxHandler(() => app.db)(new Request('http://test/api/buyer/sandbox', { method: 'POST' }));
  expect(ok.status).toBe(200); expect(ok.headers.get('cache-control')).toBe('no-store');
  expect((await ok.json()).token).toMatch(/^bfa_/);
});
it('admits only 40 sandbox sessions across parties, while retrying a start is free', async () => {
  const parties = await Promise.all(Array.from({length: 5}, () => sandbox()));
  for (let i=0;i<40;i++) {
    const id = randomUUID(); const args = { action: 'start', id, request: 'Synthetic request' };
    expect((await buyerAction(app.db, parties[i%5]!.id, args, buyerFixtures(), clock)).status).toBe('ok');
    expect((await buyerAction(app.db, parties[i%5]!.id, args, buyerFixtures(), clock)).status).toBe('ok');
  }
  expect((await buyerAction(app.db, parties[0]!.id, {action:'start',id:randomUUID(),request:'Over cap'},buyerFixtures(),clock)).status).toBe('daily_cap');
});
it('runs real model adapters over fake HTTP, records agent approval and prevents a third model action', async () => {
  await seedSandbox(t.db); const party = await sandbox(); const id = randomUUID();
  vi.stubEnv('NVIDIA_API_KEY','offline-dummy'); vi.stubEnv('AI_GATEWAY_API_KEY','offline-dummy');
  let calls = 0;
  const transport: typeof fetch = async url => {
    calls++;
    if (String(url).includes('nvidia.com')) return Response.json({ choices: [{ finish_reason: 'stop', message: {content: JSON.stringify(INTENT)} }], usage: {prompt_tokens:10,completion_tokens:20} });
    expect(String(url)).toContain('ai-gateway.vercel.sh');
    return Response.json({ content: [{ type: 'text', text: JSON.stringify({covers:2,reason:'Synthetic test'}) }], finishReason: {unified:'stop',raw:'stop'}, usage: {inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:20,text:20,reasoning:0}}, warnings: [] });
  };
  const models = {parse:glimmerParser(transport),decide:gatewayBuyer(transport)};
  const act = (args: object) => buyerAction(app.db,party.id,{id,...args},models,clock);
  try {
    await act({action:'start',request:'Two on 2026-11-03, 14:00 to 17:00, SGD6 each'});
    expect((await act({action:'parse',revision:0})).session?.proposal).toEqual(INTENT);
    await act({action:'review',revision:0,constraints:INTENT});
    const [rule] = await t.admin`select r.id from rules r join merchants m on m.id=r.merchant_id where m.visibility='sandbox' and weekday=2`;
    const decision = await act({action:'decide',revision:1,ruleId:rule!.id});
    expect(decision.session?.decision?.covers).toBe(2);
    await act({action:'approve',revision:1,terms:decision.session?.terms});
    const submitted = await act({action:'submit',revision:1});
    expect(submitted.session?.result).toMatchObject({ok:true});
    expect(submitted.session?.approval?.source).toBe('agent_action');
    const [row] = await t.admin`select a.scope,m.visibility from commitments c join agents a on a.id=c.agent_id join rules r on r.id=c.rule_id join merchants m on m.id=r.merchant_id where c.agent_id=${party.id}`;
    expect(row).toEqual({scope:'sandbox',visibility:'sandbox'});
    const second = randomUUID();
    await buyerAction(app.db,party.id,{id:second,action:'start',request:'Synthetic'},models,clock);
    for (let i=0;i<2;i++) {
      await buyerAction(app.db,party.id,{id:second,action:'parse',revision:i},models,clock);
      await buyerAction(app.db,party.id,{id:second,action:'edit',revision:i,request:'Synthetic'},models,clock);
    }
    expect((await buyerAction(app.db,party.id,{id:second,action:'parse',revision:2},models,clock)).status).toBe('attempt_cap');
    expect(calls).toBe(4);
  } finally {vi.unstubAllEnvs();}
});
