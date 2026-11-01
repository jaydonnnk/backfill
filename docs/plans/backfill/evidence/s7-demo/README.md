# S7 mutation evidence

Mutations in [mutations.json](mutations.json), results in [results.json](results.json).
Run with `docs/plans/backfill/evidence/s1-review/mutate.mjs` on a `git archive` copy of the tree, with `node_modules` copied by `cp -cR`, `env -u DATABASE_URL` and `TEST_DATABASE_URL` on the local PostgreSQL.

- First run, at `2668eda`: 14 of 15 killed; `snapshot-fill-outcome` survived, because the scene test checked the outcomes the MCP server returned, not the ones the demo screen shows.
- The test now also asserts the screen's filled and not-filled buyers.
- Second run, at the commit that added that assertion: all 15 killed on an AssertionError, each file restored byte-identical and each rerun green.

## Live demo captures

Taken on the Render URL after the replay exit on 2026-11-01, over CDP with the viewport set to 375x812 and 1280x900, full page:

- [demo-375.png](demo-375.png)
- [demo-1280.png](demo-1280.png)

Both show the solo list at 0 of 11, the pooled 30 covers with 16 filled and sold out, Wonder's plan, and the real Muse card. Neither page text contains "floor" or the floor price S$5.00, and `scrollWidth` equals `clientWidth` at both widths.
