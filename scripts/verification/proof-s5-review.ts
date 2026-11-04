import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {decodeSamResponse} from '../../src/integrations/meta/sam';
import {fillBowlInterior} from '../../src/lib/creative/bowl-mask';
import {cutoutPhoto,maskPng,Mask} from '../../src/lib/creative/pixels';

// Offline derivation from immutable genuine output. No env, database or HTTP client.
const live=resolve('archive/proof-s5-live-authorized-2026-11-04-01');
const evidence=resolve('docs/plans/backfill-proof/evidence/s5-live-authorized-2026-11-04-01');
const output=resolve('archive/proof-s5-review-2026-11-04-01');
const photo=await readFile('archive/proof-s5-inputs/owner-meal-2026-11-04.png');
const raw=await readFile(join(live,'sam-response.raw'));
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(photo),'34b4c4af727ee2e238bf2e8b6780cb45ca62f8140e6c843899a2e3f9775e5fe8');
assert.equal(sha(raw),JSON.parse(await readFile(join(evidence,'sam-output.json'),'utf8')).sha256);
const {mask:original,parts}=await decodeSamResponse(raw.toString('utf8'),{width:960,height:1280},['0','1','2']);
const pixels=new Array<number>(960*1280).fill(0);
let riceAdded=0;
for(const part of parts){
 const corrected=part.id==='1'?fillBowlInterior(part.mask,part.bounds.left===0):part.mask;
 const {left,top,right,bottom}=part.bounds;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const mx=Math.floor((x-left)*corrected.width/(right-left)),my=Math.floor((y-top)*corrected.height/(bottom-top));
  if(corrected.pixels[my*corrected.width+mx]===1)pixels[y*960+x]=1;
 }
}
const mask=Mask.parse({width:960,height:1280,pixels});
for(const [i,pixel]of original.pixels.entries()){assert(pixel===0||pixels[i]===1);if(pixel===0&&pixels[i]===1)riceAdded++;}
assert(riceAdded>0,'Correction should restore the missing rice interior');
const cutout=await cutoutPhoto(photo,mask),sourceRgb=await sharp(photo).ensureAlpha().raw().toBuffer(),outRgb=await sharp(cutout).ensureAlpha().raw().toBuffer();
let selected=0;
for(const [i,pixel]of pixels.entries()){assert.equal(outRgb[i*4+3],pixel*255);if(pixel){selected++;assert.deepEqual(outRgb.subarray(i*4,i*4+4),sourceRgb.subarray(i*4,i*4+4));}}
const checker=Buffer.alloc(960*1280*3);
for(let y=0;y<1280;y++)for(let x=0;x<960;x++){const v=((Math.floor(x/24)+Math.floor(y/24))%2)?215:245,i=(y*960+x)*3;checker[i]=v;checker[i+1]=v;checker[i+2]=v;}
const preview=await sharp(checker,{raw:{width:960,height:1280,channels:3}}).composite([{input:cutout}]).png().toBuffer();
await mkdir(output);
for(const [name,data]of [['mask.png',await maskPng(mask)],['cutout.png',cutout],['cutout-review.png',preview]] as const)await writeFile(join(output,name),data,{flag:'wx'});
const receipt={sourceSha256:sha(photo),genuineSamResponseSha256:sha(raw),originalSamSelectedPixels:original.pixels.filter(x=>x===1).length,selectedPixels:selected,locallyRestoredBowlInteriorPixels:riceAdded,allSelectedSourcePixelsPreserved:true,correction:'Only rice component 1: close source-clipped left rim between actual mask edge contacts and flood-fill enclosed bowl interior. This is local mask postprocessing, not direct SAM output or generated food.',cutoutSha256:sha(cutout),rawSamCutoutPreservedAt:join(live,'cutout.png'),reviewCutout:join(output,'cutout-review.png'),newModelCalls:0,cutoutApproval:null,finalAssetApproval:null,compositionCreated:false};
await writeFile(join(output,'derivation.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
await writeFile(join(evidence,'local-mask-correction.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S5 owner cutout review</title><style>body{font:16px system-ui;margin:24px;background:#fffdf7;color:#20251f}main{max-width:1200px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}img{width:100%;height:auto}figure{margin:0}figcaption{padding:12px 0;line-height:1.5}h1{font-size:26px}p{max-width:70ch;line-height:1.6}</style><main><h1>Review the cutout before composition</h1><p>Real photo pixels only. SAM's raw bowl mask omitted the rice. The corrected cutout below restores the bowl interior locally. The background is genuine Muse Image output. No approval, posting or extra model call has occurred.</p><div class="grid"><figure><img src="../proof-s5-live-authorized-2026-11-04-01/cutout-review-checkerboard.png" alt="Raw SAM cutout omits the rice"><figcaption>Raw SAM output. Rice interior is missing.</figcaption></figure><figure><img src="cutout-review.png" alt="Locally corrected cutout includes original rice pixels"><figcaption>Local correction. Cutlets, rice bowl and covered soup bowl. Awaiting your approval.</figcaption></figure><figure><img src="../proof-s5-live-authorized-2026-11-04-01/background.png" alt="Generated empty cafe background"><figcaption>Generated decorative background, saved separately.</figcaption></figure></div></main></html>`;
await writeFile(join(output,'review.html'),html,{flag:'wx'});
console.log(JSON.stringify({selectedPixels:selected,restoredPixels:riceAdded,newModelCalls:0,cutoutApproval:null,review:join(output,'review.html')}));
