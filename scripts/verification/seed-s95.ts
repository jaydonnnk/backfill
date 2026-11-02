// Synthetic local browser fixture only. TEST_DATABASE_URL must be the disposable local PostgreSQL server.
import { writeFile } from 'node:fs/promises';
import { createTestDatabase } from '../../tests/support/db';
import { mintAgent } from '../../src/lib/agents/tokens';
import { submitCommitment, settleDue } from '../../src/lib/commitments/service';
import { demoSnapshot } from '../../src/lib/demo/snapshot';
import { BUYERS } from '../../sim/buyers/intents';
import { randomBytes } from 'node:crypto';
import { tokenSha256 } from '../../src/lib/agents/tokens';
import { menuDrafts } from '../../src/lib/db/schema';
const t = await createTestDatabase('s95_preview');
const [m] = await t.admin`insert into merchants (name) values ('Backfill Demo Cafe') returning id`;
const [r] = await t.admin`insert into rules ${t.admin({ merchant_id: m!.id, list_price_cents: 680, capacity_covers: 16, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2000, min_pool_covers: 8, per_agent_cap_covers: 4, floor_price_cents: 500 })} returning id`;
const covers = [2, 3, 4, 2, 3, 2, 4, 1, 3, 2, 4];
for (const [i, b] of BUYERS.slice(0,11).entries()) {
  const agent = await mintAgent(t.db, b.agentId, b.intent);
  const result = await submitCommitment(t.db, agent.id, { ruleId: r!.id, termsVersion: 1, visitDate: '2026-10-27', covers: covers[i]!, maxPricePerCoverCents: 544, idempotencyKey: `preview-${i}` }, () => new Date(Date.parse('2026-10-27T10:00:00+08:00') + i * 1000));
  if (!result.ok) throw new Error('seed refused');
}
await settleDue(t.db, m!.id, () => new Date('2026-10-27T12:00:01+08:00'));
await t.admin`insert into wonder_plans ${t.admin({rule_id:r!.id, visit_date:'2026-10-27', terms_version:1, model:'replay:local-ui-fixture', discount_bps:1500, capacity_covers:24, min_pool_covers:12, per_agent_cap_covers:4, rationale:'Synthetic local UI fixture. More seats, a smaller discount.', verdict:'ok'})}`;
const previewMerchant = {token: 'bfm_' + randomBytes(32).toString('base64url')};
await t.admin`update merchants set link_token_sha256 = ${tokenSha256(previewMerchant.token)} where id = ${m!.id}`;
const [draft] = await t.db.insert(menuDrafts).values({merchantId:m!.id, photoSha256:'a'.repeat(64),photoBytes:24,photoType:'image/png',model:'synthetic-ui-fixture',draft:{currency:'SGD',items:[{name:'Kaya toast set',priceCents:450},{name:'Kopi C',priceCents:230}],cover:{itemIndexes:[0,1],description:'Kaya toast and Kopi C'}},verdict:'ok',listPriceCents:680}).returning({id:menuDrafts.id});
await writeFile('/tmp/backfill-s95-preview/.env.local', [
  `DATABASE_URL=${t.url}`, 'META_API_KEY=local-dummy', 'META_BASE_URL=https://model.invalid',
  'META_MODEL_SPARK=local-dummy', 'META_MODEL_WONDER=local-dummy',
  'APP_BASE_URL=http://127.0.0.1:3195', 'NEXT_TELEMETRY_DISABLED=1',
  `S95_MERCHANT_TOKEN=${previewMerchant.token}`, `S95_DRAFT_ID=${draft!.id}`,
].join('\n') + '\n', { mode: 0o600 });
const snapshot = await demoSnapshot(t.db);
await writeFile('/tmp/backfill-s95-snapshot.json', JSON.stringify(snapshot));
console.log('Disposable local fixture prepared:', new URL(t.url).pathname);
await t.admin.end();
process.exit(0);
