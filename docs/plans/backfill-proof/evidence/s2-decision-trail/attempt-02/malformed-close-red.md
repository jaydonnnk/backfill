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

Locator: getByText('Updates paused · last saved view', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Updates paused · last saved view', { exact: true }) with timeout 5000ms
  - waiting for getByText('Updates paused · last saved view', { exact: true })

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
  - status: Connecting to updates
  - region "Group booking progress":
    - paragraph: Backfill Demo Cafe
    - heading "A better price, together." [level=2]
    - paragraph: S$5.44 per person
    - paragraph: S$6.80 20% off
    - term: Visit
    - definition: 2026-11-03 12:11–13:10 SGT
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
    - group: s2-browser-4-0 · filled
    - group: s2-browser-4-1 · filled
    - group: s2-browser-4-2 · filled
    - group: s2-browser-4-3 · filled
    - group: s2-browser-proposal-4 · proposal only
  - group: What could the café offer next?
  - group: More about this demo
- contentinfo:
  - text: Backfill · Singapore
  - link "System diagnostics":
    - /url: /system
- alert
- complementary "Kopi guide":
  - text: Kopi
  - status: Connecting to the stored scene.
  - button "Hide Kopi": ×
  - button "Move Kopi. Drag or use arrow keys."
```

# Test source

```ts
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
  82  |       if (s.count === 4) await replanSoldOut(admin.db, { id: s.ownerId, name: DEMO_MERCHANT_NAME }, async () => ({ ...PLAN, rationale: 'S2_MERCHANT_ONLY_CANARY private floor S$5.03' }), 'fixture:s2-wonder');
  83  |       await page.goto('/demo');
  84  |       for (const detail of await page.locator('.trail-party').all()) await detail.locator('summary').click();
  85  |       await expect(page.getByText(s.count === 4 ? 'Filled at settlement. Simulated checkout' : 'Not filled. No discounted booking or savings', { exact: true })).toHaveCount(s.count);
  86  |       if (s.count === 3) {
  87  |         await expect(page.getByText('No bookings were confirmed for this group.', { exact: true })).toBeVisible();
  88  |         await expect(page.getByText(/diners confirmed/)).toHaveCount(0);
  89  |       }
  90  |       await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-375.png`, fullPage: true });
  91  |       await page.setViewportSize({ width: 1280, height: 900 });
  92  |       await page.screenshot({ path: `${evidence}/demo-${s.count}-settled-1280.png`, fullPage: true });
  93  |       const actual = await demoSnapshot(admin.db);
  94  |       expect(actual.scene?.pooled.filledCovers).toBe(s.count === 4 ? 8 : 0);
  95  |       expect(actual.ledger?.buyerShareCents).toBe(s.count === 4 ? 1088 : 0);
  96  |       const html = await page.request.get('/demo');
  97  |       expect(await html.text()).not.toMatch(/floorPrice|tokenSha|SCRIPTED S1 WONDER|S2_MERCHANT_ONLY_CANARY|5\.03/);
  98  |       const controller = new AbortController();
  99  |       const response = await fetch(`${baseURL}/api/demo/stream`, { signal: controller.signal });
  100 |       const reader = response.body?.getReader();
  101 |       if (!reader) throw new Error('Missing SSE body');
  102 |       let publicSse = '';
  103 |       try {
  104 |         while (!publicSse.includes('data: ')) {
  105 |           const chunk = await reader.read();
  106 |           if (chunk.done) throw new Error('SSE ended before snapshot');
  107 |           publicSse += new TextDecoder().decode(chunk.value);
  108 |         }
  109 |         expect(publicSse).not.toMatch(/floorPrice|tokenSha|SCRIPTED S1 WONDER|S2_MERCHANT_ONLY_CANARY|5\.03/);
  110 |         expect(publicSse).toContain(s.ruleId);
  111 |       } finally { await reader.cancel(); controller.abort(); }
  112 |       if (s.count === 4) {
  113 |         // Real storage permission loss interrupts the actual SSE reader. Restore in finally.
  114 |         await admin.db.execute(sql`REVOKE SELECT ON demo_trails FROM backfill_app`); revoked = true;
  115 |         await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible({ timeout: 10_000 });
  116 |         await expect(page.locator('.kopi-bubble')).toContainText('Results may be stale');
> 117 |         await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
      |                                                                                           ^ Error: expect(locator).toBeVisible() failed
  118 |         await page.screenshot({ path: `${evidence}/demo-feed-interrupted.png`, fullPage: true });
  119 |         await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`); revoked = false;
  120 |         await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
  121 |         await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
  122 |         await page.screenshot({ path: `${evidence}/demo-feed-recovered.png`, fullPage: true });
  123 |         await page.context().setOffline(true);
  124 |         await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible({ timeout: 10_000 });
  125 |         await expect(page.getByText('Filled at settlement. Simulated checkout', { exact: true })).toHaveCount(4);
  126 |         await page.screenshot({ path: `${evidence}/demo-feed-disconnected.png`, fullPage: true });
  127 |         await page.context().setOffline(false);
  128 |         await expect(page.getByText('Latest saved bookings', { exact: true })).toBeVisible({ timeout: 10_000 });
  129 |         await expect(page.locator('.kopi-companion')).not.toHaveAttribute('data-motion');
  130 |         await page.route('**/api/demo/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"scene":{"phase":"cleared","pooled":{"unlocked":true}},"muse":null,"ledger":null}\n\n' }));
  131 |         await page.reload();
  132 |         await expect(page.getByText('Updates paused · last saved view', { exact: true })).toBeVisible();
  133 |         await expect(page.locator('.trail-party')).toHaveCount(5);
  134 |         await page.screenshot({ path: `${evidence}/demo-malformed-feed.png`, fullPage: true });
  135 |         await page.unroute('**/api/demo/stream');
  136 |       }
  137 |       receipts.push({ runId: s.runId, count: s.count, ruleId: s.ruleId, parties: s.parties.map(p => ({ commitmentId: p.commitmentId, agentId: p.agentId, variant: p.variant })), pending: s.pending, settled: actual });
  138 |       await admin.db.update(merchants).set({ name: `Inactive settled S2 ${s.count}` }).where(eq(merchants.id, s.ownerId));
  139 |     }
  140 |     expect(await admin.db.select().from(llmCalls)).toEqual([]);
  141 |     expect(await admin.db.select().from(demoTrails)).toHaveLength(9);
  142 |     expect(errors).toEqual([]);
  143 |     await writeFile(`${evidence}/browser-receipt.json`, JSON.stringify({ provenance: 'authored synthetic requests/outputs and scripted approvals; actual HTTP MCP and stored settlement', deadline, date: local.date, modelCalls: 0, browserErrors: errors, feed: { interrupted: 'real SELECT permission loss', recovered: 'restored SELECT, no fresh animation', malformed: 'supplemental malformed SSE retained SSR view' }, receipts }, null, 2) + '\n');
  144 |   } finally {
  145 |     await page.context().setOffline(false);
  146 |     if (revoked) await admin.db.execute(sql`GRANT SELECT ON demo_trails TO backfill_app`);
  147 |     await Promise.all(clients.map(c => c.close()));
  148 |     await admin.close();
  149 |   }
  150 | });
  151 | 
```