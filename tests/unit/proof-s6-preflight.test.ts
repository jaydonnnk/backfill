import {expect,it} from 'vitest';
import * as runner from '../../scripts/verification/proof-s6-live';
import {S6_APPROVAL,sha256} from '../../scripts/verification/proof-s6-live-contract';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

it('requires the exact bounded approval and explicit loopback test database',()=>{
 expect(()=>runner.checkExecution(undefined,'postgres://127.0.0.1:5432/postgres')).toThrow('S6 pricing approval required');
 expect(()=>runner.checkExecution('yes','postgres://127.0.0.1:5432/postgres')).toThrow('S6 pricing approval required');
 for(const url of ['postgres://prod.neon.tech/postgres','postgres://127.0.0.1:5432/production','postgres://127.0.0.1:5432/postgres?host=prod.neon.tech','https://127.0.0.1:5432/postgres'])expect(()=>runner.checkExecution(S6_APPROVAL,url)).toThrow();
 expect(runner.checkExecution(S6_APPROVAL,'postgres://127.0.0.1:5432/postgres').hostname).toBe('127.0.0.1');
});
it('rejects replacement of the original manifest even when the replacement source hashes match',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'s6-pin-'));
 try{
  const path=join(dir,'manifest.json');await writeFile(path,'{"files":[]}');
  const pin=sha256(await readFile(path));
  await writeFile(path,'{"files":[{"path":"changed.ts","sha256":"updated"}]}');
  const changed=await readFile(path);expect(()=>runner.verifyManifestPin(changed,pin)).toThrow('Prepared manifest replaced');
 }finally{await rm(dir,{recursive:true,force:true});}
});
