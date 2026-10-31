# S6 and S6b review fixes: mutation evidence

Run at `f1e5df4` on `backfill/slice-6-review-fixes`, on a `git archive` copy of the tree with `node_modules` copied by `cp -cR`, with `DATABASE_URL` unset and `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`.
Command: `node docs/plans/backfill/evidence/s1-review/mutate.mjs <copy> docs/plans/backfill/evidence/s6-review-fixes/mutations.json docs/plans/backfill/evidence/s6-review-fixes/results.json`.

Baseline: 324 tests green.
Result: all 6 mutations killed on an AssertionError, each file restored byte-identical and each rerun green ([results.json](results.json)).

| Mutation | Guard | Killed by |
| --- | --- | --- |
| `f1-rule-owner-check` | `apply_owner_change` refuses a change whose rule is another merchant's (migration `0012`) | "refuses in SQL a change filed under one merchant that points at another merchant's rule" |
| `f4-settle-in-dashboard` | the dashboard settles due occurrences | "settles an occurrence whose deadline has passed though no buyer asked for its status, ..." |
| `f4-settle-in-apply` | `applyPlan` settles due occurrences first | "settles a due occurrence before applying a plan, ..." |
| `f4-settle-in-confirm` | a WhatsApp `YES` settles due occurrences first | "settles a commitment whose deadline has passed before confirming, ..." |
| `f4-deadline-boundary` | an occurrence settles exactly at its deadline | the dashboard test, at 12:00:00 |
| `f4-deadline-ignored` | an occurrence before its deadline is not settled | the dashboard test, at 11:59:59 |

Left out as equivalent, so not guards: dropping `not exists (... clearings ...)` in `settleDue` (`ensureClearing` already returns a stored clearing), and dropping `c.cancelled_at is null` (an occurrence with only cancelled commitments would be stored as not unlocked, which is what it is).
