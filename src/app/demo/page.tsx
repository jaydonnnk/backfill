import { webDb } from "@/lib/db/client";
import { demoSnapshot } from "@/lib/demo/snapshot";
import { errorFields, log } from "@/lib/log";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Backfill live demo" };

// The public demo screen: rendered once from the database, then kept live by /api/demo/stream.
export default async function DemoPage() {
  const loaded = await loadSnapshot();
  return <LiveBoard initial={loaded.snapshot} unavailable={loaded.unavailable} />;
}

async function loadSnapshot() {
  try { return { snapshot: await demoSnapshot(webDb()), unavailable: false }; }
  catch (error) {
    log("error", "demo.initial_failed", errorFields(error));
    return { snapshot: { scene: null, muse: null, ledger: null }, unavailable: true };
  }
}
