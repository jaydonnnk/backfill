# S9 offline verification

Branch `backfill/slice-9-evaluations`, based on main `745184b`. No commit/push/deployment or production write performed.

- 442 tests across 45 files passed with an explicit disposable local PostgreSQL URL and two workers. New tests exercise guard replay, corrupted evidence, unknown costs, equal inputs, bounded failure attempts, paid-response persistence, storage failure, exclusive durable output, full synthetic stored pipeline and exact run-scoped joins.
- Typecheck and lint passed. Secret-free production build passed with webpack in `/tmp/backfill-s9-preview`.
- Browser inspected the empty page and labelled synthetic results; Enter expands the native episode disclosure. At 375px the document's scroll width and viewport width both measured 375px. No browser error logs were returned.
- Shared Kopi appears with empty/synthetic guidance. No mascot/provider changes. Dark and reduced-motion CSS remains inherited; runtime preference emulation was not available and is not claimed.
- Independent review identified late config validation, positional model labels, missing final checkpoint and incomplete persistence orchestration. Fixed with preflight validation, actual model IDs, a final checkpoint, and exclusive fsynced journal/result files. Full suite passed after fixes; no second independent review claimed.
- Screenshots are local development output. Synthetic comparisons/call IDs/costs are not actual model results.

The preview is a secret-free copy at http://127.0.0.1:3192/evals and the development-only fixture at http://127.0.0.1:3192/evals?preview=synthetic. See `evals/agenticpay/README.md` for policy and activation limits.

Final HTTP checks: production build at http://127.0.0.1:3193/evals?preview=synthetic returned 200 with the empty state and no fixture banner. `cli.ts --paid` refused execution. The production-build empty page is left open for review at http://127.0.0.1:3193/evals.

## Actual measured run review, 2026-11-02

The latest secret-free production preview is http://127.0.0.1:3194/evals. It selects the authorized actual run only in `/tmp/backfill-s9-results-preview`, verifies all thirteen call rows against the isolated local evaluation database, and shows `FAILED RUN` with three Spark failures and one DeepSeek failure. No chart/winner is rendered. Keyboard expansion shows the failed round and stored call ID. The measured mobile view reports viewport/scroll width 375/375. `measured-desktop.jpg` and `measured-mobile.jpg` are actual failed-run evidence, unlike the earlier synthetic fixture screenshots. The one-use attempt and results remain frozen. Current code checks: 447 tests in 46 files, typecheck, lint and production build passed.
