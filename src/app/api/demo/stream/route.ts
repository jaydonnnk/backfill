import { webDb } from "@/lib/db/client";
import { demoSnapshot } from "@/lib/demo/snapshot";
import { snapshotStream } from "@/lib/demo/sse";

export const dynamic = "force-dynamic";

// The demo screen's live feed: the snapshot once a second while it changes, a ping every 15 s
// while it does not, and a fresh connection every 5 minutes.
export function GET(req: Request): Response {
  const stream = snapshotStream(() => demoSnapshot(webDb()), { intervalMs: 1000, heartbeatMs: 15_000, maxMs: 5 * 60_000, signal: req.signal });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
