import { errorFields, log } from "@/lib/log";

// Server-sent events for the demo screen, from polling Postgres: every write to the scene comes
// from some request, on Render or from the scene command, so only the database sees them all. Each
// event is the whole snapshot, sent only when it changed, so a reconnect simply starts over from
// the database. A comment line keeps an idle connection open through proxies, and the stream
// ends after maxMs so the browser reconnects to a fresh one.

export type StreamOptions = {
  intervalMs: number;
  heartbeatMs: number;
  maxMs: number;
  signal: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

export function snapshotStream(read: () => Promise<unknown>, options: StreamOptions): ReadableStream<Uint8Array> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = now();
      let last: string | null = null;
      let lastWriteAt = startedAt;
      const write = (text: string) => {
        controller.enqueue(encoder.encode(text));
        lastWriteAt = now();
      };
      write("retry: 2000\n\n");
      while (!cancelled && !options.signal.aborted && now() - startedAt < options.maxMs) {
        try {
          const json = JSON.stringify(await read());
          if (json !== last) {
            write(`data: ${json}\n\n`);
            last = json;
          } else if (now() - lastWriteAt >= options.heartbeatMs) {
            write(": ping\n\n");
          }
        } catch (err) {
          log("error", "demo.snapshot_failed", errorFields(err));
          if (now() - lastWriteAt >= options.heartbeatMs) write(": ping\n\n");
        }
        await sleep(options.intervalMs, options.signal);
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
}
