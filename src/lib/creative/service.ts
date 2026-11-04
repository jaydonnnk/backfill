import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { judgePhoto } from '@/domain/onboarding/menu';
import { toOffer } from '@/domain/offers/evaluate';
import type { Db, Executor } from '@/lib/db/client';
import { creativeAssets, merchants, rules } from '@/lib/db/schema';
import { termsSummary, toRule } from '@/lib/commitments/service';
import type { SegmentInput } from '@/integrations/meta/media';
import { composeAsset, cutoutPhoto, inspectPhoto, maskPng } from './pixels';

export type CreativeDeps = { source: 'fixture' | 'provider' | 'replay'; available: boolean; segment: (input: SegmentInput) => Promise<unknown>; background: () => Promise<Uint8Array | null> };
const Id=z.uuid(), Hash=z.string().regex(/^[a-f0-9]{64}$/u), Text=z.string().trim().min(1).max(120).refine(s=>!/[\u0000-\u001f]/u.test(s));
const Phase=z.enum(['source','segmenting','cutout_review','cutout_approved','composing','review','approved','rejected','failed']);
const Image=z.object({ b64:z.string().max(16_000_000), sha256:Hash });
const Approval=z.object({sha256:Hash,at:z.iso.datetime()});
const Record=z.object({
  target:Text, rightsBasis:Text, localPermission:z.literal(true), hostedPermission:z.boolean(), synthetic:z.boolean(), includeBackground:z.boolean(),
  provenance:z.enum(['fixture','provider','replay']), source:Image, sourceMediaType:z.enum(['image/png','image/jpeg','image/webp']),
  width:z.int().positive().max(4096),height:z.int().positive().max(4096),text:z.string().max(1200),
  phase:Phase, mask:Image.nullable(), cutout:Image.nullable(), background:Image.nullable(), composed:Image.nullable(),
  cutoutApproval:Approval.nullable(),approval:Approval.nullable(), reason:z.string().nullable(),
  segmentReservedAt:z.iso.datetime().nullable(),backgroundReservedAt:z.iso.datetime().nullable(),
}).refine(r=> !['cutout_review','cutout_approved','composing','review','approved'].includes(r.phase) || (r.cutout!==null&&r.mask!==null), 'Missing cutout')
  .refine(r=> !['cutout_approved','composing','review','approved'].includes(r.phase) || r.cutoutApproval?.sha256===r.cutout?.sha256, 'Missing cutout approval')
  .refine(r=> !['review','approved'].includes(r.phase) || r.composed!==null, 'Missing composition')
  .refine(r=> r.phase!=='approved' || r.approval?.sha256===r.composed?.sha256, 'Missing exact approval');
