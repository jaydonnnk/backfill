import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDb } from '@/lib/db/client';
import { mintMerchant } from '@/lib/onboarding/links';
import { uploadCreative, segmentCreative } from '@/lib/creative/service';
import { creativeDeps } from '@/lib/creative/deps';
import { createTestDatabase } from '../support/db';
import { syntheticDishPhoto } from '../support/proof-s5';
let t: Awaited<ReturnType<typeof createTestDatabase>>, app: ReturnType<typeof connectDb>;
const role='backfill_t_s5_'+randomBytes(4).toString('hex');
beforeAll(async()=>{t=await createTestDatabase('final_creative');await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);const url=new URL(t.url);url.username=role;app=connectDb(url.toString(),6);});
afterAll(async()=>{await app?.close();await t?.drop();const root=postgres(process.env.TEST_DATABASE_URL??'',{max:1});try{await root.unsafe(`DROP ROLE IF EXISTS ${role}`);}finally{await root.end({timeout:5});}});
async function owner(){const o=await mintMerchant(t.db,'SYNTHETIC LOCAL OFFER');const [r]=await t.admin`insert into rules(merchant_id,list_price_cents,capacity_covers,weekday,start_minute,end_minute,commit_by_minute,discount_bps,min_pool_covers,per_agent_cap_covers,floor_price_cents) values(${o.id},680,8,2,840,1020,720,2000,8,2,503) returning id`;return {...o,ruleId:String(r?.id)};}

beforeEach(async()=>{await t.admin`truncate rate_limits`;vi.unstubAllEnvs();vi.stubGlobal('fetch',async()=>new Response('{}',{status:503}));});
afterAll(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const input=async(o:Awaited<ReturnType<typeof owner>>)=>({id:randomUUID(),ruleId:o.ruleId,termsVersion:1,bytes:await syntheticDishPhoto(),target:'synthetic rectangle',rightsBasis:'Authored synthetic fixture',localPermission:true,hostedPermission:true,synthetic:true,includeBackground:false});
async function segment(o:Awaited<ReturnType<typeof owner>>){const deps=creativeDeps();const uploaded=await uploadCreative(app.db,o.id,await input(o),deps);expect(uploaded.status).toBe('source');return segmentCreative(app.db,o.id,uploaded.asset!.id,deps);}
it('defaults off and enables only on the explicit creative switch',()=>{expect(creativeDeps().available).toBe(false);vi.stubEnv('BACKFILL_CREATIVE_ENABLED','1');expect(creativeDeps().available).toBe(true);});
it('refuses the third hosted operation for one merchant',async()=>{
 vi.stubEnv('BACKFILL_CREATIVE_ENABLED','1');vi.stubEnv('META_API_KEY','offline-dummy');vi.stubEnv('META_BASE_URL','https://meta.test/v1');
 const o=await owner();expect((await segment(o)).status).toBe('failed');expect((await segment(o)).status).toBe('failed');expect((await segment(o)).status).toBe('media_unavailable');
});
it('refuses operation 21 globally across merchants',async()=>{
 vi.stubEnv('BACKFILL_CREATIVE_ENABLED','1');vi.stubEnv('META_API_KEY','offline-dummy');vi.stubEnv('META_BASE_URL','https://meta.test/v1');
 for(let i=0;i<10;i++){const o=await owner();expect((await segment(o)).status).toBe('failed');expect((await segment(o)).status).toBe('failed');}
 expect((await segment(await owner())).status).toBe('media_unavailable');
});
it('refuses a hosted source above two million pixels before dispatch',async()=>{
 vi.stubEnv('BACKFILL_CREATIVE_ENABLED','1');let calls=0;vi.stubGlobal('fetch',async()=>{calls++;return new Response('{}',{status:503});});
 const o=await owner();const bytes=await sharp({create:{width:2001,height:1000,channels:3,background:'#fff'}}).png().toBuffer();
 expect((await uploadCreative(app.db,o.id,{...await input(o),bytes},creativeDeps())).status).toBe('invalid_photo');expect(calls).toBe(0);
});
it('refuses older oversized source bytes at the provider boundary too',async()=>{
 vi.stubEnv('BACKFILL_CREATIVE_ENABLED','1');vi.stubEnv('META_API_KEY','offline-dummy');vi.stubEnv('META_BASE_URL','https://meta.test/v1');
 let calls=0;vi.stubGlobal('fetch',async()=>{calls++;return new Response('{}',{status:503});});
 const bytes=await sharp({create:{width:2001,height:1000,channels:3,background:'#fff'}}).png().toBuffer();
 expect(await creativeDeps().segment({bytes,mediaType:'image/png',target:'dish',width:2001,height:1000})).toBeNull();expect(calls).toBe(0);
});
