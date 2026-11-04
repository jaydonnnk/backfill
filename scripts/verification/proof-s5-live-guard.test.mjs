import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {guardedMediaFetch} from './proof-s5-live-guard.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('S5 reserves two exact media bodies once, persists failure consumption and refuses altered requests',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proof-s5-guard-'));let calls=0;
 const body=JSON.stringify({model:'sam-3.1',input:'synthetic'}),imageBody=JSON.stringify({model:'muse-image-1.0',n:1});
 const requests=[{slot:'sam',endpoint:'https://api.meta.ai/v1/responses',model:'sam-3.1',bodySha256:sha(body),maxResponseBytes:128},{slot:'image',endpoint:'https://api.meta.ai/v1/images/generations',model:'muse-image-1.0',bodySha256:sha(imageBody),maxResponseBytes:128}];
 const init=b=>({method:'POST',redirect:'error',body:b,signal:AbortSignal.timeout(1000)});
 const factory=()=>guardedMediaFetch({directory,rawDirectory:directory,requests,upstream:async()=>{calls++;throw Error('synthetic');}});
 try{
  await assert.rejects(factory()('https://unsafe.invalid',init(body)));await assert.rejects(factory()(requests[0].endpoint,init(body+' ')));assert.equal(calls,0);
  await assert.rejects(factory()(requests[0].endpoint,init(body)));await assert.rejects(factory()(requests[0].endpoint,init(body)));assert.equal(calls,1);
  await assert.rejects(factory()(requests[1].endpoint,init(imageBody)));await assert.rejects(factory()(requests[1].endpoint,init(imageBody)));assert.equal(calls,2);
  assert.equal(JSON.parse(await readFile(join(directory,'sam-dispatch.json'),'utf8')).consumed,true);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('S5 captures only bounded response bytes and blocks a successful slot across guard instances',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proof-s5-guard-'));let calls=0;
 const body='{}',request={slot:'image',endpoint:'https://api.meta.ai/v1/images/generations',model:'muse-image-1.0',bodySha256:sha(body),maxResponseBytes:64};
 const args={directory,rawDirectory:directory,requests:[request],upstream:async()=>{calls++;return Response.json({result:'fixture'});}};
 try{
  const r=await guardedMediaFetch(args)(request.endpoint,{method:'POST',redirect:'error',body,signal:AbortSignal.timeout(1000)});assert.deepEqual(await r.json(),{result:'fixture'});
  await assert.rejects(guardedMediaFetch(args)(request.endpoint,{method:'POST',redirect:'error',body,signal:AbortSignal.timeout(1000)}));assert.equal(calls,1);
  assert.equal(JSON.parse(await readFile(join(directory,'image-http.json'),'utf8')).status,200);
 }finally{await rm(directory,{recursive:true,force:true});}
});
