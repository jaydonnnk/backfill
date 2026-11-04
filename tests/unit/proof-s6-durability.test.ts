import {mkdtemp,open,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import frozen from '../../docs/plans/backfill-proof/s6-cases.json';
import {parseCaseSet} from '../../scripts/verification/proof-s6-policy';
import {createPricingSession} from '../../scripts/verification/proof-s6-live-contract';
vi.mock('node:fs/promises',async original=>{const fs=await original<typeof import('node:fs/promises')>();return {...fs,open:vi.fn(fs.open)};});

it('refuses dispatch if synchronizing the consumed-marker directory fails',async()=>{
 const original=await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
 const d=await mkdtemp(join(tmpdir(),'s6-fsync-'));let calls=0;
 vi.mocked(open).mockImplementation(async(path,flags,mode)=>{if(String(path)===d)throw Error('scripted directory sync failure');return original.open(path,flags,mode);});
 try{
  const data=parseCaseSet(frozen),c=data.cases.find(c=>c.id==='s6-02');if(!c)throw Error('Missing case');
  const session=createPricingSession({directory:d,apiKey:'offline-dummy',verifySources:async()=>{},upstream:async()=>{calls++;return new Response('{}');}});
  await expect(session.policy(data,c)({merchantName:c.merchantName,listPriceCents:680,offerPriceCents:544,previousPriceCents:544,bidCents:535,covers:2,round:1,maxRounds:3,maxConcessionCents:17})).rejects.toThrow('scripted directory sync failure');
  expect(calls).toBe(0);expect(session.dispatched()).toBe(0);expect(JSON.parse(await readFile(join(d,'s6-02-round-1-dispatch.json'),'utf8')).consumed).toBe(true);
 }finally{vi.mocked(open).mockImplementation(original.open);await rm(d,{recursive:true,force:true});}
});
