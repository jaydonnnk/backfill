# Declared-build failure resolved, 2026-11-04

The verification runner's default dependency copy converted the relative
`.bin/next` link into an absolute link to the original repository. Compilation
used the snapshot's Next package, while prerendering used the original renderer.
Their separate React objects caused the null hook dispatcher. This was a
snapshot-copy defect; no KopiProvider defect was established.

The [unchanged-runner failure](baseline/copied-installed-dependencies.txt) is
retained. The [raw observer log](trace/trace.txt) and
[stack/object excerpt](react-runtime-evidence.json) show the snapshot hook with a
null dispatcher and the repository renderer with an active dispatcher in a
different React object. The [copy self-check](copy-symlink-proof.json) independently
proves that default copying redirects the CLI and preserving symlinks keeps it
inside the copy. A first self-check assertion compared `/var` to `/private/var`;
canonicalizing both paths corrected that diagnostic assertion.

The [small runner fix](runner-fix.patch) preserves relative symlinks and checks
the copied CLI target. The [final uninstrumented declared build](final-declared/copied-installed-dependencies.txt)
passes. Its [manifest](final-declared/source-manifest.json) verifies 115 unchanged
source/assets/configuration files; [CLI resolution](final-declared/dependency-resolution.json)
and [all 19 loopback fonts](final-declared/font-transport.json) are recorded.
[Cleanup](final-declared/cleanup.json) confirms the owned database and scratch
copy were removed. [Cached-package comparison](dependency-provenance.json)
checks three relevant Next files and the cached archive's lockfile integrity.
No dependency was installed or modified.

The original diagnosis was independently reviewed by gpt-6-astra with no material
flags. Generated server bundles, exploratory runner sources and redundant logs
are retained locally under the [publication retention policy](../retention.json).
The earlier minimal-app sources were deleted before this diagnosis, so their
exact copy methods remain unknown. Their logs do not substitute for the full
real-source build above. Current full S7 acceptance is recorded in the
[parent evidence package](../README.md).
