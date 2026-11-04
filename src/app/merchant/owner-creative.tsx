'use client';

import { useRef, useState } from 'react';
import type { CreativeResult, CreativeView } from '@/lib/creative/service';
import { uploadOwnerPhoto, creativeOwnerAction } from './creative-actions';
const button='button';
const notices:Record<string,string>={
  source:'Photo saved privately. Creating a cutout needs separate hosted-call approval.',
  media_unavailable:'Hosted media is disabled or its daily processing allowance is exhausted. Your offer remains usable.',
  invalid_request:'Complete the rights and local-processing fields before saving.',invalid_photo:'Choose a valid JPEG, PNG or WebP up to 4 MB, two million pixels and 4096 pixels per side.',
  cutout_review:'Review the mask and real-photo cutout. SAM may miss parts of a dish. Approve the cutout before composing.',
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
  return <fieldset aria-label={`Creative asset for offer ${ruleId}`} className="tool-panel">
    <p>Your real dish stays unchanged. You review the cutout and offer text. Nothing is posted.</p>
    <form className="tool-form" onChange={()=>{uploadId.current=null;}} action={async form=>{uploadId.current??=crypto.randomUUID();form.set('id',uploadId.current);await perform(()=>uploadOwnerPhoto(form));}}>
      <input type="hidden" name="ruleId" value={ruleId}/><input type="hidden" name="termsVersion" value={termsVersion}/>
      <label>Dish photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required/></label>
      <label>Dish or object to isolate<input name="target" maxLength={120} required/></label>
      <label>Photo rights basis<input name="rightsBasis" placeholder="I took this photo" maxLength={120} required/></label>
      <label className="tool-check"><input type="checkbox" name="localPermission" required/> I permit local processing and composition.</label>
      <label className="tool-check"><input type="checkbox" name="hostedPermission"/> I permit uploading this photo to Meta SAM 3.1 after separate call approval.</label>
      <label className="tool-check"><input type="checkbox" name="synthetic"/> This uses synthetic local offer terms.</label>
      <label className="tool-check"><input type="checkbox" name="includeBackground"/> Add one optional Muse Image decorative background after separate call approval.</label>
      <button disabled={busy} className="button primary">Save photo privately</button>
    </form>
    {(status||stale)&&<p role="status" className="small">{notices[stale?'stale':status]??(status==='interrupted'?'The response was interrupted. Refresh this asset before continuing.':`Asset state: ${status}.`)}</p>}
    {asset&&<>
      <p className="small tool-break">Offer v{asset.termsVersion} · {asset.provenance==='provider'?'Hosted output required':`${asset.provenance} media`} · {asset.synthetic?'Synthetic local offer':'Owner-supplied offer'}</p>
      <p className="tool-quote" aria-label="Exact creative offer text">{asset.text}</p>
      {!stale&&<div className="tool-media">{asset.media.map(kind=><figure key={`${asset.id}/${kind}`}>
        {/* Owner-authenticated media must bypass public image optimization/cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/merchant/creative/${asset.id}/${kind}`} alt={labels[kind]}/><figcaption className="small">{labels[kind]}{kind==='background'&&asset.provenance!=='provider'?' / authored fixture':''}</figcaption>
      </figure>)}</div>}
      <div className="actions">
        {!stale&&asset.phase==='source'&&<button disabled={busy} className={button} onClick={()=>action('segment')}>Create dish cutout</button>}
        {!stale&&asset.phase==='cutout_review'&&<button disabled={busy} className={button} onClick={()=>action('approve_cutout')}>Approve this cutout</button>}
        {!stale&&asset.phase==='cutout_approved'&&<button disabled={busy} className={button} onClick={()=>action('compose')}>Compose exact offer</button>}
        {!stale&&asset.phase==='review'&&<button disabled={busy} className={button} onClick={()=>action('approve')}>Approve this exact asset</button>}
        {!stale&&!['approved','rejected'].includes(asset.phase)&&<button disabled={busy} className={button} onClick={()=>action('reject')}>Reject asset</button>}
        <button disabled={busy} className={button} onClick={()=>action('refresh')}>Refresh asset</button>
      </div>
      {asset.assetSha256&&<p className="small tool-break">Asset SHA-256: {asset.assetSha256}</p>}
      {asset.approval&&<p className="small">Approval saved for offer v{asset.termsVersion} at {asset.approval.at}. {stale?'Historical approval; no longer usable.':'No public posting approval.'}</p>}
    </>}
  </fieldset>;
}
