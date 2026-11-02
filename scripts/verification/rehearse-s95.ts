import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connectDb } from '../../src/lib/db/client';
import { tokenSha256 } from '../../src/lib/agents/tokens';
import { randomBytes } from 'node:crypto';
import { agents } from '../../src/lib/db/schema';
import { BUYERS } from '../../sim/buyers/intents';
import { mcpConnector } from '../../sim/buyers/run';
import { Recording, runScene } from '../../sim/buyers/scene';
import { chromium } from '@playwright/test';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/backfill_t_s95_preview_/);
const { db, close } = connectDb(url.toString(), 3);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const tokens = new Map<string, string>();
const evidence: unknown[] = [];
try {
  for (const buyer of BUYERS) {
    const token = `bfa_${randomBytes(32).toString('base64url')}`;
    const tokenSha = tokenSha256(token);
    await db.insert(agents).values({ id: buyer.agentId, label: buyer.intent, tokenSha256: tokenSha }).onConflictDoUpdate({ target: agents.id, set: { tokenSha256: tokenSha, revokedAt: null } });
    tokens.set(buyer.agentId, token);
  }
  const recording = Recording.parse(JSON.parse(await readFile('sim/buyers/recordings/scene.json', 'utf8')));
  await page.goto('http://127.0.0.1:3195/demo?kopi=off');
  for (let run = 1; run <= 5; run++) {
    console.log(`Local full MCP replay ${run}/5 started`);
    const result = await runScene({ db, connect: mcpConnector('http://127.0.0.1:3195', tokens), models: { mode: 'replay', recording }, now: () => new Date(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), leadMinutes: 1, concurrency: 4, settleMs: 1500 });
    const scene = result.snapshot.scene;
    assert.ok(scene);
    assert.equal(scene.phase, 'cleared');
    assert.equal(scene.buyers.filter(b => b.soloUnlocks).length, 0);
    assert.equal(scene.pooled.unlocked, true);
    assert.equal(scene.pooled.soldOut, true);
    assert.equal(scene.pooled.filledCovers, 16);
    assert.equal(scene.plan?.provenance, 'recorded_replay');
    assert.equal(result.snapshot.ledger?.reconciled, true);
    const pool = result.snapshot.ledger?.pools.find(p => p.ruleId === result.ruleId);
    assert.equal(pool?.buyerShareCents, 2176);
    assert.equal(pool?.agentShareCents, 0);
    assert.equal(pool?.networkShareCents, 0);
    await page.reload();
    await page.getByText('Unlocked: 16 covers filled, sold out.', { exact: true }).waitFor();
    await page.screenshot({ path: `docs/plans/backfill/evidence/s95/rehearsal-${run}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    evidence.push({ run, ruleId: result.ruleId, visitDate: result.visitDate, commitBy: result.commitBy, filledCovers: 16, buyerSavingsCents: 2176, agentShareCents: 0, networkShareCents: 0, provenance: scene.plan?.provenance, reconciled: true, browserErrors: [] });
    await writeFile('docs/plans/backfill/evidence/s95/rehearsals.json', JSON.stringify({ environment: 'disposable local database and HTTP server; actual clock; recorded decisions; no provider calls', runs: evidence }, null, 2) + '\n');
    console.log(`Local full MCP replay ${run}/5 passed: 16 covers, S$21.76 buyer savings, zero agent/network share`);
  }
} finally { await browser.close(); await close(); }
