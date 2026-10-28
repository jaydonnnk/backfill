import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { isEntrypoint } from "@/lib/entrypoint";

// Node gives a module its real path, and macOS tmpdir() is itself behind a symlink, so start real.
const dir = realpathSync(mkdtempSync(join(tmpdir(), "backfill entry ")));
const script = join(dir, "migrate.ts");
writeFileSync(script, "");
const link = join(dir, "link.ts");
symlinkSync(script, link);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("isEntrypoint", () => {
  it("matches the started script through a symlink and a space in the path", () => {
    const moduleUrl = pathToFileURL(script).href;
    expect(isEntrypoint(moduleUrl, script)).toBe(true);
    expect(isEntrypoint(moduleUrl, link)).toBe(true);
  });

  it("is false for another script, a missing path or no argv[1]", () => {
    const moduleUrl = pathToFileURL(script).href;
    expect(isEntrypoint(moduleUrl, join(dir, "other.ts"))).toBe(false);
    expect(isEntrypoint(moduleUrl, undefined)).toBe(false);
  });
});
