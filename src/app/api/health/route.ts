import { sql } from "drizzle-orm";
import { webDb } from "@/lib/db/client";
import { errorFields, log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Reports whether the app can reach its database. Never calls a model.
export async function GET() {
  try {
    await webDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    log("error", "health.db_unreachable", errorFields(err));
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
