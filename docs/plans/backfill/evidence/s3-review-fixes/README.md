# S3 review fixes mutation evidence

Mutation testing for the S3 review fixes on 2026-10-28, at `97c23e1`, with the runner [../s1-review/mutate.mjs](../s1-review/mutate.mjs).
Each mutation changes one guard, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores the file, checks it is byte-identical, and reruns the suite green.

A failing fast-check property reports "Property failed" on its first line, and Vitest's JSON report drops the error behind it.
The property file now sets `includeErrorInReport`, which adds that error on a "Got " line, and the runner counts a property as killed only when that line is an AssertionError.

| File | Holds |
|---|---|
| `mutations.json` | 8 mutations on the fixes: the engine before F1, the buyer's max filter and its boundary, the parse of the result, and the minimum pool within capacity in `MerchantRule` and in `rules_min_pool_within_capacity`, each removed and at its boundary |
| `results.json` | The full suite, baseline 114: all 8 killed on an AssertionError |
| `results-property-only.json` | The same 8 with `tests/unit/clearing.test.ts` removed, baseline 95: 7 killed, `f2-parse-removed` survived |
| `results-s3-set.json` | The 21 S3 mutations from [../s3-clearing](../s3-clearing/README.md) on the fixed tree: 17 killed, 4 no longer apply |
| `results-s3-set-property-only.json` | The same 21 with the unit test file removed: 15 killed, `min-pool-boundary` and `visit-date` survived, 4 no longer apply |

The 4 S3 mutations that no longer apply targeted code F1 replaced: `sort-canonical`, `sort-in-place`, `buyer-max-removed` and `buyer-max-boundary`.
The filter now copies the caller's array, and `f1-buyer-max-removed` and `f1-buyer-max-boundary` cover the buyer's max.

`f1-priced-out-in-pool` restores the engine before the fix: it fails the unit test "does not count a priced-out commitment toward its agent's cap" and the property "gives the same result with the commitments priced out by the buyer's max left out".
`f2-parse-removed` survives the properties alone because the generator makes unique ids and one valid date; the unit tests for a repeated id and a date that is not ISO kill it.
`min-pool-boundary` and `visit-date` survive the properties alone for the same reason: one visit date, and no property that says when a result must unlock.
Unit tests kill both.

The S3 exit criterion holds on the properties alone: with the unit test file removed, the properties kill `pool-bypassed` (the floor), `f1-buyer-max-removed` and `f1-buyer-max-boundary` (the buyer's max) and every capacity mutation on an AssertionError.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s3-review-fixes/mutations.json /path/to/results.json
```

For the property-only run, delete `tests/unit/clearing.test.ts` from the copy first.
`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
