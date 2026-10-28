// Mutation runner for the S1 review (docs/plans/backfill/evidence/s1-review).
// suite, records whether a test failed on an AssertionError, restores the file byte-identical and
// confirms the restore. Usage: node mutate.mjs <tree> <mutations.json> <results.json>
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
  const failed = r.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => ({ test: a.fullName, msg: (a.failureMessages[0] ?? "").split("\n")[0] })));
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
  writeFileSync(path, text.replace(m.from, m.to));
  const mutated = runSuite();
  writeFileSync(path, original);
  const restored = sha(readFileSync(path)) === sha(original);
  const rerun = runSuite();
  const assertionKill = mutated.failed.some((f) => /AssertionError/.test(f.msg));
  results.push({
    id: m.id,
    guard: m.guard,
    verdict: assertionKill ? "killed" : mutated.failed.length || mutated.fileErrors.length ? "killed-not-assertion" : "survived",
    failedTests: mutated.failed.map((f) => `${f.test} :: ${f.msg}`),
    fileErrors: mutated.fileErrors,
    restoredByteIdentical: restored,
    rerunGreen: rerun.failed.length === 0 && rerun.fileErrors.length === 0,
  });
  console.log(m.id, results.at(-1).verdict);
}
writeFileSync(resultsPath, JSON.stringify({ baseline: baseline.passed, results }, null, 2));
