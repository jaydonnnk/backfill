import postgres from 'postgres';
import {expect,it,vi} from 'vitest';
import {createTestDatabase} from '../support/db';
vi.mock('@/lib/db/migrate',()=>({runMigrations:async()=>{throw Error('scripted migration failure');}}));

it('removes a newly created disposable database when migration fails',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('Local test database required');
 const admin=postgres(url,{max:1,onnotice:()=>{}});
 try{
  await expect(createTestDatabase('s6_migration_fail')).rejects.toThrow('scripted migration failure');
  const rows=await admin`select datname from pg_database where datname like 'backfill_t_s6_migration_fail_%'`;
  expect(rows).toHaveLength(0);
 }finally{
  const owned=await admin`select datname from pg_database where datname like 'backfill_t_s6_migration_fail_%'`;
  for(const row of owned)await admin.unsafe(`DROP DATABASE "${row.datname}" WITH (FORCE)`);
  await admin.end({timeout:5});
 }
});
