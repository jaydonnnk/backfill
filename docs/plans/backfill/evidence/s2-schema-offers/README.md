# S2 schema and offers mutation evidence

Mutation testing for S2 on 2026-10-28, with the S1 review runner [../s1-review/mutate.mjs](../s1-review/mutate.mjs).
Each mutation changes one guard, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores the file, checks it is byte-identical, and reruns the suite green.

| File | Holds |
|---|---|
| `mutations.json` | 101 mutations: the domain schemas and rule evaluation, the migration's checks, keys and triggers, and the hermetic test environment |
| `results.json` | Their results |

Migration mutations edit the SQL files in `drizzle/`, which every integration test file applies to its own fresh database, so a mutated check or trigger is what the tests run against.

`hermetic-env` is killed only in a shell that exports the app's configuration (as this machine's does): there, without the guard, the health unit test reaches the real `DATABASE_URL`.
In CI, which sets no app configuration, that mutation would survive.

Bounds that other guards already imply have no guard of their own, so there is nothing to mutate:
- `Window.startMinute >= 0` follows from `0 <= commitByMinute <= startMinute`; the SQL check is written the same way.
- `LedgerEntry.savingsCents` needs no sign or integer check: the shares are non-negative integers that add up to it.
- A ledger price above the list price makes the savings negative, which the non-negative shares refuse.
- `rules.terms_version >= 1`: the trigger sets 1 on insert and only ever adds 1. A first run of 102 mutations had this check as the one survivor, so the check was removed and the remaining 101 rerun.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s2-schema-offers/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
