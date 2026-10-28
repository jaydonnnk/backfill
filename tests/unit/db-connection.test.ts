import { describe, expect, it } from "vitest";
import { pgConnection } from "@/lib/db/client";

// Caught, so a regression fails on the assertion rather than on a thrown refusal.
function connect(url: string) {
  try {
    return pgConnection(url);
  } catch (err) {
    return (err as Error).message;
  }
}

const sslOf = (url: string) => {
  const connection = connect(url);
  return typeof connection === "string" ? connection : connection.ssl;
};

describe("pgConnection", () => {
  it("strips Neon's libpq-only parameters and verifies TLS for a remote host", () => {
    const connection = connect("postgres://u:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
    expect(connection).toEqual({ url: "postgres://u:pw@ep-x-pooler.us-east-2.aws.neon.tech/neondb", ssl: "verify-full" });
  });

  it("verifies TLS for a remote host even with no sslmode", () => {
    expect(sslOf("postgres://u:pw@db.example/app")).toBe("verify-full");
  });

  it("skips TLS only on a local host without sslmode, or when sslmode=disable", () => {
    expect(sslOf("postgres://postgres@127.0.0.1:5432/app")).toBe(false);
    expect(sslOf("postgres://postgres@localhost/app")).toBe(false);
    expect(sslOf("postgres://u@db.example/app?sslmode=disable")).toBe(false);
    expect(sslOf("postgres://postgres@127.0.0.1/app?sslmode=require")).toBe("verify-full");
  });

  it("refuses any other parameter rather than send it to the server", () => {
    expect(connect("postgres://u:pw@db.example/app?options=endpoint%3Dep-x&sslmode=require")).toBe("Unsupported database URL parameters: options");
  });
});