type Stored=z.infer<typeof Record>;
type Row=typeof creativeAssets.$inferSelect;
export type CreativeView = {
  id:string;ruleId:string;termsVersion:number;phase:z.infer<typeof Phase>;stale:boolean;text:string;target:string;provenance:Stored['provenance'];synthetic:boolean;
  sourceSha256:string;assetSha256:string|null;cutoutSha256:string|null;cutoutApproval:z.infer<typeof Approval>|null;approval:z.infer<typeof Approval>|null;
  media:('source'|'mask'|'cutout'|'background'|'composed')[];reason:string|null;
};
export type CreativeResult={status:string;asset:CreativeView|null};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const image=(bytes:Uint8Array)=>({b64:Buffer.from(bytes).toString('base64'),sha256:digest(bytes)});
const now=()=>new Date().toISOString();
const keys=['source','mask','cutout','background','composed'] as const;
function result(status:string,row?:Row,stale=false):CreativeResult {
  if(!row)return {status,asset:null};const r=Record.parse(row.record);
  return {status,asset:{id:row.id,ruleId:row.ruleId,termsVersion:row.termsVersion,phase:r.phase,stale,text:r.text,target:r.target,provenance:r.provenance,synthetic:r.synthetic,sourceSha256:r.source.sha256,assetSha256:r.composed?.sha256??null,cutoutSha256:r.cutout?.sha256??null,cutoutApproval:r.cutoutApproval,approval:r.approval,media:keys.filter(k=>r[k]!==null),reason:r.reason}};
}
async function rowOf(db:Executor,merchantId:string,id:string,lock=false){
  const q=db.select().from(creativeAssets).where(and(eq(creativeAssets.id,id),eq(creativeAssets.merchantId,merchantId)));
  return (lock?await q.for('update'):await q)[0];
}
async function staleRule(db:Executor,row:Row,lock=false){
  if(lock)await db.execute(sql`select lock_rule_for_clearing(${row.ruleId}::uuid)`);
  const r=(await db.select().from(rules).where(and(eq(rules.id,row.ruleId),eq(rules.merchantId,row.merchantId))))[0];
  return !r||r.termsVersion!==row.termsVersion;
}
async function save(db:Executor,row:Row,record:Stored){const [saved]=await db.update(creativeAssets).set({record:Record.parse(record)}).where(eq(creativeAssets.id,row.id)).returning();return saved;}
export async function getCreative(db:Db,merchantId:string,id:string):Promise<CreativeResult>{
  if(!Id.safeParse(id).success||!Id.safeParse(merchantId).success)return result('not_found');
  const row=await rowOf(db,merchantId,id);if(!row)return result('not_found');const stale=await staleRule(db,row);
  return result(stale?'stale':Record.parse(row.record).phase,row,stale);
}
export async function latestCreative(db:Db,merchantId:string,ruleId:string):Promise<CreativeView|null>{
  const [row]=await db.select().from(creativeAssets).where(and(eq(creativeAssets.merchantId,merchantId),eq(creativeAssets.ruleId,ruleId))).orderBy(desc(creativeAssets.createdAt)).limit(1);
  return row?(await getCreative(db,merchantId,row.id)).asset:null;
}
const Upload=z.object({id:Id,ruleId:Id,termsVersion:z.int().positive(),target:Text,rightsBasis:Text,localPermission:z.literal(true),hostedPermission:z.boolean(),synthetic:z.boolean(),includeBackground:z.boolean()});
export async function uploadCreative(db:Db,merchantId:string,input:Omit<z.input<typeof Upload>,'localPermission'>&{localPermission:boolean;bytes:Uint8Array},deps:CreativeDeps):Promise<CreativeResult>{
  const p=Upload.safeParse(input);if(!p.success||!Id.safeParse(merchantId).success)return result('invalid_request');
  const photo=judgePhoto(input.bytes);if(!photo.ok)return result('invalid_photo');
  let size:{width:number;height:number};try{size=await inspectPhoto(input.bytes);}catch{return result('invalid_photo');}
  const source=image(input.bytes);
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${merchantId},4151015))`);
    const [existing]=await tx.select().from(creativeAssets).where(eq(creativeAssets.id,p.data.id));
    if(existing){if(existing.merchantId!==merchantId)return result('not_found');const r=Record.parse(existing.record);const conflict=existing.ruleId!==input.ruleId||existing.termsVersion!==input.termsVersion||r.source.sha256!==source.sha256||r.target!==p.data.target||r.rightsBasis!==p.data.rightsBasis||r.hostedPermission!==p.data.hostedPermission||r.includeBackground!==p.data.includeBackground||r.synthetic!==p.data.synthetic;return conflict?result('conflict'):result(r.phase,existing);}
    const [attempts]=await tx.execute<{n:number}>(sql`select count(*)::int as n from creative_assets where merchant_id=${merchantId}::uuid and created_at>now()-interval '1 day'`);
    if((attempts?.n??0)>=20)return result('daily_cap');
    await tx.execute(sql`select lock_rule_for_clearing(${input.ruleId}::uuid)`);
    const [row]=await tx.select().from(rules).where(and(eq(rules.id,input.ruleId),eq(rules.merchantId,merchantId)));
    if(!row)return result('not_found');if(row.termsVersion!==input.termsVersion)return result('stale');
    const [owner]=await tx.select({name:merchants.name}).from(merchants).where(eq(merchants.id,merchantId));
    const text=termsSummary(owner?.name??'',toOffer(toRule(row)));
    const record:Stored={...p.data,...size,text,source,sourceMediaType:photo.mediaType,provenance:deps.source,phase:'source',mask:null,cutout:null,background:null,composed:null,cutoutApproval:null,approval:null,reason:null,segmentReservedAt:null,backgroundReservedAt:null};
    const [saved]=await tx.insert(creativeAssets).values({id:input.id,merchantId,ruleId:input.ruleId,termsVersion:input.termsVersion,record:Record.parse(record)}).returning();
    return result('source',saved);
  });
}
async function reserve(db:Db,merchantId:string,id:string,expected:Stored['phase'],next:Stored['phase'],deps:CreativeDeps){
  if(!Id.safeParse(id).success||!Id.safeParse(merchantId).success)return {invoke:false as const,output:result('invalid_request')};
  return db.transaction(async tx=>{
    const row=await rowOf(tx,merchantId,id,true);if(!row)return {invoke:false as const,output:result('not_found')};
    if(await staleRule(tx,row,true))return {invoke:false as const,output:result('stale',row,true)};
    const r=Record.parse(row.record);if(r.phase!==expected)return {invoke:false as const,output:result(r.phase,row)};
    const needsModel=next==='segmenting'||r.includeBackground;
    if(needsModel&&!deps.available)return {invoke:false as const,output:result('media_unavailable',row)};
    if(needsModel&&r.provenance!==deps.source)return {invoke:false as const,output:result('model_mismatch',row)};
    if(next==='segmenting'&&deps.source==='provider'&&!r.hostedPermission)return {invoke:false as const,output:result('upload_not_permitted',row)};
    const reserved={...r,phase:next,...(next==='segmenting'?{segmentReservedAt:now()}:r.includeBackground?{backgroundReservedAt:now()}:{})};
    await save(tx,row,reserved);return {invoke:true as const,row,record:reserved};
  });
}
async function finish(db:Db,merchantId:string,id:string,expected:Stored['phase'],update:Partial<Stored>){
  return db.transaction(async tx=>{const row=await rowOf(tx,merchantId,id,true);if(!row)return result('not_found');if(await staleRule(tx,row,true))return result('stale',row,true);const r=Record.parse(row.record);if(r.phase!==expected)return result(r.phase,row);const saved=await save(tx,row,{...r,...update});return result(update.phase??r.phase,saved);});
}
async function bounded<T>(work:Promise<T>):Promise<T|null>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),31_000);})]);}catch{return null;}finally{clearTimeout(timer);}}
export async function segmentCreative(db:Db,merchantId:string,id:string,deps:CreativeDeps):Promise<CreativeResult>{
  const reservation=await reserve(db,merchantId,id,'source','segmenting',deps);if(!reservation.invoke)return reservation.output;
  const r=reservation.record, bytes=Buffer.from(r.source.b64,'base64');
  try{
    const mask=await bounded(deps.segment({bytes,mediaType:r.sourceMediaType,target:r.target,width:r.width,height:r.height}));
    const cutout=await cutoutPhoto(bytes,mask),png=await maskPng(mask);
    return finish(db,merchantId,id,'segmenting',{phase:'cutout_review',mask:image(png),cutout:image(cutout)});
  }catch{return finish(db,merchantId,id,'segmenting',{phase:'failed',reason:'segmentation_failed'});}
}
export async function approveCutout(db:Db,merchantId:string,id:string):Promise<CreativeResult>{
  if(!Id.safeParse(id).success||!Id.safeParse(merchantId).success)return result('invalid_request');
  return db.transaction(async tx=>{const row=await rowOf(tx,merchantId,id,true);if(!row)return result('not_found');if(await staleRule(tx,row,true))return result('stale',row,true);const r=Record.parse(row.record);if(r.phase!=='cutout_review'||!r.cutout)return result(r.phase,row);return result('cutout_approved',await save(tx,row,{...r,phase:'cutout_approved',cutoutApproval:{sha256:r.cutout.sha256,at:now()}}));});
}
export async function composeCreative(db:Db,merchantId:string,id:string,deps:CreativeDeps):Promise<CreativeResult>{
  const reservation=await reserve(db,merchantId,id,'cutout_approved','composing',deps);if(!reservation.invoke)return reservation.output;const r=reservation.record;
  try{
    if(!r.cutout)throw Error('missing_cutout');
    const background=r.includeBackground?await bounded(deps.background()):null;
    if(r.includeBackground&&!background)throw Error('background_failed');
    if(background)await inspectPhoto(background);
    const c=await composeAsset({cutout:Buffer.from(r.cutout.b64,'base64'),text:r.text,background,provenance:r.provenance});
    return finish(db,merchantId,id,'composing',{phase:'review',background:background?image(background):null,composed:image(c.png)});
  }catch{return finish(db,merchantId,id,'composing',{phase:'failed',reason:'composition_or_background_failed'});}
}
export async function decideCreative(db:Db,merchantId:string,id:string,input:{decision:'approve'|'reject';sha256:string}):Promise<CreativeResult>{
  if(!Id.safeParse(id).success||!Id.safeParse(merchantId).success||!z.object({decision:z.enum(['approve','reject']),sha256:z.string().max(64)}).safeParse(input).success)return result('invalid_request');
  return db.transaction(async tx=>{const row=await rowOf(tx,merchantId,id,true);if(!row)return result('not_found');if(await staleRule(tx,row,true))return result('stale',row,true);const r=Record.parse(row.record);
    if(r.phase==='rejected')return result('rejected',row);
    if(r.phase==='approved')return result(input.decision==='approve'&&input.sha256===r.approval?.sha256?'already_approved':'already_decided',row);
    if(input.decision==='reject')return result('rejected',await save(tx,row,{...r,phase:'rejected',reason:'owner_rejected'}));
    if(r.phase!=='review'||!r.composed)return result('not_ready',row);
    if(input.sha256!==r.composed.sha256)return result('asset_changed',row);
    return result('approved',await save(tx,row,{...r,phase:'approved',approval:{sha256:r.composed.sha256,at:now()}}));
  });
}
export async function readCreativeMedia(db:Db,merchantId:string,id:string,kind:string):Promise<{bytes:Buffer;type:string}|null>{
  if(!Id.safeParse(id).success||!Id.safeParse(merchantId).success)return null;
  // The existing privileged rule-lock helper makes each read's version decision atomic with concurrent rule edits.
  return db.transaction(async tx=>{const row=await rowOf(tx,merchantId,id);if(!row||await staleRule(tx,row,true))return null;const r=Record.parse(row.record);const key=z.enum(keys).safeParse(kind);if(!key.success)return null;const media=r[key.data];if(!media)return null;return {bytes:Buffer.from(media.b64,'base64'),type:key.data==='source'?r.sourceMediaType:'image/png'};});
}
