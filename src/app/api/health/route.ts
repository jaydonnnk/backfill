import { sql } from "drizzle-orm";
import { webDb } from "@/lib/db/client";
import { errorFields, log } from "@/lib/log";

export const dynamic = "force-dynamic";

// Reports whether the app's configuration parses and it can reach its database. Never calls a model.
export async function GET() {
  try {
    await webDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    const fields = errorFields(err);
    // errorFields passes a message through only for a configuration error, which names keys only.
    if (fields.message) {
      log("error", "health.config_invalid", fields);
      return Response.json({ ok: false, config: "invalid" }, { status: 503 });
    }
    log("error", "health.db_unreachable", fields);
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
