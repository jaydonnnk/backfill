export type FeedState = "connecting" | "live" | "stale";

export function followFeedHealth(source: Pick<EventTarget, "addEventListener">, onState: (state: FeedState) => void): void {
  source.addEventListener("message", () => onState("live"));
  source.addEventListener("error", () => onState("connecting"));
  source.addEventListener("stale", () => onState("stale"));
  source.addEventListener("recovered", () => onState("live"));
}
