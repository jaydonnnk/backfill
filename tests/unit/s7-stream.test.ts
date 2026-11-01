import { describe, expect, it } from "vitest";
import { snapshotStream } from "@/lib/demo/sse";
import { followFeedHealth, type FeedState } from "@/app/demo/live-feed";

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of stream) text += decoder.decode(chunk);
  return text;
}

describe("demo stream freshness", () => {
  it("marks a previously readable snapshot stale during repeated read failures and still pings", async () => {
    let t = 0;
    const stream = snapshotStream(async () => {
      if (t > 0) throw new Error("database unavailable");
      return { n: 1 };
    }, {
      intervalMs: 1000,
      heartbeatMs: 2000,
      maxMs: 4000,
      signal: new AbortController().signal,
      now: () => t,
      sleep: async (ms) => void (t += ms),
    });
    expect(await drain(stream)).toBe('retry: 2000\n\ndata: {"n":1}\n\nevent: stale\ndata: {}\n\n: ping\n\n');
  });

  it("recovers from one failed read when the next snapshot is unchanged without resending data", async () => {
    let t = 0;
    const stream = snapshotStream(async () => {
      if (t === 1000) throw new Error("database temporarily unavailable");
      return { n: 1 };
    }, {
      intervalMs: 1000,
      heartbeatMs: 60_000,
      maxMs: 4000,
      signal: new AbortController().signal,
      now: () => t,
      sleep: async (ms) => void (t += ms),
    });
    expect(await drain(stream)).toBe('retry: 2000\n\ndata: {"n":1}\n\nevent: stale\ndata: {}\n\nevent: recovered\ndata: {}\n\n');
  });
});

describe("demo feed indicator", () => {
  it("waits for a successful read before marking an opened connection live", () => {
    const source = new EventTarget();
    const states: FeedState[] = ["connecting"];
    followFeedHealth(source, (state) => states.push(state));
    source.dispatchEvent(new Event("open"));
    expect(states).toEqual(["connecting"]);
    source.dispatchEvent(new MessageEvent("message", { data: '{"scene":null,"muse":null}' }));
    expect(states).toEqual(["connecting", "live"]);
  });

  it("shows stale read status until a successful read recovers, even on an open connection", () => {
    const source = new EventTarget();
    const states: FeedState[] = [];
    followFeedHealth(source, (state) => states.push(state));
    source.dispatchEvent(new MessageEvent("message", { data: '{"scene":null,"muse":null}' }));
    source.dispatchEvent(new MessageEvent("stale", { data: "{}" }));
    source.dispatchEvent(new Event("open"));
    expect(states).toEqual(["live", "stale"]);
    source.dispatchEvent(new MessageEvent("recovered", { data: "{}" }));
    source.dispatchEvent(new Event("error"));
    expect(states).toEqual(["live", "stale", "live", "connecting"]);
  });
});
