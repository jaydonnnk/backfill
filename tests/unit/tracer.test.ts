import { describe, expect, it } from "vitest";
import { TRACER_COOLDOWN_MS, TRACER_DAILY_CAP, tracerGate } from "@/lib/tracer";

const now = new Date("2026-10-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("tracerGate", () => {
  it("allows the first call", () => {
    expect(tracerGate(now, { count: 0, lastAt: null })).toEqual({ allowed: true });
  });

  it("refuses inside the cooldown and allows exactly at its end", () => {
    expect(tracerGate(now, { count: 1, lastAt: ago(TRACER_COOLDOWN_MS - 1) })).toEqual({ allowed: false, reason: "cooldown", retryAfterMs: 1 });
    expect(tracerGate(now, { count: 1, lastAt: ago(TRACER_COOLDOWN_MS) })).toEqual({ allowed: true });
  });

  it("refuses at the daily cap and allows one below it", () => {
    expect(tracerGate(now, { count: TRACER_DAILY_CAP, lastAt: ago(DAY) })).toMatchObject({ allowed: false, reason: "daily_cap" });
    expect(tracerGate(now, { count: TRACER_DAILY_CAP - 1, lastAt: ago(DAY) })).toEqual({ allowed: true });
  });
});
