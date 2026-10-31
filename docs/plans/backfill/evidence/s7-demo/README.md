# S7 mutation evidence

Mutations in [mutations.json](mutations.json), results in [results.json](results.json).
Run with `docs/plans/backfill/evidence/s1-review/mutate.mjs` on a `git archive` copy of the tree, with `node_modules` copied by `cp -cR`, `env -u DATABASE_URL` and `TEST_DATABASE_URL` on the local PostgreSQL.

- First run, at `2668eda`: 14 of 15 killed; `snapshot-fill-outcome` survived, because the scene test checked the outcomes the MCP server returned, not the ones the demo screen shows.
- The test now also asserts the screen's filled and not-filled buyers.
- Second run, at the commit that added that assertion: all 15 killed on an AssertionError, each file restored byte-identical and each rerun green.
