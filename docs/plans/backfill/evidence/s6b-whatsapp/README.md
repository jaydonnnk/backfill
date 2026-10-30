# S6b WhatsApp evidence

Evidence for S6b on 2026-10-30: the mutation runs.

| File | Holds |
|---|---|
| `mutations.json` | 113 mutations of the final list: the owner-change bounds, reading YES, NO and LINK, the webhook signature and subscription check, the settings, the service's windows, caps and lookups, every guard in `apply_owner_change`, `cancel_owner_change` and `claim_whatsapp_link`, their grants and revokes, the append-only and no-truncate triggers of all five tables, and their CHECK and UNIQUE constraints |
| `results.json` | The final run, at `0d75d76`, baseline 319 (all pass): all 113 killed on an AssertionError, each file restored byte-identical, each rerun green |
| `results-first-run.json` | The first run, at `d8a6c81`, baseline 317, against the first list: 97 killed on an AssertionError, 12 survived, 4 killed only by an error, 4 reruns not green |
| `results-second-run.json` | The second run, at `1681501`, baseline 319, against the revised list: 111 killed, 2 killed only by an error, every rerun green |

A mutation counts as killed only if a test fails on an AssertionError.
The runner restores every file it changed, checks each is byte-identical, and reruns the suite.

## First run

The 12 survivors and 4 errors were closed in `1681501` and `0d75d76`:
- Tests added: `ok` as a confirmation, a settings object with one WhatsApp value missing, a 100% discount against a floor of 0 (the price check had hidden the discount bound), a link-code hash of the wrong length, and the runtime role's own INSERT grants.
- Two guards were redundant and were simplified, not tested: the SQL lower bound on capacity (the minimum pool bound already needs capacity of at least 1) and a second "not linked" check in the service.
- Three truncate mutations survived because `TRUNCATE ... CASCADE` reaches a dependent table whose own trigger refuses it; they now remove the dependents' triggers too, as in S6.
- One mutation was invalid (it left a dangling array in `src/env.ts`) and was rewritten.
- 4 reruns were not green on unmutated files: the floor-leak check searched JSON holding random UUIDs for the floor's digits `487`, which two random UUIDs contain by chance; the ids are now stripped first.
This is also the likely cause of the one baseline failure the runner showed at the start; it did not repeat in 3 plain full runs and in the runs afterwards.

## Second run

2 of 113 were killed only by a thrown error: `sql-grant-insert` (the setup needed the grant it removed) and `svc-unlinked-null`.
The grant test now sets up as the owner role, and the unlinked-number test turns a throw into the value "threw".

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
env -u DATABASE_URL TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s6b-whatsapp/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
