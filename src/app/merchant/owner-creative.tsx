'use client';

import { useRef, useState } from 'react';
import type { CreativeResult, CreativeView } from '@/lib/creative/service';
import { uploadOwnerPhoto, creativeOwnerAction } from './creative-actions';
const button='rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50';
const input='rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-base';
const notices:Record<string,string>={
  source:'Photo saved privately. Creating a cutout needs separate hosted-call approval.',
  media_unavailable:'Hosted media needs a separately approved run. Your offer remains usable.',
  invalid_request:'Complete the rights and local-processing fields before saving.',invalid_photo:'Choose a valid JPEG, PNG or WebP up to 4 MB and 4096 pixels per side.',
  cutout_review:'Review the mask and real-photo cutout. Approve the cutout before composing.',
  cutout_approved:'Cutout approved for this asset. Compose the exact public terms below.',
  review:'Preview only. Review the composition and exact terms, then approve or reject this asset.',
  approved:'Approved for this exact asset and offer version. Local review only; nothing was posted.',
  already_approved:'This exact asset already has your approval. Nothing was posted.',rejected:'Rejected. Nothing was posted.',
  stale:'The offer terms changed. This asset is no longer usable. Save a new photo for the current terms.',
  failed:'Optional media failed. Nothing was approved or posted. Your offer remains usable.',
  conflict:'That upload identifier already belongs to different inputs. Refresh before starting a new upload.',
};
const labels={source:'Source photo',mask:'Segmentation mask',cutout:'Real-photo cutout',background:'Generated decorative background',composed:'Composed asset'};
export function OwnerCreative({ruleId,termsVersion,initial}:{ruleId:string;termsVersion:number;initial:CreativeView|null}){
  const [asset,setAsset]=useState(initial),[status,setStatus]=useState(initial?.stale?'stale':initial?.phase??''),[busy,setBusy]=useState(false);
  const uploadId=useRef<string|null>(null);
  const stale=asset?.stale===true||!!asset&&asset.termsVersion!==termsVersion;
  async function perform(work:()=>Promise<CreativeResult>){setBusy(true);try{const r=await work();setStatus(r.status);if(r.asset)setAsset(r.asset);}catch{setStatus('interrupted');}finally{setBusy(false);}}
  async function action(action:'segment'|'approve_cutout'|'compose'|'approve'|'reject'|'refresh'){if(asset)await perform(()=>creativeOwnerAction({id:asset.id,action,sha256:asset.assetSha256??''}));}
  return <fieldset aria-label={`Creative asset for offer ${ruleId}`} className="mt-3 flex min-w-0 flex-col gap-3 rounded-md border border-[var(--border)] p-4">
    <legend className="px-1 text-sm font-medium">Optional offer photo</legend>
    <p className="text-sm text-[var(--muted)]">Your real dish stays unchanged. Review its cutout and exact offer text. Local review only; nothing is posted.</p>
    <form className="flex min-w-0 flex-col gap-3" onChange={()=>{uploadId.current=null;}} action={async form=>{uploadId.current??=crypto.randomUUID();form.set('id',uploadId.current);await perform(()=>uploadOwnerPhoto(form));}}>
      <input type="hidden" name="ruleId" value={ruleId}/><input type="hidden" name="termsVersion" value={termsVersion}/>
      <label className="flex min-w-0 flex-col gap-1 text-sm">Dish photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="min-w-0 max-w-full text-sm"/></label>
      <label className="flex flex-col gap-1 text-sm">Dish or object to isolate<input className={input} name="target" maxLength={120} required/></label>
      <label className="flex flex-col gap-1 text-sm">Photo rights basis<input className={input} name="rightsBasis" placeholder="I took this photo" maxLength={120} required/></label>
      <label className="text-sm"><input type="checkbox" name="localPermission" required/> I permit local processing and composition.</label>
      <label className="text-sm"><input type="checkbox" name="hostedPermission"/> I permit uploading this photo to Meta SAM 3.1 after separate call approval.</label>
      <label className="text-sm"><input type="checkbox" name="synthetic"/> This uses synthetic local offer terms.</label>
      <label className="text-sm"><input type="checkbox" name="includeBackground"/> Add one optional Muse Image decorative background after separate call approval.</label>
      <button disabled={busy} className={`${button} self-start`}>Save photo privately</button>
    </form>
    {(status||stale)&&<p role="status" className="text-sm">{notices[stale?'stale':status]??(status==='interrupted'?'The response was interrupted. Refresh this asset before continuing.':`Asset state: ${status}.`)}</p>}
    {asset&&<>
      <p className="break-all text-xs text-[var(--muted)]">Offer v{asset.termsVersion} · {asset.provenance==='provider'?'Hosted output required':`${asset.provenance} media`} · {asset.synthetic?'Synthetic local offer':'Owner-supplied offer'}</p>
      <p className="whitespace-pre-wrap break-words text-sm" aria-label="Exact creative offer text">{asset.text}</p>
      {!stale&&<div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">{asset.media.map(kind=><figure className="min-w-0" key={`${asset.id}/${kind}`}>
        {/* Owner-authenticated media must bypass public image optimization/cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="max-h-96 w-full rounded border border-[var(--border)] object-contain" src={`/merchant/creative/${asset.id}/${kind}`} alt={labels[kind]}/><figcaption className="text-xs">{labels[kind]}{kind==='background'&&asset.provenance!=='provider'?' / authored fixture':''}</figcaption>
      </figure>)}</div>}
      <div className="flex flex-wrap gap-2">
        {!stale&&asset.phase==='source'&&<button disabled={busy} className={button} onClick={()=>action('segment')}>Create dish cutout</button>}
        {!stale&&asset.phase==='cutout_review'&&<button disabled={busy} className={button} onClick={()=>action('approve_cutout')}>Approve this cutout</button>}
        {!stale&&asset.phase==='cutout_approved'&&<button disabled={busy} className={button} onClick={()=>action('compose')}>Compose exact offer</button>}
        {!stale&&asset.phase==='review'&&<button disabled={busy} className={button} onClick={()=>action('approve')}>Approve this exact asset</button>}
        {!stale&&!['approved','rejected'].includes(asset.phase)&&<button disabled={busy} className={button} onClick={()=>action('reject')}>Reject asset</button>}
        <button disabled={busy} className={button} onClick={()=>action('refresh')}>Refresh asset</button>
      </div>
      {asset.assetSha256&&<p className="break-all text-xs">Asset SHA-256: {asset.assetSha256}</p>}
      {asset.approval&&<p className="text-sm">Approval saved for offer v{asset.termsVersion} at {asset.approval.at}. {stale?'Historical approval; no longer usable.':'No public posting approval.'}</p>}
    </>}
  </fieldset>;
}
