# S3 clearing engine mutation evidence

Mutation testing for S3 on 2026-10-28, with the S1 review runner [../s1-review/mutate.mjs](../s1-review/mutate.mjs).
Each mutation changes one guard in `src/domain/clearing/clear.ts`, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores the file, checks it is byte-identical, and reruns the suite green.

| File | Holds |
|---|---|
| `mutations.json` | 21 mutations: arrival order and its tie-break, the copy of the caller's array, the use of `evaluatePool`'s accepted commitments, the buyer's max price, capacity, whole-commitment fills, the minimum pool after trimming, the empty fills of a locked result, and the price, terms version and date the result names |
| `results.json` | Their results: a baseline of 109 passing tests, and all 21 killed on an AssertionError, each restored byte-identical with the rerun green |

The property tests in `tests/unit/clearing.property.test.ts` run 2000 cases per property with fast-check seed `20261028`.
At least one property fails under 18 of the 21 mutations; under `sort-in-place`, `min-pool-boundary` and `visit-date` only unit tests fail.
A failing property usually reports "Property failed" on its first line rather than an AssertionError, so the AssertionError behind each kill comes from at least one unit test in `tests/unit/clearing.test.ts`.
A first test of the property file checks that the generator is not vacuous: with this seed, 306 cases unlock, 140 unlock after capacity or a buyer's max dropped an accepted commitment, and 219 are unlocked by `evaluatePool` but left locked by clearing.

A first run had one survivor, `visit-date`, which pinned the result's date to `2026-11-03`: every test cleared that date.
A unit test that clears the next week's occurrence was added, and the rerun killed it.

The hidden floor, the terms version, the window, the deadline and the per-agent cap are guarded once, in `evaluatePool`, and clearing does not repeat them.
Their mutations are in [../s2-schema-offers](../s2-schema-offers/README.md); here, `pool-bypassed` shows that clearing fills nothing `evaluatePool` refused, and the property "never clears below the hidden floor" kills it.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s3-clearing/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
