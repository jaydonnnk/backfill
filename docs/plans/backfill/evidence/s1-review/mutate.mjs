// Mutation runner for the S1 review (docs/plans/backfill/evidence/s1-review). Applies each
// mutation to a copy of the tree, runs the full unit and integration suite, records
// whether a test failed on an AssertionError, restores each file byte-identical and confirms the
// restore. Usage: node mutate.mjs <tree> <mutations.json> <results.json>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const [tree, mutationsPath, resultsPath] = process.argv.slice(2);
const mutations = JSON.parse(readFileSync(mutationsPath, "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

function runSuite(project) {
  const out = join(tree, ".vitest-result.json");
  const args = ["vitest", "run", "--config", "config/vitest.config.ts", "--reporter=json", `--outputFile=${out}`];
  if (project) args.push("--project", project);
  try {
    execFileSync("npx", args, { cwd: tree, stdio: "ignore", env: { ...process.env } });
  } catch {}
  const r = JSON.parse(readFileSync(out, "utf8"));
  // A failing fast-check property reports "Property failed" first. The JSON report drops the
  // error's cause, so property files set includeErrorInReport, which adds the error on a later
  // "Got " line; the assertion check reads that line too, never a stack frame.
  const cause = (m) => (m.split("\n").find((l) => l.startsWith("Got ")) ?? "").slice("Got ".length);
  const failed = r.testResults.flatMap((f) =>
    f.assertionResults.filter((a) => a.status === "failed").map((a) => ({ test: a.fullName, msg: (a.failureMessages[0] ?? "").split("\n")[0], cause: cause(a.failureMessages[0] ?? "") })),
  );
  const fileErrors = r.testResults.filter((f) => f.status === "failed" && f.assertionResults.every((a) => a.status !== "failed")).map((f) => f.message.split("\n")[0]);
  return { passed: r.numPassedTests, failed, fileErrors };
}

const baseline = runSuite();
if (baseline.failed.length || baseline.fileErrors.length) throw new Error("baseline not green");
const results = [];
for (const m of mutations) {
  // A mutation is one edit (file, from, to) or several (edits), all applied before the suite runs:
  // several edits remove two guards that cover each other, such as an app check and its trigger.
  const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
  const originals = new Map();
  for (const e of edits) {
    const path = join(tree, e.file);
    if (!originals.has(path)) originals.set(path, readFileSync(path));
  }
  const texts = new Map([...originals].map(([path, b]) => [path, b.toString("utf8")]));
  const misses = edits.map((e) => ({ e, hits: texts.get(join(tree, e.file)).split(e.from).length - 1 })).filter((x) => x.hits !== 1);
  if (misses.length) {
    results.push({ id: m.id, error: misses.map((x) => `${x.e.file}: pattern found ${x.hits} times`).join("; ") });
    continue;
  }
  // A replacer function, so "$$" in a mutation (SQL dollar quoting) is written as it is, not as "$".
  for (const e of edits) {
    const path = join(tree, e.file);
    texts.set(path, texts.get(path).replace(e.from, () => e.to));
  }
  for (const [path, text] of texts) writeFileSync(path, text);
  const mutated = runSuite();
  for (const [path, b] of originals) writeFileSync(path, b);
  const restored = [...originals].every(([path, b]) => sha(readFileSync(path)) === sha(b));
  const rerun = runSuite();
  const assertionKill = mutated.failed.some((f) => /AssertionError/.test(f.msg) || (/^Error: Property failed/.test(f.msg) && /^AssertionError/.test(f.cause)));
  results.push({
    id: m.id,
    guard: m.guard,
    verdict: assertionKill ? "killed" : mutated.failed.length || mutated.fileErrors.length ? "killed-not-assertion" : "survived",
    failedTests: mutated.failed.map((f) => `${f.test} :: ${f.msg}${f.cause ? ` :: caused by ${f.cause}` : ""}`),
    fileErrors: mutated.fileErrors,
    restoredByteIdentical: restored,
    rerunGreen: rerun.failed.length === 0 && rerun.fileErrors.length === 0,
    // Named only when the rerun of the restored files was not green, so a flaky test can be found.
    ...(rerun.failed.length || rerun.fileErrors.length ? { rerunFailures: [...rerun.failed.map((f) => `${f.test} :: ${f.msg}`), ...rerun.fileErrors] } : {}),
  });
  console.log(m.id, results.at(-1).verdict);
}
writeFileSync(resultsPath, JSON.stringify({ baseline: baseline.passed, results }, null, 2));
