// Mutation runner for the S1 review (docs/plans/backfill/evidence/s1-review). Applies each
// mutation to one file of a copy of the tree, runs the full unit and integration suite, records
// whether a test failed on an AssertionError, restores the file byte-identical and confirms the
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
  const path = join(tree, m.file);
  const original = readFileSync(path);
  const text = original.toString("utf8");
  const hits = text.split(m.from).length - 1;
  if (hits !== 1) {
    results.push({ id: m.id, error: `pattern found ${hits} times` });
    continue;
  }
  // A replacer function, so "$$" in a mutation (SQL dollar quoting) is written as it is, not as "$".
  writeFileSync(path, text.replace(m.from, () => m.to));
  const mutated = runSuite();
  writeFileSync(path, original);
  const restored = sha(readFileSync(path)) === sha(original);
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
  });
  console.log(m.id, results.at(-1).verdict);
}
writeFileSync(resultsPath, JSON.stringify({ baseline: baseline.passed, results }, null, 2));
