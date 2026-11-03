import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/db";

const saved = process.env.TEST_DATABASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = saved;
});

describe("createTestDatabase", () => {
  it("refuses a Neon URL before connecting to it", async () => {
    process.env.TEST_DATABASE_URL = "postgres://u:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb";
    const error = await createTestDatabase("guard").then(() => null, (err: unknown) => err);
    expect((error as Error | null)?.message).toBe("TEST_DATABASE_URL must not point at Neon");
  });
});

for (const value of [undefined, 'postgres://postgres@remote.invalid:5432/postgres']) it(`refuses ${value === undefined ? 'missing' : 'nonlocal'} test configuration without an env-file fallback`, async () => {
  if (value === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = value;
  await expect(createTestDatabase('guard')).rejects.toThrow('Explicit local TEST_DATABASE_URL required; env-file fallback is disabled');
});
