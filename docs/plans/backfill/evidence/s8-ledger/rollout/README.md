# S8 production rollout, 2026-11-01

Application commit: `94dd8ede54ab009b762897c5ccee64ed5d82ad25`. CI run: [41302385552](https://github.com/jaydonnnk/backfill/actions/runs/41302385552). Render service `srv-dbfvsq2vcj2c73anqvqg`, deploy `dep-dbji6tbbc2fs73dfovs0`, verified Live. Auto-Deploy was enabled; no settings change or duplicate manual deploy was required.

The user explicitly authorized the selected S8 main push and Render rollout. Earlier S8 production-write authorization remained valid. All operations used the existing Neon CLI sign-in; no local secret file or connection URI was displayed. Operator commands ran from empty temporary working directories with a minimal environment and explicit project/branch selection.

1. Verified fresh 13-migration, 14-fill, zero-ledger inventory and protected fingerprints against the prepared source. Existing migration SQL hashes matched.
2. Confirmed the deployed S8 route returned 401, then applied only migration 0013. Verified 14 migrations, ALWAYS guards and SELECT/INSERT-only runtime ledger/receipt grants.
3. Applied the bounded two-rule S7 historical backfill. Fourteen entries reconcile to 32 covers, 17408 cents accepted total and 4352 cents buyer savings, zero fees. Other counts and protected fingerprints were unchanged.
4. Seeded one clearly labelled simulated merchant/rule/buyer/commitment with an earlier test clock. Hosted HTTP created its clearing and ledger, then completed three simultaneous simulation requests with one identical receipt. Ownership, missing IDs, no authentication and revocation checks passed. No model or payment provider was invoked.
5. Revoked only the new verification agent and retired only its new rule by raising its private floor to list price under the rule lock. Its ledger/receipt are retained audit data; the offer is absent from discovery.
6. Verified global 15 fills = 15 unique ledger rows, no missing/orphan/mismatched entries, four valid ledger CHECK constraints, one simulated receipt and unchanged four existing model-call rows. The real Muse commitment remains two covers pending in its separate pool.

No production merchant browser was mounted. The public demo was observed Live with simulated/replay labels. Frozen S7 files and migrations 0000 through 0012 remain unchanged. S9, paid recording and real payments remain outside this rollout.
