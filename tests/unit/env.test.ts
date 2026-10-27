import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENV_NAMES, evalEnv, webEnv } from "@/env";

const base = {
  DATABASE_URL: "postgres://user:pw@host.example/db",
  META_API_KEY: "test-key",
  META_BASE_URL: "https://api.meta.ai/v1",
  META_MODEL_SPARK: "muse-spark-1.3",
  META_MODEL_WONDER: "muse-wonder-1.0",
};

describe("webEnv", () => {
  it("parses a complete environment and defaults LOG_LEVEL to info", () => {
    const env = webEnv({ ...base });
    expect(env.META_MODEL_SPARK).toBe("muse-spark-1.3");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("uses APP_BASE_URL first, then RENDER_EXTERNAL_URL, then localhost", () => {
    expect(webEnv({ ...base, APP_BASE_URL: "https://app.example", RENDER_EXTERNAL_URL: "https://backfill.onrender.com" }).APP_BASE_URL).toBe("https://app.example");
    expect(webEnv({ ...base, RENDER_EXTERNAL_URL: "https://backfill.onrender.com" }).APP_BASE_URL).toBe("https://backfill.onrender.com");
    expect(webEnv({ ...base }).APP_BASE_URL).toBe("http://localhost:3000");
  });

  it("refuses a contributor-tier model ID for either model", () => {
    expect(() => webEnv({ ...base, META_MODEL_SPARK: "muse-spark-1.3-contributor" })).toThrow(/META_MODEL_SPARK: must not be a -contributor tier model/);
    expect(() => webEnv({ ...base, META_MODEL_WONDER: "muse-wonder-1.0-contributor" })).toThrow(/META_MODEL_WONDER: must not be a -contributor tier model/);
  });

  it("refuses a non-https Meta base URL and a non-postgres database URL", () => {
    expect(() => webEnv({ ...base, META_BASE_URL: "http://api.meta.ai/v1" })).toThrow(/META_BASE_URL: must be an https:\/\/ URL/);
    expect(() => webEnv({ ...base, DATABASE_URL: "mysql://host/db" })).toThrow(/DATABASE_URL: must be a postgres:\/\/ URL/);
  });

  it("names every missing key and never echoes a value", () => {
    let message = "";
    try {
      webEnv({ DATABASE_URL: "not-a-url-secret-value" });
    } catch (err) {
      message = (err as Error).message;
    }
    for (const name of ["DATABASE_URL", "META_API_KEY", "META_BASE_URL", "META_MODEL_SPARK", "META_MODEL_WONDER"]) expect(message).toContain(name);
    expect(message).not.toContain("not-a-url-secret-value");
  });

  it("refuses a short negotiation secret but accepts none", () => {
    expect(() => webEnv({ ...base, NEGOTIATION_SIGNING_SECRET: "short" })).toThrow(/NEGOTIATION_SIGNING_SECRET: must be at least 32 characters/);
    expect(webEnv({ ...base }).NEGOTIATION_SIGNING_SECRET).toBeUndefined();
  });
});

describe("evalEnv", () => {
  it("treats every OpenRouter key as optional", () => {
    expect(evalEnv({})).toEqual({});
  });
});

describe(".env.example", () => {
  it("lists exactly the names env.ts reads, plus the ones Next.js reads itself", () => {
    const listed = readFileSync(".env.example", "utf8")
      .split("\n")
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.slice(0, line.indexOf("=")));
    expect([...listed].sort()).toEqual([...ENV_NAMES, "NEXT_TELEMETRY_DISABLED"].sort());
  });
});
