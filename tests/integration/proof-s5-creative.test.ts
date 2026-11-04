import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { connectDb } from '@/lib/db/client';
import { mintMerchant } from '@/lib/onboarding/links';
import { listOffers } from '@/lib/commitments/service';
import { uploadCreative, segmentCreative, approveCutout, composeCreative, decideCreative, getCreative, readCreativeMedia } from '@/lib/creative/service';
import { creativeDeps } from '@/lib/creative/deps';
import { createTestDatabase } from '../support/db';
import { creativeFixtureDeps, syntheticDishPhoto } from '../support/proof-s5';
let t: Awaited<ReturnType<typeof createTestDatabase>>, app: ReturnType<typeof connectDb>;
const role='backfill_t_s5_'+randomBytes(4).toString('hex');
beforeAll(async()=>{t=await createTestDatabase('proof_s5');await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);const url=new URL(t.url);url.username=role;app=connectDb(url.toString(),6);});
afterAll(async()=>{await app?.close();await t?.drop();const root=postgres(process.env.TEST_DATABASE_URL??'',{max:1});try{await root.unsafe(`DROP ROLE IF EXISTS ${role}`);}finally{await root.end({timeout:5});}});
async function owner(){const o=await mintMerchant(t.db,'SYNTHETIC LOCAL OFFER');const [r]=await t.admin`insert into rules(merchant_id,list_price_cents,capacity_covers,weekday,start_minute,end_minute,commit_by_minute,discount_bps,min_pool_covers,per_agent_cap_covers,floor_price_cents) values(${o.id},680,8,2,840,1020,720,2000,8,2,503) returning id`;return {...o,ruleId:String(r?.id)};}
async function upload(o:Awaited<ReturnType<typeof owner>>,background=false){return uploadCreative(app.db,o.id,{id:randomUUID(),ruleId:o.ruleId,termsVersion:1,bytes:await syntheticDishPhoto(),target:'synthetic rectangle',rightsBasis:'I took it',localPermission:true,hostedPermission:true,synthetic:true,includeBackground:background},creativeFixtureDeps());}
async function ready(o:Awaited<ReturnType<typeof owner>>,background=false){const u=await upload(o,background);if(!u.asset)throw Error(u.status);const id=u.asset.id;expect((await segmentCreative(app.db,o.id,id,creativeFixtureDeps())).status).toBe('cutout_review');expect((await approveCutout(app.db,o.id,id)).status).toBe('cutout_approved');const c=await composeCreative(app.db,o.id,id,creativeFixtureDeps());expect(c.status).toBe('review');return {id,asset:c.asset};}
it('stores exact public terms and original pixels, requires two approvals, persists and deduplicates final decision',async()=>{
  const o=await owner(), a=await ready(o,true);expect(a.asset?.approval).toBeNull();expect(a.asset?.text).toBe('SYNTHETIC LOCAL OFFER: 20% off, S$6.80 becomes S$5.44 per cover, Tuesday 14:00-17:00 Singapore time. It unlocks only if at least 8 covers are committed before 12:00 that day; one agent may hold at most 2 covers.');
  const hash=a.asset?.assetSha256??'';const outcomes=await Promise.all([decideCreative(app.db,o.id,a.id,{decision:'approve',sha256:hash}),decideCreative(app.db,o.id,a.id,{decision:'approve',sha256:hash})]);expect(outcomes.map(r=>r.status).sort()).toEqual(['already_approved','approved']);
  const saved=await getCreative(app.db,o.id,a.id);expect(saved.asset?.approval?.sha256).toBe(hash);expect(saved.asset?.provenance).toBe('fixture');expect(await readCreativeMedia(app.db,o.id,a.id,'composed')).not.toBeNull();
  expect(await t.admin`select count(*)::int as n from commitments`).toEqual([{n:0}]);
});
it('refuses wrong-owner reads/actions/media, stale terms and hash tampering',async()=>{
 const o=await owner(), stranger=await owner(), a=await ready(o);
 for(const operation of [getCreative(app.db,stranger.id,a.id),segmentCreative(app.db,stranger.id,a.id,creativeFixtureDeps()),approveCutout(app.db,stranger.id,a.id),composeCreative(app.db,stranger.id,a.id,creativeFixtureDeps()),decideCreative(app.db,stranger.id,a.id,{decision:'reject',sha256:''})])expect((await operation).status).toBe('not_found');
 expect(await readCreativeMedia(app.db,stranger.id,a.id,'source')).toBeNull();
 expect((await decideCreative(app.db,o.id,a.id,{decision:'approve',sha256:'0'.repeat(64)})).status).toBe('asset_changed');
 await t.admin`update rules set discount_bps=1500 where id=${o.ruleId}`;
 expect((await decideCreative(app.db,o.id,a.id,{decision:'approve',sha256:a.asset?.assetSha256??''})).status).toBe('stale');expect(await readCreativeMedia(app.db,o.id,a.id,'composed')).toBeNull();
});
it('makes rejection terminal, and an approved old version never transfers',async()=>{
 const o=await owner(), a=await ready(o);expect((await decideCreative(app.db,o.id,a.id,{decision:'reject',sha256:''})).status).toBe('rejected');expect((await decideCreative(app.db,o.id,a.id,{decision:'approve',sha256:a.asset?.assetSha256??''})).status).toBe('rejected');
 const b=await ready(o);await decideCreative(app.db,o.id,b.id,{decision:'approve',sha256:b.asset?.assetSha256??''});await t.admin`update rules set discount_bps=1900 where id=${o.ruleId}`;expect((await getCreative(app.db,o.id,b.id)).status).toBe('stale');expect(await readCreativeMedia(app.db,o.id,b.id,'composed')).toBeNull();
});
it('reserves before dispatch, refuses duplicate segmentation and ignores a result after owner rejection',async()=>{
 const o=await owner(),u=await upload(o);const id=u.asset?.id??'';let release:(v:unknown)=>void=()=>{};const pending=new Promise<unknown>(r=>{release=r;});const d={...creativeFixtureDeps(),segment:vi.fn(()=>pending)};const first=segmentCreative(app.db,o.id,id,d);
 for(let n=0;n<100;n++){if(d.segment.mock.calls.length)break;await new Promise(r=>setTimeout(r,5));}
 expect((await segmentCreative(app.db,o.id,id,d)).status).toBe('segmenting');expect(d.segment).toHaveBeenCalledTimes(1);
 await decideCreative(app.db,o.id,id,{decision:'reject',sha256:''});release({width:160,height:120,pixels:Array(19200).fill(1)});expect((await first).status).toBe('rejected');
});
it('fails closed on invalid/empty mask, timeout and failed optional background while offers remain usable',async()=>{
 const o=await owner();for(const output of [null,{width:160,height:120,pixels:[]},{width:160,height:120,pixels:Array(19200).fill(0)}]){const u=await upload(o);const d={...creativeFixtureDeps(),segment:vi.fn(async()=>output)};expect((await segmentCreative(app.db,o.id,u.asset?.id??'',d)).status).toBe('failed');await segmentCreative(app.db,o.id,u.asset?.id??'',d);expect(d.segment).toHaveBeenCalledTimes(1);}
 const u=await upload(o,true),id=u.asset?.id??'';await segmentCreative(app.db,o.id,id,creativeFixtureDeps());expect((await composeCreative(app.db,o.id,id,creativeFixtureDeps())).status).toBe('cutout_review');await approveCutout(app.db,o.id,id);
 const d={...creativeFixtureDeps(),background:vi.fn(async()=>null)};expect((await composeCreative(app.db,o.id,id,d)).status).toBe('failed');await composeCreative(app.db,o.id,id,d);expect(d.background).toHaveBeenCalledTimes(1);
 expect((await listOffers(app.db)).some(v=>v.offer.ruleId===o.ruleId)).toBe(true);
});
it('keeps default model deps disabled and validates photo permissions/duplicates',async()=>{
 expect(creativeDeps().available).toBe(false);const o=await owner(),u=await upload(o);expect((await segmentCreative(app.db,o.id,u.asset?.id??'',creativeDeps())).status).toBe('media_unavailable');
 const bytes=await syntheticDishPhoto(),id=randomUUID();const input={id,ruleId:o.ruleId,termsVersion:1,bytes,target:'dish',rightsBasis:'I took it',localPermission:true,hostedPermission:true,synthetic:true,includeBackground:false};
 expect((await uploadCreative(app.db,o.id,{...input,localPermission:false},creativeFixtureDeps())).status).toBe('invalid_request');expect((await uploadCreative(app.db,o.id,{...input,bytes:Buffer.from('89504e470d0a1a0a','hex')},creativeFixtureDeps())).status).toBe('invalid_photo');
 const first=await uploadCreative(app.db,o.id,input,creativeFixtureDeps());expect((await uploadCreative(app.db,o.id,input,creativeFixtureDeps())).asset?.id).toBe(first.asset?.id);expect((await uploadCreative(app.db,o.id,{...input,target:'different'},creativeFixtureDeps())).status).toBe('conflict');
 const publicPayload=JSON.stringify(await listOffers(app.db));for(const hidden of ['rightsBasis','sourceSha256','mask','floorPriceCents','hostedPermission','I took it'])expect(publicPayload).not.toContain(hidden);
});
it('database guards reject identity, provenance and resolved-approval mutations by the runtime role',async()=>{
 const o=await owner(),stranger=await owner(),a=await ready(o),sha256=a.asset?.assetSha256??'';
 await expect(app.db.execute(sql`update creative_assets set merchant_id=${stranger.id}::uuid where id=${a.id}::uuid`)).rejects.toMatchObject({cause:{constraint_name:'creative_identity'}});
 await expect(app.db.execute(sql`update creative_assets set record=jsonb_set(record,'{provenance}','"provider"') where id=${a.id}::uuid`)).rejects.toMatchObject({cause:{constraint_name:'creative_identity'}});
 await decideCreative(app.db,o.id,a.id,{decision:'approve',sha256});
 for(const statement of [
  sql`update creative_assets set terms_version=terms_version+1 where id=${a.id}::uuid`,
  sql`update creative_assets set rule_id=${stranger.ruleId}::uuid where id=${a.id}::uuid`,
  sql`update creative_assets set record=jsonb_set(record,'{composed,b64}','"changed"') where id=${a.id}::uuid`,
  sql`update creative_assets set record=jsonb_set(record,'{approval,sha256}',to_jsonb(${ '0'.repeat(64) }::text)) where id=${a.id}::uuid`,
 ])await expect(app.db.execute(statement)).rejects.toThrow();
 expect((await getCreative(app.db,o.id,a.id)).asset?.approval?.sha256).toBe(sha256);
});
it('composes an already approved cutout without model access when no background was requested',async()=>{
 const o=await owner(),u=await upload(o,false),id=u.asset?.id??'';
 await segmentCreative(app.db,o.id,id,creativeFixtureDeps());await approveCutout(app.db,o.id,id);
 const d={...creativeFixtureDeps(),available:false,segment:vi.fn(async()=>null),background:vi.fn(async()=>null)};
 expect((await composeCreative(app.db,o.id,id,d)).status).toBe('review');
 expect(d.segment).not.toHaveBeenCalled();expect(d.background).not.toHaveBeenCalled();
});
