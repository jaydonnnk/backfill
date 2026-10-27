import { describe, expect, it } from "vitest";
import { errorFields, redact } from "@/lib/log";

describe("redact", () => {
  it("removes connection-string credentials and bearer values", () => {
    expect(redact("at postgres://user:s3cret@host/db with Bearer abc.def-123")).toBe("at postgres://[redacted]@host/db with Bearer [redacted]");
  });
});

describe("errorFields", () => {
  it("reports a Postgres code from the error's cause, never its message", () => {
    const err = new Error("Failed query: select secret_value", { cause: Object.assign(new Error("relation does not exist"), { code: "42P01" }) });
    expect(errorFields(err)).toEqual({ name: "Error", pgCode: "42P01", message: null });
  });

  it("passes through the configuration message, which names keys only", () => {
    expect(errorFields(new Error("Invalid web configuration: META_API_KEY: Invalid input"))).toEqual({ name: "Error", pgCode: null, message: "Invalid web configuration: META_API_KEY: Invalid input" });
  });

  it("ignores a code that is not a SQLSTATE", () => {
    expect(errorFields(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toEqual({ name: "Error", pgCode: null, message: null });
  });
});
