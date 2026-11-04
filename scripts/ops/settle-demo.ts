import { eq } from 'drizzle-orm';
import { migrationEnv } from '../../src/env';
import { connectDb, type Db } from '../../src/lib/db/client';
import { commitments, rules } from '../../src/lib/db/schema';
import { settleDue } from '../../src/lib/commitments/service';
import { MUSE_AGENT_ID } from '../../src/lib/demo/snapshot';
import { isEntrypoint } from '../../src/lib/entrypoint';
export async function settleDemo(db:Db) {
 const rows=await db.selectDistinct({merchantId:rules.merchantId}).from(commitments).innerJoin(rules,eq(rules.id,commitments.ruleId)).where(eq(commitments.agentId,MUSE_AGENT_ID));
 for(const row of rows)await settleDue(db,row.merchantId);
}
if(isEntrypoint(import.meta.url)){
 const {db,close}=connectDb(migrationEnv().DATABASE_URL,1);
 settleDemo(db).then(()=>console.log('Due demo commitments settled.')).catch(()=>{console.error('Demo settlement failed.');process.exitCode=1;}).finally(close);
}
