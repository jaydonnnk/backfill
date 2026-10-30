# S6 onboarding evidence

Evidence for S6 on 2026-10-30: mutation runs, the live script's mutations, and the synthetic menu photo.

| File | Holds |
|---|---|
| `menu.svg`, `menu.png` | The synthetic menu of "Singapore Test Restaurant", 12 items in SGD; the PNG is the SVG rendered by `qlmanage -t -s 1600` |
| `mutations.json` | 106 mutations: image parts in the provider, the photo sniff and limit, the strict `MenuDraft`, each `judgeDraft` refusal and the price sum, the publish floor, the strict `WonderPlan` and each `judgePlan` bound, Wonder's prompt (history, plans, no floor), the read and plan caps, locks and 24-hour window, the stored photo hash, the publish race, once-per-sellout planning, the sold-out rule, every `APPLY_REFUSALS` entry, every clause of `menu_drafts_price_matches`, `publish_offer` and `apply_wonder_plan`, the photo size check, the append-only triggers and their `ENABLE ALWAYS`, and the grants |
| `results.json` | The final run, at `9069c3a`, baseline 244: all 106 killed on an AssertionError, each restored byte-identical, each rerun green |
| `results-second-run.json` | The second run, at `9c3e0ac`, baseline 243: 105 killed on an AssertionError and 1 by a non-assertion error, every rerun green |
| `mutations-first-run.json`, `results-first-run.json` | The first run, at `0022e07`, baseline 232: 68 killed, 31 survived, 7 killed only by a non-assertion error, and 3 reruns not green |
| `mutations-live.json` | 8 mutations of `npm run onboarding:live`: the local-only refusal, both spend-cap checks, the US$1.00 default, the runtime-role login, dropping the scratch database and role, and the floor-hidden report |
| `results-live.json` | The final run, at `9069c3a`, baseline 244: all 8 killed on an AssertionError, each restored byte-identical, each rerun green |
| `results-live-second-run.json` | The run at `9c3e0ac`: 7 killed, `live-floor-report` survived |
| `live-run.txt` | The output of the live run on 2026-10-30, below |
| `seed-ui.ts` | Seeds a throwaway local database for the browser check of the merchant pages; local only |

A mutation counts as killed only if a test fails on an AssertionError.
The runner restores every file it changed, checks each is byte-identical, and reruns the suite.
It now also names the tests that failed in a rerun that was not green.

## First run

The 31 survivors and 7 non-assertion kills were closed in `1c56e60`:
- Pinned to literal values, since the tests used the constants: the 4 MiB photo limit (`photo-limit-size`) and the database check behind it (`db-photo-bytes`), the daily caps of 30 (`menu-cap-size`, `plan-cap-size`), capacity growth to twice (`plan-growth`).
- Not reached by any test: the 24-hour cap window (`cap-day`), the stored photo hash (`menu-hash`), a JPEG with only two marker bytes (`sniff-jpeg-short`), an extra field in a plan (`plan-strict`), the planning lock (`plan-lock`), 3 plans per pass (`plans-per-pass`), a capacity-only plan applied twice (`apply-map-applied`), a cover with some or no items (`sql-price-found`, `sql-price-empty`), `publish_offer` with a draft that did not count (`sql-publish-verdict`), a stored plan with a per-agent cap of 0 (`sql-apply-cap-min`) or under a raised floor (`sql-apply-floor`), and `PUBLIC`'s right to run either function (`sql-publish-revoke`, `sql-apply-revoke`).
- `publish-race-mapping`: no test raced two publishes of one draft; one now holds the first publication uncommitted until the second waits on its key.
- The 9 `ENABLE ALWAYS` survivors: no test ran under `session_replication_role = replica`; every append-only, truncate and price check now does too.
- `sql-menu_drafts-no-truncate`, `sql-wonder_plans-no-truncate` and their two `ENABLE ALWAYS` mutations: a TRUNCATE of `menu_drafts` or `wonder_plans` must CASCADE to `offer_publications` or `plan_applications`, whose own trigger refuses it, so removing one trigger changes nothing.
These four now remove the child table's trigger too.
- The 7 non-assertion kills threw instead of returning a wrong status; those tests now turn a throw into the value "threw", and the privilege test checks the grants directly.

The 3 reruns that were not green ran unmutated files.
The most likely cause is the listOffers leak check, which grepped JSON holding two random UUIDs for the floor's digits `917`; two random UUIDs contain `917` about 1.2% of the time, so about 2.5 of 212 suite runs would fail.
The ids are now stripped first; the live script's own floor check strips them too.
40 plain runs of both S6 integration files after the fix were green.

## Second run

At `9c3e0ac`, 105 of 106 were killed on an AssertionError and every rerun was green.
`grant-publish` was killed only by errors: without EXECUTE, the new race test's racing publish failed at once instead of waiting, so the test timed out and handed the admin pool's only connection back inside an open transaction, and every later test in the file timed out before reaching its assertion.
The race test now stops polling once the racing call answers and rolls back if it never committed (`9069c3a`).

Of the live script's 8 mutations, `live-floor-report` survived: no test showed the check a buyer view that held the floor.
The check is now the function `floorHidden`, tested with the floor shown by name, by price, and spelled only inside an id.

## Final run

At `9069c3a`, baseline 244 (147 unit, 97 integration): all 106 mutations and all 8 live-script mutations killed on an AssertionError, every file restored byte-identical and every rerun green.

## Live run

`npm run onboarding:live -- postgres://postgres@127.0.0.1:5432/postgres` at `d6e46f1`, 2026-10-30T13:04Z, with `muse-spark-1.3` and `muse-wonder-1.0` through the Meta API, on a scratch local database (no Neon write); the user authorized it as "Run live calls".
- Spark read the photo on its first attempt: all 12 items, every name and SGD price exactly as printed, and picked Hainanese Chicken Rice and Kopi C as the cover, so the list price is S$8.30.
This settles the image format: OpenAI-style `image_url` data-URL parts are accepted by Meta's API.
- The draft published at 25% off, S$6.23, with a hidden floor of S$5.81 (70% of S$8.30); the buyer view showed neither.
- Two agents filled all 4 covers of 2026-11-03; Wonder planned 20% off, 6 covers, a pool of 3 and 2 per agent on its first attempt, judged `ok`, and the plan applied as terms version 2.
- 2 calls: Spark 3,798 tokens in and 1,339 out, 7.8 s, US$0.010438; Wonder 214 in and 822 out, 8.0 s, US$0.017296; US$0.027734 in all against the US$1.00 cap.
- The scratch database and role were dropped.
- Wonder's rationale was only "sold out", not the two sentences citing the fill history the schema describes; the schema checks only its length.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
env -u DATABASE_URL TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s6-onboarding/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
The `live-drops-db` and `live-drops-role` mutants leave a scratch database or role on that server; drop them by hand after the run.
