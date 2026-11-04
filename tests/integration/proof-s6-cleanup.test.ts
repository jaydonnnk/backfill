import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createTestDatabase} from '../support/db';
import * as runner from '../../scripts/verification/proof-s6-live';
it('attempts both database removals and records cleanup even when a client close fails',async()=>{
 const d=await mkdtemp(join(tmpdir(),'s6-cleanup-'));const dbs=[];
 try{
  for(const label of ['s6_cleanup_a','s6_cleanup_b'])dbs.push(await createTestDatabase(label));
  let secondClosed=false;
  await expect(runner.cleanupLocalWorlds({configured:new URL(process.env.TEST_DATABASE_URL??''),output:d,role:'backfill_t_s6_uncreated_cleanup_test',roleCreated:false,databases:dbs,clients:[{close:async()=>{throw Error('scripted close failure');}},{close:async()=>{secondClosed=true;}}],requestsDispatched:0})).rejects.toThrow('S6 cleanup failed');
  expect(secondClosed).toBe(true);
  expect(JSON.parse(await readFile(join(d,'cleanup.json'),'utf8'))).toMatchObject({ownedDatabasesRemaining:0,ownedRolesRemaining:0,failures:['client_0'],productionChanges:false});
 }finally{for(const db of dbs)await db.drop();await rm(d,{recursive:true,force:true});}
});
