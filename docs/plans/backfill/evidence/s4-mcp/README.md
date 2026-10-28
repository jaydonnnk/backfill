# S4 MCP server mutation evidence

Mutation testing for S4 on 2026-10-28, at `5b00ee6`, with the runner [../s1-review/mutate.mjs](../s1-review/mutate.mjs).
Each mutation changes one guard, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores the file, checks it is byte-identical, and reruns the suite green.

| File | Holds |
|---|---|
| `mutations.json` | 47 mutations: Singapore occurrences, bearer auth, the floor kept out of every reply, every submit refusal and its boundary, the per-agent cap and its lock, idempotency, the stored clearing and its lock, cancel and its deadline, the strict reply schemas, the migration 0005 triggers and the runtime role's grants |
| `results.json` | The full suite, baseline 145: all 47 killed on an AssertionError, each restored byte-identical, each rerun green |

A first run, at `bedf124`, gave 42 killed, 1 survived and 4 killed otherwise.
Two were a runner bug: it wrote a mutation with `String.replace` and a string, which turns `$$` into `$` and broke the SQL dollar quoting; the runner now uses a replacer function.
Two were mutations of mine that broke inserts or kept the trigger raising (`BEFORE INSERT`, `AFTER TRUNCATE`); they now add `WHEN (false)`.
One was tests dereferencing a refused submit, which crashed with a TypeError; they now assert the submit was accepted first.

`submit-agent-lock` and `clearing-lock` remove a lock, and their tests rely on simultaneous requests racing.
They were killed in both runs, but a race is not certain to happen, so these two kills are likely rather than guaranteed.

The TRUNCATE trigger on `clearings` was removed rather than kept unproven: `clearing_fills` references `clearings`, so a TRUNCATE without CASCADE is refused by the foreign key, and one with CASCADE reaches the `clearing_fills` trigger, which `db-fills-no-truncate` proves.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s4-mcp/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
