import { afterEach, describe, expect, it } from "vitest";
import { nextOccurrence, occurrenceOn, singaporeInstant } from "@/domain/commitments/occurrence";
import type { Window } from "@/domain/offers/schema";

// Tuesday 14:00 to 17:00, commitments by 12:00. 2026-11-03 is a Tuesday.
const TUE: Window = { weekday: 2, startMinute: 14 * 60, endMinute: 17 * 60, commitByMinute: 12 * 60 };
const at = (iso: string) => new Date(iso);

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("singaporeInstant", () => {
  it("reads a Singapore wall-clock minute as UTC+8, midnight to the next midnight", () => {
    expect(singaporeInstant("2026-11-03", 0).toISOString()).toBe("2026-11-02T16:00:00.000Z");
    expect(singaporeInstant("2026-11-03", 14 * 60).toISOString()).toBe("2026-11-03T06:00:00.000Z");
    expect(singaporeInstant("2026-11-03", 1440).toISOString()).toBe("2026-11-03T16:00:00.000Z");
  });

  it("does not depend on the host time zone", () => {
    process.env.TZ = "America/New_York";
    expect(singaporeInstant("2026-11-03", 12 * 60).toISOString()).toBe("2026-11-03T04:00:00.000Z");
  });

  it("refuses a date that is not ISO or not on the calendar", () => {
    expect(() => singaporeInstant("2026-11-3", 0)).toThrow("not an ISO date");
    expect(() => singaporeInstant("2026-02-30", 0)).toThrow("not an ISO date");
  });
});

describe("occurrenceOn", () => {
  it("gives the deadline, start and end of the window on its weekday", () => {
    expect(occurrenceOn(TUE, "2026-11-03")).toEqual({
      visitDate: "2026-11-03",
      commitBy: at("2026-11-03T12:00:00+08:00"),
      startsAt: at("2026-11-03T14:00:00+08:00"),
      endsAt: at("2026-11-03T17:00:00+08:00"),
    });
  });

  it("is null on any other weekday", () => {
    expect(occurrenceOn(TUE, "2026-11-04")).toBeNull();
    expect(occurrenceOn(TUE, "2026-11-02")).toBeNull();
  });
});

describe("nextOccurrence", () => {
  it("is today's occurrence until its deadline, and next week's from the deadline on", () => {
    expect(nextOccurrence(TUE, at("2026-11-03T11:59:59.999+08:00")).visitDate).toBe("2026-11-03");
    expect(nextOccurrence(TUE, at("2026-11-03T12:00:00+08:00")).visitDate).toBe("2026-11-10");
  });

  it("counts days in Singapore, not on the host", () => {
    process.env.TZ = "America/New_York";
    // Monday 23:30 in New York is already Tuesday 12:30 in Singapore, past the deadline.
    expect(nextOccurrence(TUE, at("2026-11-02T23:30:00-05:00")).visitDate).toBe("2026-11-10");
    // Wednesday in Singapore: the next Tuesday is six days on.
    expect(nextOccurrence(TUE, at("2026-11-04T00:00:00+08:00")).visitDate).toBe("2026-11-10");
  });
});
