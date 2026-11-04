import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {createTestDatabase} from '../../tests/support/db';
import {connectDb} from '../../src/lib/db/client';
import {creativeAssets,merchants,rules} from '../../src/lib/db/schema';
import {uploadCreative,segmentCreative,approveCutout,composeCreative,readCreativeMedia,getCreative,decideCreative} from '../../src/lib/creative/service';
import {Mask} from '../../src/lib/creative/pixels';

// Local replay of already saved outputs. No env loading, provider, HTTP or new inference.
const configured=new URL(process.env.TEST_DATABASE_URL??'http://missing.invalid');
assert.deepEqual([configured.protocol,configured.hostname,configured.port,configured.pathname],['postgres:','127.0.0.1','5432','/postgres']);
globalThis.fetch=async()=>{throw Error('HTTP is forbidden during approved-cutout composition');};
const finalDecision=process.argv[2]==='--approve-final';
assert(process.argv.length===2||finalDecision,'Use no argument or --approve-final');
const root=resolve(finalDecision?'docs/plans/backfill-proof/evidence/s5-final-approval-2026-11-04-01':'docs/plans/backfill-proof/evidence/s5-composition-2026-11-04-01');
const output=resolve(finalDecision?'archive/proof-s5-final-approval-2026-11-04-01':'archive/proof-s5-composition-2026-11-04-01');
const finalContext=finalDecision?z.object({asset:z.object({id:z.uuid(),ruleId:z.uuid(),termsVersion:z.literal(1)}),compositionSha256:z.literal('de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a')}).parse(JSON.parse(await readFile('docs/plans/backfill-proof/evidence/s5-composition-2026-11-04-01/composition-receipt.json','utf8'))):null;
const live=resolve('docs/plans/backfill-proof/evidence/s5-live-authorized-2026-11-04-01');
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const save=async(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',flush:true});
const original=z.object({ownerId:z.uuid(),ruleId:z.uuid(),backgroundSha256:z.string()}).parse(JSON.parse(await readFile(join(live,'service-receipt.json'),'utf8')));
const approved=z.object({sourceSha256:z.string(),cutoutSha256:z.string(),selectedPixels:z.literal(403621)}).parse(JSON.parse(await readFile('archive/proof-s5-review-2026-11-04-01/derivation.json','utf8')));
const source=await readFile('archive/proof-s5-inputs/owner-meal-2026-11-04.png');
const cutout=await readFile('archive/proof-s5-review-2026-11-04-01/cutout.png');
const background=await readFile('archive/proof-s5-live-authorized-2026-11-04-01/background.png');
assert.equal(sha(source),approved.sourceSha256);assert.equal(sha(cutout),approved.cutoutSha256);assert.equal(sha(background),original.backgroundSha256);
const frozen=JSON.parse(await readFile(join(live,'call-integrity.json'),'utf8'));
for(const entry of frozen.markersAndReceipts)assert.equal(sha(await readFile(join(live,entry.path))),entry.sha256);
const expectedText='SYNTHETIC LOCAL OFFER: 20% off, S$6.80 becomes S$5.44 per cover, Tuesday 14:00-17:00 Singapore time. It unlocks only if at least 8 covers are committed before 12:00 that day; one agent may hold at most 2 covers.';
const rgba=await sharp(cutout).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const pixels=[];for(let i=3;i<rgba.data.length;i+=4){const alpha=rgba.data[i];assert(alpha===0||alpha===255);pixels.push(alpha===255?1:0);}
const mask=Mask.parse({width:rgba.info.width,height:rgba.info.height,pixels});
assert.equal(pixels.filter(p=>p===1).length,approved.selectedPixels);
await mkdir(root);await mkdir(output);
if(finalDecision)await copyFile('docs/plans/backfill-proof/evidence/s5-composition-2026-11-04-01/cutout-approval.json',join(root,'cutout-approval.json'));
else await save(join(root,'cutout-approval.json'),{userResponse:'Sure',scope:'Approve this exact corrected cutout for composition with the saved generated background. Final asset approval and public posting are separate.',recordedAt:new Date().toISOString(),sourceSha256:approved.sourceSha256,cutoutSha256:approved.cutoutSha256,backgroundSha256:original.backgroundSha256,ruleId:original.ruleId,termsVersion:1,publicOfferText:expectedText,newModelCalls:0,finalAssetApproval:null,publicPosting:false});
let database:Awaited<ReturnType<typeof createTestDatabase>>|undefined,app:ReturnType<typeof connectDb>|undefined,roleCreated=false;
const role='backfill_t_s5_compose_'+randomBytes(4).toString('hex');
try{
 database=await createTestDatabase('proof_s5_compose');
 await database.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);roleCreated=true;
 const runtime=new URL(database.url);runtime.username=role;app=connectDb(runtime.toString(),3);
 await database.db.insert(merchants).values({id:original.ownerId,name:'SYNTHETIC LOCAL OFFER'});
 await database.db.insert(rules).values({id:original.ruleId,merchantId:original.ownerId,listPriceCents:680,capacityCovers:8,weekday:2,startMinute:840,endMinute:1020,commitByMinute:720,discountBps:2000,minPoolCovers:8,perAgentCapCovers:2,floorPriceCents:503});
 const id=finalContext?.asset.id??randomUUID();
 if(finalContext){assert.equal(finalContext.asset.ruleId,original.ruleId);assert.equal(sha(await readFile('archive/proof-s5-composition-2026-11-04-01/offer-preview.png')),finalContext.compositionSha256);}
 let segmentReplays=0,backgroundReplays=0;
 const deps={source:'replay' as const,available:true,segment:async()=>{segmentReplays++;return mask;},background:async()=>{backgroundReplays++;return background;}};
 const uploaded=await uploadCreative(app.db,original.ownerId,{id,ruleId:original.ruleId,termsVersion:1,bytes:source,target:'breaded cutlets, rice bowl, covered soup bowl',rightsBasis:'User states: I took it',localPermission:true,hostedPermission:true,synthetic:true,includeBackground:true},deps);
 assert.equal(uploaded.status,'source');assert.equal(uploaded.asset?.text,expectedText);
 const segmented=await segmentCreative(app.db,original.ownerId,id,deps);assert.equal(segmented.status,'cutout_review');assert.equal(segmented.asset?.cutoutSha256,approved.cutoutSha256);
 // Only the cutout approval in this user's turn is applied; no final decision is inferred.
 const accepted=await approveCutout(app.db,original.ownerId,id);assert.equal(accepted.status,'cutout_approved');assert.equal(accepted.asset?.cutoutApproval?.sha256,approved.cutoutSha256);
 const composed=await composeCreative(app.db,original.ownerId,id,deps);assert.equal(composed.status,'review');assert.equal(composed.asset?.approval,null);assert.equal(composed.asset?.text,expectedText);
 const media=await readCreativeMedia(app.db,original.ownerId,id,'composed');assert(media);assert.equal(sha(media.bytes),composed.asset?.assetSha256);
 await writeFile(join(output,'offer-preview.png'),media.bytes,{flag:'wx',flush:true});
 const rendered=await sharp(media.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const originalRgb=await sharp(source).ensureAlpha().raw().toBuffer();
 // Independent placement expectation: centered at native resolution with 32 px bottom padding.
 const left=(rendered.info.width-rgba.info.width)/2,top=rendered.info.height-rgba.info.height-32;
 assert.equal(left,32);assert(top>0);let verified=0;
 for(const [i,pixel]of pixels.entries())if(pixel){
  const x=i%rgba.info.width;const y=Math.floor(i/rgba.info.width);
  const destination:number=((y+top)*rendered.info.width+x+left)*4;
  assert.deepEqual(rendered.data.subarray(destination,destination+4),originalRgb.subarray(i*4,i*4+4));verified++;
 }
 assert.equal(verified,403621);assert.equal(segmentReplays,1);assert.equal(backgroundReplays,1);
 if(finalContext){
  assert.equal(sha(media.bytes),finalContext.compositionSha256,'The exact reviewed asset must reproduce before approval');
  const decision=await decideCreative(app.db,original.ownerId,id,{decision:'approve',sha256:finalContext.compositionSha256});assert.equal(decision.status,'approved');
  const duplicate=await decideCreative(app.db,original.ownerId,id,{decision:'approve',sha256:finalContext.compositionSha256});assert.equal(duplicate.status,'already_approved');
  await save(join(root,'final-approval.json'),{userResponse:'Approved. Then move on to the next step(let me know )',scope:'This exact asset approved for local use. No public posting, production, commit, push or deployment.',asset:decision.asset,compositionSha256:sha(media.bytes),newModelCalls:0,publicPosting:false,idempotentRepeatStatus:duplicate.status});
 }
 const saved=await getCreative(app.db,original.ownerId,id);assert.equal(saved.status,finalDecision?'approved':'review');
 if(finalContext)assert.equal(saved.asset?.approval?.sha256,finalContext.compositionSha256);else assert.equal(saved.asset?.approval,null);
 const [record]=await app.db.select().from(creativeAssets).where(eq(creativeAssets.id,id));assert(record);
 const [rule]=await database.db.select().from(rules).where(eq(rules.id,original.ruleId));assert(rule);
 await save(join(output,'private-state.json'),{merchant:{id:original.ownerId,name:'SYNTHETIC LOCAL OFFER'},rule,asset:record,approvalEvidence:join(root,'cutout-approval.json')});
 await save(join(root,'composition-receipt.json'),{assurance:'Actual owner-bound services and disposable restricted-role database. User-approved corrected cutout; saved genuine SAM-derived mask and Image output replayed locally. No authentication or fresh inference claim.',asset:saved.asset,sourceSha256:approved.sourceSha256,approvedCutoutSha256:approved.cutoutSha256,backgroundSha256:original.backgroundSha256,compositionSha256:sha(media.bytes),publicOfferText:expectedText,sourcePixelsVerified:verified,allSelectedSourcePixelsExactlyMatch:true,dimensions:{width:rendered.info.width,height:rendered.info.height},foodPlacement:{left,top},segmentReplays,backgroundReplays,newModelCalls:0,finalAssetApproval:saved.asset?.approval??null,publicPosting:false,privateState:join(output,'private-state.json')});
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backfill offer preview</title><style>body{font:16px system-ui;background:#fffdf7;color:#20251f;margin:24px}main{max-width:1100px;margin:auto}img{display:block;width:100%;height:auto}p{line-height:1.6;max-width:75ch}code{overflow-wrap:anywhere}</style><main><h1>Review this exact offer asset</h1><p>Real source photo pixels, your approved corrected cutout, and the saved generated background. Synthetic local offer. No new model calls. ${finalDecision?'This exact asset is approved for local use. Nothing was posted.':'This asset is not yet approved or posted.'}</p><img src="offer-preview.png" alt="Synthetic offer preview using the approved real-food cutout"><p>${expectedText}</p><p>Asset SHA-256: <code>${sha(media.bytes)}</code></p></main></html>`;
 await writeFile(join(output,'review.html'),html,{flag:'wx'});
 console.log(JSON.stringify({status:saved.status,sourcePixelsVerified:verified,compositionSha256:sha(media.bytes),newModelCalls:0,finalAssetApproval:saved.asset?.approval??null,preview:join(output,'offer-preview.png')}));
}finally{
 await app?.close();await database?.drop();
 const admin=postgres(configured.toString(),{max:1,onnotice:()=>{}});
 try{if(roleCreated)await admin.unsafe(`DROP ROLE IF EXISTS ${role}`);const roles=await admin`select rolname from pg_roles where rolname=${role}`;const dbs=database?await admin`select datname from pg_database where datname=${new URL(database.url).pathname.slice(1)}`:[];assert.equal(roles.length,0);assert.equal(dbs.length,0);await save(join(root,'cleanup.json'),{ownedRoleRemaining:roles.length,ownedDatabaseRemaining:dbs.length,newModelCalls:0,productionChanges:false});}finally{await admin.end({timeout:5});}
 for(const entry of frozen.markersAndReceipts)assert.equal(sha(await readFile(join(live,entry.path))),entry.sha256);
}
