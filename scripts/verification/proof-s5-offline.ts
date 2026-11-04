import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { Mask, inspectPhoto, cutoutPhoto, maskPng, composeAsset } from '../../src/lib/creative/pixels';
import { syntheticDishPhoto, creativeFixtureDeps } from '../../tests/support/proof-s5';
import { termsSummary } from '../../src/lib/commitments/service';

// No env loading, database, provider, credential, inference, or remote-media path.
const output=resolve(process.argv[2]??'');
const ownerRoot=resolve('docs/plans/backfill-proof/evidence/s5-local-2026-11-04');
assert(output.startsWith(ownerRoot+'/'),'Use a fresh S5-owned artifact directory');
await mkdir(output); // No overwrite or recursive reuse of an old proof.
const source=await syntheticDishPhoto(),size=await inspectPhoto(source),deps=creativeFixtureDeps();
const mask=Mask.parse(await deps.segment({...size,bytes:source,mediaType:'image/png',target:'synthetic rectangle'}));
const cutout=await cutoutPhoto(source,mask),background=await deps.background();assert(background);
const text=termsSummary('SYNTHETIC LOCAL OFFER',{listPriceCents:680,offerPriceCents:544,discountBps:2000,window:{weekday:2,startMinute:840,endMinute:1020,commitByMinute:720},minPoolCovers:8,perAgentCapCovers:2});
const composition=await composeAsset({cutout,background,text,provenance:'fixture'});
const original=await sharp(source).ensureAlpha().raw().toBuffer();
const extracted=await sharp(cutout).ensureAlpha().raw().toBuffer();
const rendered=await sharp(composition.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let foodPixels=0;
for(let i=0;i<mask.pixels.length;i++){
  const x=i%size.width,y=Math.floor(i/size.width),expected=x>=40&&x<120&&y>=30&&y<90?1:0;
  assert.equal(mask.pixels[i],expected,'Independent geometric mask expectation');
  assert.deepEqual(extracted.subarray(i*4,i*4+3),original.subarray(i*4,i*4+3));
  assert.equal(extracted[i*4+3],expected*255);
  if(expected){foodPixels++;const target=((y+composition.foodTop)*rendered.info.width+x+composition.foodLeft)*4;assert.deepEqual(rendered.data.subarray(target,target+4),original.subarray(i*4,i*4+4));}
}
const artifacts=[['source-fixture.png',source],['mask-fixture.png',await maskPng(mask)],['cutout-fixture.png',cutout],['background-fixture.png',background],['composed-fixture.png',composition.png]] as const;
const manifest=[];
for(const [name,bytes]of artifacts){await writeFile(join(output,name),bytes,{flag:'wx'});manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
// Keep the manifest small: artifact bytes are represented by their hashes, never embedded.
await writeFile(join(output,'manifest.json'),JSON.stringify({assurance:'Authored geometric photo, binary-mask and background fixtures. No SAM payload decode or genuine inference. Scripted verification, no human approval or public posting.',foodPixels,allSelectedSourceAndComposedPixelsExactlyMatch:true,sourceSize:size,composedSize:{width:rendered.info.width,height:rendered.info.height},text,textWidth:composition.textWidth,textHeight:composition.textHeight,foodTop:composition.foodTop,foodLeft:composition.foodLeft,modelCalls:0,artifacts:manifest},null,2)+'\n',{flag:'wx'});
console.log(`S5 offline fixtures verified: ${foodPixels} unchanged food pixels; artifacts in ${output}`);
