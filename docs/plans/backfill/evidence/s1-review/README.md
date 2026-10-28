# S1 review mutation evidence

Mutation testing for the S1 review on 2026-10-28.
Each mutation changes one guard, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores the file, checks it is byte-identical, and reruns the suite green.

| File | Holds |
|---|---|
| `mutate.mjs` | The runner |
| `mutations-before-fixes.json` | 43 mutations run against `main` at `f5d3b8f`, before the review fixes |
| `results-before-fixes.json` | Their results: 28 killed, 3 killed without an AssertionError, 12 survived |
| `mutations.json` | 46 mutations run against the fixed tree |
| `results.json` | Their results |

`killed-not-assertion` means a test failed, but on a thrown error or an unrejected promise rather than an assertion, so the guard was not proven.
`survived` means no test failed at all.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s1-review/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
