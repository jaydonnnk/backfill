import { parseDemoSnapshot } from "@/lib/demo/protocol";

export type FeedState = "connecting" | "live" | "stale";

export function followFeedHealth(source: Pick<EventTarget, "addEventListener">, onState: (state: FeedState) => void): void {
  let state: FeedState = 'connecting';
  const update = (next: FeedState) => { state = next; onState(next); };
  source.addEventListener("message", event => update(event instanceof MessageEvent && typeof event.data === "string" && parseDemoSnapshot(event.data) ? "live" : "stale"));
  source.addEventListener("error", () => update(state === "stale" ? "stale" : "connecting"));
  source.addEventListener("stale", () => update("stale"));
  source.addEventListener("recovered", () => update("live"));
}
