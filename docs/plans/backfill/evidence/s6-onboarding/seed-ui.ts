import postgres from "postgres";
import { connectDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { mintMerchant } from "@/lib/onboarding/links";

// Local-only UI seed: a disposable database with one synthetic merchant, one counted draft, and a
// published rule with a sold-out occurrence and an ok Wonder plan. Never Neon.
const base = "postgres://postgres@127.0.0.1:5432/postgres";
const name = "backfill_s6_ui";
const root = postgres(base, { max: 1, onnotice: () => {} });
await root.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await root.unsafe(`CREATE DATABASE ${name}`);
await root.end();
const url = `postgres://postgres@127.0.0.1:5432/${name}`;
await runMigrations(url);
const { db, close } = connectDb(url, 1);
const sql = postgres(url, { max: 1, onnotice: () => {} });
const a = await mintMerchant(db, "Kopi Lane Cafe (synthetic)");
const menu = { currency: "SGD", items: [
  { name: "Iced latte", priceCents: 650 }, { name: "Flat white", priceCents: 600 }, { name: "Truffle fries", priceCents: 1200 },
  { name: "Burnt cheesecake with a very long name to check wrapping on small phones", priceCents: 790 }, { name: "Kaya toast set", priceCents: 550 } ],
  cover: { itemIndexes: [0, 3], description: "Iced latte and a slice of burnt cheesecake" } };
const row = (draft: unknown, verdict: string, price: number | null) => ({ merchant_id: a.id, photo_sha256: "b".repeat(64), photo_bytes: 1234, photo_type: "image/jpeg", model: "muse-spark-1.3", draft: sql.json(draft as postgres.JSONValue), verdict, list_price_cents: price });
const [d1] = await sql`insert into menu_drafts ${sql(row(menu, "ok", 1440))} returning id`;
const [d2] = await sql`insert into menu_drafts ${sql(row(menu, "ok", 1440))} returning id`;
await sql`select publish_offer(${a.id}::uuid, ${d2!.id}::uuid, gen_random_uuid(), 4, 2::smallint, 840::smallint, 1020::smallint, 720::smallint, 2500, 2, 2, 917)`;
const [r] = await sql`select id from rules where merchant_id = ${a.id}`;
const [ag] = await sql`insert into agents ${sql({ id: "ui-agent", label: "ui", token_sha256: "c".repeat(64) })} returning id`;
for (const [date, covers] of [["2026-11-03", 1], ["2026-11-10", 4]] as const) {
  const [c] = await sql`insert into commitments ${sql({ rule_id: r!.id, agent_id: ag!.id, idempotency_key: date, terms_version: 1, covers, max_price_per_cover_cents: 1440, visit_at: new Date(`${date}T14:00:00+08:00`), committed_at: new Date(`${date}T09:00:00+08:00`) })} returning id`;
  await sql`insert into clearings ${sql({ rule_id: r!.id, visit_date: date, terms_version: 1, unlocked: covers >= 2, price_per_cover_cents: 1080 })}`;
  if (covers >= 2) await sql`insert into clearing_fills ${sql({ commitment_id: c!.id, rule_id: r!.id, visit_date: date, covers, price_per_cover_cents: 1080 })}`;
}
await sql`insert into wonder_plans ${sql({ rule_id: r!.id, visit_date: "2026-11-10", terms_version: 1, model: "muse-wonder-1.0", discount_bps: 2000, capacity_covers: 6, min_pool_covers: 3, per_agent_cap_covers: 2, rationale: "The slot sold out with 4 of 4 covers filled, after an earlier week that missed its pool. Add two covers and trim the discount to 20% to keep margin.", verdict: "ok" })}`;
console.log(JSON.stringify({ url, draft: d1!.id, link: `/merchant/enter#${a.token}` }));
await sql.end(); await close();
