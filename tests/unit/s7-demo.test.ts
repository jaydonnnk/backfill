import { describe, expect, it } from "vitest";
import { sceneWindow } from "@/domain/demo/scene";
import { snapshotStream } from "@/lib/demo/sse";
import { buyerRequest } from "../../sim/buyers/buyer";

describe("sceneWindow", () => {
  it("closes at the first whole minute at least the lead away, on today's Singapore date", () => {
    expect(sceneWindow(new Date("2026-11-03T14:00:00+08:00"), 2)).toEqual({ visitDate: "2026-11-03", weekday: 2, commitByMinute: 842, startMinute: 842, endMinute: 902 });
    expect(sceneWindow(new Date("2026-11-03T14:00:00.001+08:00"), 2)?.commitByMinute).toBe(843);
    // 00:30 on Wednesday in Singapore is still Tuesday in UTC.
    expect(sceneWindow(new Date("2026-11-04T00:30:00+08:00"), 3)).toMatchObject({ visitDate: "2026-11-04", weekday: 3, commitByMinute: 33 });
  });

  it("refuses a window that would cross midnight, and only then", () => {
    expect(sceneWindow(new Date("2026-11-03T22:58:00+08:00"), 2)).toMatchObject({ endMinute: 1440 });
    expect(sceneWindow(new Date("2026-11-03T22:58:01+08:00"), 2)).toBeNull();
    expect(() => sceneWindow(new Date(), 0)).toThrow(/positive integer/);
  });
});

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of stream) text += decoder.decode(chunk);
  return text;
}

describe("snapshotStream", () => {
  it("sends a snapshot only when it changes, pings while idle and ends at maxMs", async () => {
    let t = 0;
    const values = [{ n: 1 }, { n: 1 }, { n: 2 }, { n: 2 }, { n: 2 }, { n: 2 }];
    let i = 0;
    const stream = snapshotStream(async () => values[Math.min(i++, values.length - 1)], {
      intervalMs: 1000,
      heartbeatMs: 2500,
      maxMs: 6000,
      signal: new AbortController().signal,
      now: () => t,
      sleep: async (ms) => void (t += ms),
    });
    expect(await drain(stream)).toBe(`retry: 2000\n\ndata: {"n":1}\n\ndata: {"n":2}\n\n: ping\n\n`);
  });

  it("keeps going after a failed read and stops when the request is aborted", async () => {
    let t = 0;
    const abort = new AbortController();
    let i = 0;
    const stream = snapshotStream(
      async () => {
        i += 1;
        if (i === 1) throw new Error("db down");
        if (i === 3) abort.abort();
        return { n: i };
      },
      { intervalMs: 1000, heartbeatMs: 60_000, maxMs: 60_000, signal: abort.signal, now: () => t, sleep: async (ms) => void (t += ms) },
    );
    expect(await drain(stream)).toBe(`retry: 2000\n\nevent: stale\ndata: {}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n`);
  });
});

describe("buyerRequest", () => {
  it("gives the model the intent, the server's terms, what a cover is and the cap", () => {
    const { prompt } = buyerRequest(
      { agentId: "sim-buyer-01", intent: "Kopi for two" },
      { merchantName: "Backfill Demo Cafe", about: "a kopi set", summary: "S", visitDate: "2026-11-03", commitBy: "2026-11-03T06:03:00.000Z", startsAt: "2026-11-03T06:03:00.000Z", endsAt: "2026-11-03T07:03:00.000Z", perAgentCapCovers: 4 },
    );
    expect(prompt).toContain("wants: Kopi for two.");
    expect(prompt).toContain("One cover is a kopi set.");
    expect(prompt).toContain("commit by 3 Nov 2026, 2:03 pm (Singapore time)");
    expect(prompt).toContain("at most 4 covers");
  });
});
