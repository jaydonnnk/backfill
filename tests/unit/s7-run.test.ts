import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("refuses paid recording before configuration, database or model access when no enforced allowance exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-record-closed-"));
  let output = "";
  let status = 0;
  try {
    const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("sim/buyers/run.ts"), "http://127.0.0.1:9", "record", join(dir, "unused.json")], { cwd: dir, encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, TSX_TSCONFIG_PATH: resolve("tsconfig.json") }, stdio: ["ignore", "pipe", "pipe"], timeout: 5000 });
    expect(result.error).toBeUndefined();
    status = result.status ?? -1;
    output = result.stderr;
    expect(status).toBe(1);
    expect(output).toContain("paid S7 recording is disabled: no provider-enforced spending allowance is configured; replay remains available");
    expect(output).not.toContain("buyer tokens");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
