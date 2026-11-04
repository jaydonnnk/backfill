import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { z } from 'zod';
import { loadLocalEnvFile } from '../../src/env';
import { createTestDatabase } from '../../tests/support/db';
import { connectDb } from '../../src/lib/db/client';
import { mintMerchant } from '../../src/lib/onboarding/links';
import { uploadCreative, segmentCreative, getCreative, readCreativeMedia } from '../../src/lib/creative/service';
import { createMediaClient, samRequest, backgroundRequest } from '../../src/integrations/meta/media';
import { decodeSamResponse, samObjectTarget } from '../../src/integrations/meta/sam';
import { inspectPhoto } from '../../src/lib/creative/pixels';
import { guardedMediaFetch, type MediaRequestPin } from './proof-s5-live-guard.mjs';

const ROOT=resolve('docs/plans/backfill-proof/evidence/s5-live-authorized-2026-11-04-01');
const PRIVATE=resolve('archive/proof-s5-live-authorized-2026-11-04-01');
const PHOTO=resolve('archive/proof-s5-inputs/owner-meal-2026-11-04.png');
const PHOTO_SHA='34b4c4af727ee2e238bf2e8b6780cb45ca62f8140e6c843899a2e3f9775e5fe8';
const BASE='https://api.meta.ai/v1';
const TARGET='breaded cutlets, rice bowl, covered soup bowl';
const OBJECTS=[
  {id:0,prompts:[{box:{left:430,top:485,right:960,bottom:905}}]},
  {id:1,prompts:[{box:{left:0,top:530,right:405,bottom:1190}}]},
  {id:2,prompts:[{box:{left:65,top:95,right:405,bottom:385}}]},
];
const INPUTS=['src/integrations/meta/media.ts','src/integrations/meta/sam.ts','src/lib/creative/pixels.ts','src/lib/creative/service.ts','scripts/verification/proof-s5-live.ts','scripts/verification/proof-s5-live-guard.mjs','package.json','package-lock.json','drizzle/0017_proof_s5_creative.sql'];
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const json=async(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',flush:true});
const Pins=z.object({slot:z.enum(['sam','image']),endpoint:z.string(),model:z.string(),bodySha256:z.string().regex(/^[a-f0-9]{64}$/u),maxResponseBytes:z.int().positive()});
const Prepared=z.object({photoSha256:z.literal(PHOTO_SHA),requests:z.array(Pins).length(2),sourceHashes:z.array(z.object({path:z.string(),sha256:z.string()})),maxApiListPriceUsd:z.literal(0.0125)});

async function main(){
 const mode=process.argv[2];assert(mode==='--prepare'||mode==='--run','Use --prepare or --run');
 // Explicit loopback configuration before env loading, test DB creation or provider construction.
 const configured=new URL(process.env.TEST_DATABASE_URL??'http://missing.invalid');
 assert.deepEqual([configured.protocol,configured.hostname,configured.port,configured.pathname],['postgres:','127.0.0.1','5432','/postgres']);
 const bytes=await readFile(PHOTO);assert.equal(sha(bytes),PHOTO_SHA);
 const size=await inspectPhoto(bytes);assert.deepEqual(size,{width:960,height:1280});
 const prompt=samObjectTarget(size,OBJECTS),samBody=JSON.stringify(samRequest(prompt,`data:image/png;base64,${bytes.toString('base64')}`)),imageBody=JSON.stringify(backgroundRequest());
 const requests:MediaRequestPin[]=[{slot:'sam',endpoint:BASE+'/responses',model:'sam-3.1',bodySha256:sha(samBody),maxResponseBytes:2_097_152},{slot:'image',endpoint:BASE+'/images/generations',model:'muse-image-1.0',bodySha256:sha(imageBody),maxResponseBytes:6_100_000}];
 if(mode==='--prepare'){
  await mkdir(ROOT);await mkdir(PRIVATE);
  await writeFile(join(PRIVATE,'sam-request.json'),samBody,{flag:'wx',flush:true});
  await writeFile(join(PRIVATE,'image-request.json'),imageBody,{flag:'wx',flush:true});
  await json(join(ROOT,'approved-run.json'),{
   approval:'User: Authorize the installation as well as the model calls. Scoped conservatively to one SAM still-image request and one Image background, no retries.',
   preparedAt:new Date().toISOString(),photoSha256:PHOTO_SHA,sourceSize:size,sourceBytes:bytes.length,sourceTransformed:false,
   target:TARGET,ownerLabel:'gyukatsu pork tenderloin, rice, miso soup',labelVerification:'Owner-supplied, not visually verified. Covered soup is not revealed or regenerated.',
   objects:OBJECTS,exactSamTarget:prompt,requests,maxAttemptsPerModel:1,timeoutMs:30_000,redirects:'error',retries:0,polling:0,fallback:0,
   priceSource:'https://dev.meta.ai/docs/pricing-rate-limits',priceCheckedAt:'2026-11-04',maxApiListPriceUsd:0.0125,invoicedUsd:null,
   publicPostingApproved:false,assetApproval:false,cutoutApproval:false,syntheticPublicTerms:'SYNTHETIC LOCAL OFFER: 20% off, S$6.80 becomes S$5.44 per cover, Tuesday 14:00-17:00 Singapore time. It unlocks only if at least 8 covers are committed before 12:00 that day; one agent may hold at most 2 covers.',
   sourceHashes:await Promise.all(INPUTS.map(async path=>({path,sha256:sha(await readFile(path))}))),
  });
  console.log('Prepared exact S5 inputs and a two-call maximum. No inference dispatched.');return;
 }
 assert.equal(process.env.BACKFILL_S5_MEDIA_APPROVED,'1','Explicit bounded run switch required');
 const prepared=Prepared.parse(JSON.parse(await readFile(join(ROOT,'approved-run.json'),'utf8')));
 assert.deepEqual(prepared.requests,requests);
 for(const item of prepared.sourceHashes)assert.equal(sha(await readFile(item.path)),item.sha256,'Pinned source changed');
 assert.equal(sha(await readFile(join(PRIVATE,'sam-request.json'))),sha(samBody));
 assert.equal(sha(await readFile(join(PRIVATE,'image-request.json'))),sha(imageBody));
 for(const name of ['sam-dispatch.json','image-dispatch.json','run-started.json']){
  try{await access(join(ROOT,name));throw Error('This bounded run is already started or consumed');}catch(e){if(!(e instanceof Error)||!('code'in e)||e.code!=='ENOENT')throw e;}
 }
 process.env.DATABASE_URL=configured.toString();loadLocalEnvFile();
 assert.equal(process.env.DATABASE_URL,configured.toString(),'Runtime DB must stay explicit loopback');
 assert(!process.env.META_BASE_URL||process.env.META_BASE_URL.replace(/\/$/u,'')===BASE,'Configured media endpoint differs');
 const key=process.env.META_API_KEY;assert(key&&key.length>0,'META_API_KEY missing from normal runtime configuration');
 await json(join(ROOT,'run-started.json'),{startedAt:new Date().toISOString(),maximumCalls:2,consumed:true});
 const role='backfill_t_s5_live_'+randomBytes(4).toString('hex');
 let database:Awaited<ReturnType<typeof createTestDatabase>>|undefined,app:ReturnType<typeof connectDb>|undefined,roleCreated=false;
 try{
  database=await createTestDatabase('proof_s5_live');
  await database.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);roleCreated=true;
  const runtime=new URL(database.url);runtime.username=role;app=connectDb(runtime.toString(),3);
  const owner=await mintMerchant(database.db,'SYNTHETIC LOCAL OFFER');
  const [rule]=await database.admin`insert into rules(merchant_id,list_price_cents,capacity_covers,weekday,start_minute,end_minute,commit_by_minute,discount_bps,min_pool_covers,per_agent_cap_covers,floor_price_cents) values(${owner.id},680,8,2,840,1020,720,2000,8,2,503) returning id`;
  const ruleId=z.uuid().parse(rule?.id),id=randomUUID();
  const guarded=guardedMediaFetch({directory:ROOT,rawDirectory:PRIVATE,requests,upstream:fetch});
  const client=createMediaClient({baseUrl:BASE,apiKey:key,fetch:guarded,timeoutMs:30_000});
  const deps={source:'provider' as const,available:true,segment:(input:Parameters<typeof client.segment>[0])=>client.segment({...input,objects:OBJECTS}),background:()=>client.background()};
  const uploaded=await uploadCreative(app.db,owner.id,{id,ruleId,termsVersion:1,bytes,target:TARGET,rightsBasis:'User states: I took it',localPermission:true,hostedPermission:true,synthetic:true,includeBackground:true},deps);
  assert.equal(uploaded.status,'source');assert.equal(uploaded.asset?.text,JSON.parse(await readFile(join(ROOT,'approved-run.json'),'utf8')).syntheticPublicTerms);
  const segmented=await segmentCreative(app.db,owner.id,id,deps);
  let components:unknown=null;
  if(segmented.status==='cutout_review'){
   const parsed=await decodeSamResponse(await readFile(join(PRIVATE,'sam-response.raw'),'utf8'),size,['0','1','2']);components=parsed.components;
   for(const kind of ['mask','cutout']){const media=await readCreativeMedia(app.db,owner.id,id,kind);assert(media);await writeFile(join(PRIVATE,`${kind}.png`),media.bytes,{flag:'wx',flush:true});}
   const original=await sharp(bytes).ensureAlpha().raw().toBuffer(),cutout=await sharp(await readFile(join(PRIVATE,'cutout.png'))).ensureAlpha().raw().toBuffer();
   let selected=0;for(const [i,pixel] of parsed.mask.pixels.entries()){assert.deepEqual(cutout.subarray(i*4,i*4+3),original.subarray(i*4,i*4+3));assert.equal(cutout[i*4+3],pixel*255);if(pixel)selected++;}
   await json(join(ROOT,'pixel-proof.json'),{sourceSha256:PHOTO_SHA,cutoutSha256:sha(await readFile(join(PRIVATE,'cutout.png'))),allSourceRgbPreserved:true,selectedPixels:selected,sourceSize:size,components,approval:null});
  }
  // The decorative background is independent of cutout approval and receives no photo.
  // It is saved for later owner-approved composition, never attached or approved here.
  const background=await client.background();
  if(background)await writeFile(join(PRIVATE,'background.png'),background,{flag:'wx',flush:true});
  await json(join(ROOT,'service-receipt.json'),{assurance:'Genuine bounded media attempts, real owner-bound service and disposable restricted-role database. No human cutout or final-asset approval.',completedAt:new Date().toISOString(),ownerId:owner.id,ruleId,asset:segmented.asset,segmentationStatus:segmented.status,backgroundValid:background!==null,backgroundSha256:background?sha(background):null,components,modelAttemptsMaximum:2,callAllowanceClosed:true,actualInvoicedUsd:null,commitments:0,publicPosting:false});
  assert.equal((await getCreative(app.db,owner.id,id)).asset?.approval,null);
  await json(join(ROOT,'awaiting-owner-review.json'),{cutoutApprovalRequired:segmented.status==='cutout_review',finalAssetApproval:false,compositionCreated:false,backgroundPrepared:background!==null});
  console.log(`S5 bounded run finished. Segmentation: ${segmented.status}; valid background: ${background!==null}. No approval or posting.`);
 }finally{
  await app?.close();await database?.drop();
  const admin=postgres(configured.toString(),{max:1,onnotice:()=>{}});
  try{if(roleCreated)await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);const remaining=await admin`select rolname from pg_roles where rolname=${role}`;const dbs=database?await admin`select datname from pg_database where datname=${new URL(database.url).pathname.slice(1)}`:[];assert.equal(remaining.length,0);assert.equal(dbs.length,0);await json(join(ROOT,'cleanup.json'),{ownedRoleRemaining:remaining.length,ownedDatabaseRemaining:dbs.length,productionChanges:false});}finally{await admin.end({timeout:5});}
 }
}
main().catch(async()=>{try{await json(join(ROOT,'runner-failure.json'),{failed:true,retryAuthorized:false,details:'Inspect retained bounded receipts locally; no external error body or credential is printed.'});}catch{}console.error('S5 runner stopped. Inspect retained receipts; do not retry any consumed call.');process.exitCode=1;});
