import { describe, expect, it, vi } from "vitest";
import { errorFields, log, redact } from "@/lib/log";

describe("log", () => {
  it("redacts every string field before writing the line", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "db.failed", { detail: "connect postgres://owner:s3cret@ep-x.neon.tech/db failed", attempts: 2 });
    const line = String(sink.mock.calls[0]?.[0]);
    sink.mockRestore();
    expect(JSON.parse(line)).toMatchObject({ level: "error", event: "db.failed", detail: "connect postgres://[redacted]@ep-x.neon.tech/db failed", attempts: 2 });
    expect(line).not.toContain("s3cret");
  });
});

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
