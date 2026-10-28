import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports an invalid configuration as config, not as a database outage", async () => {
    // The unit project never loads .env.local, so the web configuration is missing here.
    const sink = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET();
    const line = String(sink.mock.calls[0]?.[0]);
    sink.mockRestore();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, config: "invalid" });
    expect(JSON.parse(line)).toMatchObject({ event: "health.config_invalid" });
  });
});
