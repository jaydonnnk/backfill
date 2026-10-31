import { webDb } from "@/lib/db/client";
import { demoSnapshot } from "@/lib/demo/snapshot";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Backfill live demo" };

// The public demo screen: rendered once from the database, then kept live by /api/demo/stream.
export default async function DemoPage() {
  return <LiveBoard initial={await demoSnapshot(webDb())} />;
}
