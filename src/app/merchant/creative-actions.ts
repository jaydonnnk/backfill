'use server';

import { z } from 'zod';
import { webDb } from '@/lib/db/client';
import { creativeDeps } from '@/lib/creative/deps';
import { uploadCreative, segmentCreative, approveCutout, composeCreative, decideCreative, getCreative, type CreativeResult } from '@/lib/creative/service';
import { currentMerchant } from './session';
const Id=z.uuid();
export async function uploadOwnerPhoto(form:FormData):Promise<CreativeResult>{
  const owner=await currentMerchant();if(!owner)return {status:'signed_out',asset:null};
  const p=z.object({id:Id,ruleId:Id,termsVersion:z.coerce.number().int().positive(),target:z.string().trim().min(1).max(120),rightsBasis:z.string().trim().min(1).max(120)}).safeParse(Object.fromEntries(form));
  const photo=form.get('photo');if(!p.success)return {status:'invalid_request',asset:null};
  if(!(photo instanceof File)||photo.size===0||photo.size>4*1024*1024)return {status:'invalid_photo',asset:null};
  return uploadCreative(webDb(),owner.id,{...p.data,bytes:new Uint8Array(await photo.arrayBuffer()),localPermission:form.get('localPermission')==='on',hostedPermission:form.get('hostedPermission')==='on',synthetic:form.get('synthetic')==='on',includeBackground:form.get('includeBackground')==='on'},creativeDeps());
}
export async function creativeOwnerAction(input:unknown):Promise<CreativeResult>{
  const owner=await currentMerchant();if(!owner)return {status:'signed_out',asset:null};
  const p=z.object({id:Id,action:z.enum(['refresh','segment','approve_cutout','compose','approve','reject']),sha256:z.string().max(64).default('')}).safeParse(input);
  if(!p.success)return {status:'invalid_request',asset:null};const {id,action,sha256}=p.data,db=webDb();
  switch(action){
    case 'refresh':return getCreative(db,owner.id,id);
    case 'segment':return segmentCreative(db,owner.id,id,creativeDeps());
    case 'approve_cutout':return approveCutout(db,owner.id,id);
    case 'compose':return composeCreative(db,owner.id,id,creativeDeps());
    case 'approve':return decideCreative(db,owner.id,id,{decision:'approve',sha256});
    case 'reject':return decideCreative(db,owner.id,id,{decision:'reject',sha256});
  }
}
