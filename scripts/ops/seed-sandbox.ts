import { eq, sql } from 'drizzle-orm';
import { migrationEnv } from '../../src/env';
import { connectDb, type Db } from '../../src/lib/db/client';
import { merchants, rules } from '../../src/lib/db/schema';
import { isEntrypoint } from '../../src/lib/entrypoint';

const merchantId = 'baccf111-0000-4000-8000-000000000001';
export async function seedSandbox(db: Db) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(4152019)`);
    const name = 'Backfill Sandbox Cafe (synthetic)';
    await tx.insert(merchants).values({id:merchantId,name,visibility:'sandbox'}).onConflictDoNothing();
    const [merchant] = await tx.select().from(merchants).where(eq(merchants.id,merchantId));
    if (merchant?.name !== name || merchant.visibility !== 'sandbox') throw Error('sandbox_seed_identity_conflict');
    for (let weekday=1;weekday<=7;weekday++) {
      await tx.insert(rules).values({id:`baccf111-0000-4000-8000-00000000010${weekday}`,merchantId,weekday,listPriceCents:680,capacityCovers:200,startMinute:840,endMinute:1020,commitByMinute:720,discountBps:2000,minPoolCovers:4,perAgentCapCovers:4,floorPriceCents:500}).onConflictDoNothing();
    }
  });
}
if (isEntrypoint(import.meta.url)) {
  const {db,close} = connectDb(migrationEnv().DATABASE_URL,1);
  seedSandbox(db).then(() => console.log('Synthetic sandbox seeded.')).catch(() => {console.error('Sandbox seed failed.');process.exitCode=1;}).finally(close);
}
