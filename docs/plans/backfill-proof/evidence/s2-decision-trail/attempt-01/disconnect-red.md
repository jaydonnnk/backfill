# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: proof-s2.spec.ts >> stored S2 trail on the real demo, with pending and settled pools, interrupted feed and recovery
- Location: tests/e2e/proof-s2.spec.ts:16:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Connecting to updates', { exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Connecting to updates', { exact: true }) with timeout 10000ms
  - waiting for getByText('Connecting to updates', { exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#content"
- banner:
  - link "Backfill home":
    - /url: /
    - text: Backfill
  - navigation "Main navigation":
    - link "Live":
      - /url: /demo
    - link "Why Spark":
      - /url: /evals
    - link "Merchants":
      - /url: /merchant
    - link "How it works":
      - /url: /#how-it-works
- main:
  - paragraph: Backfill in action · Simulated buyers
  - heading "Quiet café. Full table." [level=1]:
    - text: Quiet café.
    - emphasis: Full table.
  - paragraph: Watch separate bookings come together to unlock an off-peak discount.
  - button "Watch how it works"
  - status: Latest saved bookings
  - region "Group booking progress":
    - paragraph: Backfill Demo Cafe
    - heading "A better price, together." [level=2]
    - paragraph: S$5.44 per person
    - paragraph: S$6.80 20% off
    - term: Visit
    - definition: 2026-11-03 12:07–13:06 SGT
    - term: The group needs
    - definition: 8 diners
    - paragraph: Separate parties commit to their own terms. See approval evidence below.
    - paragraph: Recorded group
    - paragraph:
      - strong: "8"
      - text: diners joined · 8 needed
    - progressbar "8 diners joined; 8 needed"
    - paragraph: All available seats filled.
    - status:
      - heading "The group unlocked the offer." [level=3]
      - paragraph:
        - strong: 8 diners confirmed
        - text: / S$10.88 saved by this group
  - group: See booking details
  - group:
    - text: Decision and approval trail
    - paragraph: Each party acts separately. A proposal reserves no seats. Submitted commitments stay pending until settlement. Checkout is simulated.
    - paragraph: Scripted authorization records a local script accepting exact terms. It does not establish a real person's approval. Missing evidence stays unavailable.
    - group:
      - text: s2-browser-4-0 · filled
      - term: Request
      - definition: Synthetic party requests 2 kaya toast and kopi covers on 2026-11-03, at S$5.44 each.
      - term: Bounded output
      - definition: 2 covers. Authored fixture selects the requested covers at the stated offer price. Authored synthetic fixture, no model call
      - term: Proposed terms
      - definition: v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Approval evidence
      - definition: Scripted authorization matches exact terms
      - term: Submitted commitment
      - definition: 35eb8deb-c763-4fd0-a43b-4646f861afff v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Result
      - definition: Filled at settlement. Simulated checkout
      - term: Record links
      - definition: Run d662185e-d151-4327-b4e3-3ba1d62497cb Rule 8674a22d-7af9-4151-bcbb-e54dc82744cc · occurrence 2026-11-03 Trail cb748d76-5019-44ae-8e38-0d1fd7a85e68
    - group:
      - text: s2-browser-4-1 · filled
      - term: Request
      - definition: Synthetic party requests 2 kaya toast and kopi covers on 2026-11-03, at S$5.44 each.
      - term: Bounded output
      - definition: 2 covers. Authored fixture selects the requested covers at the stated offer price. Authored synthetic fixture, no model call
      - term: Proposed terms
      - definition: v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Approval evidence
      - definition: Unavailable. No approval established
      - term: Submitted commitment
      - definition: b48baeb9-bc96-4002-9e60-8497c5f35937 v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Result
      - definition: Filled at settlement. Simulated checkout
      - term: Record links
      - definition: Run d662185e-d151-4327-b4e3-3ba1d62497cb Rule 8674a22d-7af9-4151-bcbb-e54dc82744cc · occurrence 2026-11-03 Trail 53a6ed94-5e72-4db4-ba36-eb1d7c94d73d
    - group:
      - text: s2-browser-4-2 · filled
      - term: Request
      - definition: Synthetic party requests 2 kaya toast and kopi covers on 2026-11-03, at S$5.44 each.
      - term: Bounded output
      - definition: 2 covers. Authored fixture selects the requested covers at the stated offer price. Authored synthetic fixture, no model call
      - term: Proposed terms
      - definition: v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Approval evidence
      - definition: Approval mismatch. No matching authorization
      - term: Submitted commitment
      - definition: 2937d6ae-4143-458b-9338-5320e327dc9e v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Result
      - definition: Filled at settlement. Simulated checkout
      - term: Record links
      - definition: Run d662185e-d151-4327-b4e3-3ba1d62497cb Rule 8674a22d-7af9-4151-bcbb-e54dc82744cc · occurrence 2026-11-03 Trail 40e45c01-acfe-4a9a-930f-73fd3c1fa84c
    - group:
      - text: s2-browser-4-3 · filled
      - term: Request
      - definition: Synthetic party requests 2 kaya toast and kopi covers on 2026-11-03, at S$5.44 each.
      - term: Bounded output
      - definition: 2 covers. Authored fixture selects the requested covers at the stated offer price. Authored synthetic fixture, no model call
      - term: Proposed terms
      - definition: v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Approval evidence
      - definition: Approval mismatch. No matching authorization
      - term: Submitted commitment
      - definition: 057f4205-b857-4e60-81a4-21e645b15f6d v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Result
      - definition: Filled at settlement. Simulated checkout
      - term: Record links
      - definition: Run d662185e-d151-4327-b4e3-3ba1d62497cb Rule 8674a22d-7af9-4151-bcbb-e54dc82744cc · occurrence 2026-11-03 Trail efca5a46-72ea-47c8-8864-16c5cd026caa
    - group:
      - text: s2-browser-proposal-4 · proposal only
      - term: Request
      - definition: Synthetic party requests 2 kaya toast and kopi covers on 2026-11-03, at S$5.44 each.
      - term: Bounded output
      - definition: Unavailable for this commitment Authored synthetic fixture, no model call
      - term: Proposed terms
      - definition: v1 · 2026-11-03 · 2 covers · S$5.44 each · S$10.88 total
      - term: Approval evidence
      - definition: Unavailable. No approval established
      - term: Submitted commitment
      - definition: None. Proposal only
      - term: Result
      - definition: Proposal only. No commitment or confirmed booking
      - term: Record links
      - definition: Run d662185e-d151-4327-b4e3-3ba1d62497cb Rule 8674a22d-7af9-4151-bcbb-e54dc82744cc · occurrence 2026-11-03 Trail b4c6ed40-6991-49c8-805c-c9fe63275153
  - group: What could the café offer next?
  - group: More about this demo
- contentinfo:
  - text: Backfill · Singapore
  - link "System diagnostics":
    - /url: /system
- alert
- complementary "Kopi guide":
  - text: Kopi
  - status: "Stored result: 8 covers filled. Sold out!"
  - button "Hide Kopi": ×
  - button "Move Kopi. Drag or use arrow keys."
```

# Test source

```ts
  9   | import { mintMerchant } from '../../src/lib/onboarding/links';
  10  | import { publishDraft, readMenu } from '../../src/lib/onboarding/service';
  11  | import { singaporeLocal } from '../../src/domain/singapore-time';
  12  | import { singaporeInstant } from '../../src/domain/commitments/occurrence';
  13  | import { call, connectBuyer, MENU, PHOTO, SETTINGS, submission } from '../support/proof-s1';
  14  | import { storeScriptedTrail } from '../support/proof-s2';
  15  | 
  16  | test('stored S2 trail on the real demo, with pending and settled pools, interrupted feed and recovery', async ({ page, baseURL }) => {
  17  |   test.setTimeout(240_000);
  18  |   const url = new URL(process.env.S1_ADMIN_URL ?? 'http://missing.invalid');
  19  |   expect([url.hostname, url.port]).toEqual(['127.0.0.1', '5432']);
  20  |   expect(url.pathname).toMatch(/^\/backfill_t_proof_s1_browser_/);
  21  |   const evidence = process.env.S2_EVIDENCE_DIR;
  22  |   if (!evidence) throw new Error('Use the isolated S2 launcher');
  23  |   const admin = connectDb(url.toString(), 4);
  24  |   const clients: Awaited<ReturnType<typeof connectBuyer>>[] = [];
  25  |   const errors: string[] = [];
  26  |   page.on('pageerror', error => errors.push(error.message));
  27  |   const local = singaporeLocal(new Date(Date.now() + 90_000));
  28  |   expect(local.minute).toBeLessThan(1379);
  29  |   const deadline = singaporeInstant(local.date, local.minute);
  30  |   const scenarios = [];
  31  |   let revoked = false;
  32  |   try {
  33  |     for (const count of [4, 3]) {
  34  |       const runId = randomUUID();
  35  |       const owner = await mintMerchant(admin.db, DEMO_MERCHANT_NAME);
  36  |       const draft = await readMenu(admin.db, owner.id, PHOTO, async () => MENU, 'fixture:s2-menu');
  37  |       if (!('draftId' in draft)) throw new Error('Missing draft');
  38  |       const terms = { ...SETTINGS, terms: { ...SETTINGS.terms, window: { weekday: local.weekday, startMinute: local.minute + 1, endMinute: local.minute + 60, commitByMinute: local.minute } } };
  39  |       const pub = await publishDraft(admin.db, owner.id, draft.draftId, terms);
  40  |       if (pub.status !== 'published') throw new Error('Publication failed');
  41  |       const ruleId = pub.ruleId;
  42  |       const parties = [];
  43  |       for (let i = 0; i < count; i++) {
  44  |         const agent = await mintAgent(admin.db, `s2-browser-${count}-${i}`, `Synthetic party ${i + 1}`);
  45  |         const client = await connectBuyer(agent.token, `${baseURL}/mcp`);
  46  |         clients.push(client);
  47  |         const at = new Date();
  48  |         const submitted = await call(client, 'submit_commitment', submission(ruleId, local.date, agent.id));
  49  |         if (!submitted.ok || !('commitment' in submitted)) throw new Error('MCP refused');
  50  |         const commitmentId = submitted.commitment.commitmentId;
  51  |         const variant = (['scripted', 'missing', 'changed_price', 'changed_version'] as const)[i]!;
  52  |         await storeScriptedTrail(admin.db, { runId, partyId: agent.id, ruleId, termsVersion: 1, visitDate: local.date, covers: 2, pricePerCoverCents: 544, totalCents: 1088 }, commitmentId, at, variant);
  53  |         parties.push({ client, commitmentId, agentId: agent.id, variant });
  54  |       }
  55  |       const proposal = await mintAgent(admin.db, `s2-browser-proposal-${count}`, 'Proposal only fixture');
  56  |       await storeScriptedTrail(admin.db, { runId, partyId: proposal.id, ruleId, termsVersion: 1, visitDate: local.date, covers: 2, pricePerCoverCents: 544, totalCents: 1088 }, null, new Date(), 'no_output');
  57  |       await page.goto('/demo');
  58  |       await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible();
  59  |       await expect(page.getByText('Minimum reached. Waiting for confirmation.', { exact: true })).toHaveCount(count === 4 ? 1 : 0);
  60  |       await expect(page.locator('.trail-party')).toHaveCount(count + 1);
  61  |       for (const detail of await page.locator('.trail-party').all()) await detail.locator('summary').click();
  62  |       await expect(page.getByText('Scripted authorization matches exact terms', { exact: true })).toHaveCount(1);
  63  |       await expect(page.getByText('Unavailable. No approval established', { exact: true })).toHaveCount(2);
  64  |       await expect(page.getByText('Approval mismatch. No matching authorization', { exact: true })).toHaveCount(count - 2);
  65  |       await expect(page.getByText('None. Proposal only', { exact: true })).toBeVisible();
  66  |       await expect(page.getByText('Pending. No confirmed booking yet', { exact: true })).toHaveCount(count);
  67  |       for (const width of [1280, 375]) {
  68  |         await page.setViewportSize({ width, height: 900 });
  69  |         expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  70  |         await page.screenshot({ path: `${evidence}/demo-${count}-pending-${width}.png`, fullPage: true });
  71  |       }
  72  |       const pending = await demoSnapshot(admin.db);
  73  |       scenarios.push({ ownerId: owner.id, runId, ruleId, count, parties, pending });
  74  |       await admin.db.update(merchants).set({ name: `Inactive S2 ${count}` }).where(eq(merchants.id, owner.id));
  75  |     }
  76  |     // The app's real clock and authenticated status route settle both pools.
  77  |     while (Date.now() <= deadline.getTime() + 100) await page.waitForTimeout(Math.min(1000, deadline.getTime() + 101 - Date.now()));
  78  |     const receipts = [];
  79  |     for (const s of scenarios) {
  80  |       for (const party of s.parties) expect(await call(party.client, 'get_commitment_status', { commitmentId: party.commitmentId })).toMatchObject({ ok: true, commitment: { status: s.count === 4 ? 'filled' : 'not_filled' } });
  81  |       await admin.db.update(merchants).set({ name: DEMO_MERCHANT_NAME }).where(eq(merchants.id, s.ownerId));
  82  |       await page.goto('/demo');
  83  |       for (const detail of await page.locator('.trail-party').all()) await detail.locator('summary').click();
  84  |       await expect(page.getByText(s.count === 4 ? 'Filled at settlement. Simulated checkout' : 'Not filled. No discounted booking or savings', { exact: true })).toHaveCount(s.count);
  85  |       if (s.count === 3) {
  86  |         await expect(page.getByText('No bookings were confirmed for this group.', { exact: true })).toBeVisible();
  87  |         await expect(page.getByText(/diners confirmed/)).toHaveCount(0);
  88  |       }
  89  |       await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-375.png`, fullPage: true });
  90  |       await page.setViewportSize({ width: 1280, height: 900 });
  91  |       await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-1280.png`, fullPage: true });
  92  |       const actual = await demoSnapshot(admin.db);
  93  |       expect(actual.scene?.pooled.filledCovers).toBe(s.count === 4 ? 8 : 0);
  94  |       expect(actual.ledger?.buyerShareCents).toBe(s.count === 4 ? 1088 : 0);
  95  |       const stream = await page.request.get('/demo');
  96  |       expect(await stream.text()).not.toMatch(/floorPrice|tokenSha|SCRIPTED S1 WONDER/);
  97  |       if (s.count === 4) {
  98  |         // Real storage permission loss interrupts the actual SSE reader. Restore in finally.
  99  |         await admin.db.execute(sql`REVOKE SELECT ON demo_trails FROM backfill_app`); revoked = true;
  100 |         await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible({ timeout: 10_000 });
  101 |         await expect(page.locator('.kopi-bubble')).toContainText('Results may be stale');
  102 |         await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
  103 |         await page.screenshot({ path: `${evidence}/demo-feed-interrupted.png`, fullPage: true });
  104 |         await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`); revoked = false;
  105 |         await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
  106 |         await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
  107 |         await page.screenshot({ path: `${evidence}/demo-feed-recovered.png`, fullPage: true });
  108 |         await page.context().setOffline(true);
> 109 |         await expect(page.getByText('Connecting to updates', { exact: true })).toBeVisible({ timeout: 10_000 });
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  110 |         await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
  111 |         await page.screenshot({ path: `${evidence}/demo-feed-disconnected.png`, fullPage: true });
  112 |         await page.context().setOffline(false);
  113 |         await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
  114 |         await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
  115 |         await page.route('**/api/demo/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"scene":{"phase":"cleared","pooled":{"unlocked":true}},"muse":null,"ledger":null}\n\n' }));
  116 |         await page.reload();
  117 |         await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible();
  118 |         await expect(page.locator('.trail-party')).toHaveCount(5);
  119 |         await page.screenshot({ path: `${evidence}/demo-malformed-feed.png`, fullPage: true });
  120 |         await page.unroute('**/api/demo/stream');
  121 |       }
  122 |       receipts.push({ runId: s.runId, count: s.count, ruleId: s.ruleId, parties: s.parties.map(p => ({ commitmentId: p.commitmentId, agentId: p.agentId, variant: p.variant })), pending: s.pending, settled: actual });
  123 |       await admin.db.update(merchants).set({ name: `Inactive settled S2 ${s.count}` }).where(eq(merchants.id, s.ownerId));
  124 |     }
  125 |     expect(await admin.db.select().from(llmCalls)).toEqual([]);
  126 |     expect(await admin.db.select().from(demoTrails)).toHaveLength(9);
  127 |     expect(errors).toEqual([]);
  128 |     await writeFile(`${evidence}/browser-receipt.json`, JSON.stringify({ provenance: 'authored synthetic requests/outputs and scripted approvals; actual HTTP MCP and stored settlement', deadline, date: local.date, modelCalls: 0, browserErrors: errors, feed: { interrupted: 'real SELECT permission loss', recovered: 'restored SELECT, no fresh animation', malformed: 'supplemental malformed SSE retained SSR view' }, receipts }, null, 2) + '\n');
  129 |   } finally {
  130 |     await page.context().setOffline(false);
  131 |     if (revoked) await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`);
  132 |     await Promise.all(clients.map(c => c.close()));
  133 |     await admin.close();
  134 |   }
  135 | });
  136 | 
```