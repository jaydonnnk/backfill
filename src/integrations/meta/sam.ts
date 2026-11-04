import { buildObjectPrompt, decodeMaskToRaster, parseImageStream, recordsOfKind, type PromptObject } from '@meta-sam/parser';
import { z } from 'zod';
import { Mask, MAX_PIXELS } from '@/lib/creative/pixels';

const Size=z.object({width:z.int().positive().max(4096),height:z.int().positive().max(4096)}).refine(s=>s.width*s.height<=MAX_PIXELS);
const Header=z.object({type:z.string()}).passthrough();
export const samObjectTarget=(size:{width:number;height:number},objects:readonly PromptObject[])=>{
  Size.parse(size);if(objects.length<1||objects.length>16)throw Error('invalid_object_count');
  return buildObjectPrompt({size,objects});
};
async function* events(raw:string){
  let completed=false;
  for(const block of raw.replace(/\r\n/gu,'\n').split('\n\n')){
    const lines=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());
    if(!lines.length)continue;
    const data=lines.join('\n');if(data==='[DONE]'){if(!completed)throw Error('incomplete_stream');continue;}
    const event=Header.parse(JSON.parse(data));
    if(event.type==='response.completed')completed=true;
    yield event;
  }
}
export async function decodeSamResponse(raw:string,source:{width:number;height:number},expectedIds?:readonly string[]){
  Size.parse(source);if(Buffer.byteLength(raw)>2_097_152)throw Error('segmentation_response_limit');
  const collected:z.infer<typeof Header>[]=[];let delta='',headerCount=0,decodedPixels=0;
  // The official parser decodes while parsing; enforce quotas before invoking it.
  function preflight(text:string){
    for(const token of text.matchAll(/<\|mask;([^|]*)\|>/gu)){
      // Match the official grammar's trimmed keys/values before its decoder allocates.
      const fields=new Map((token[1]??'').split(';').map(field=>{const i=field.indexOf('=');return [field.slice(0,i).trim(),field.slice(i+1).trim()];}));
      const data=fields.get('data');if(data===undefined)continue;
      const [rows,columns]=data.split(',');
      const height=Number(rows),width=Number(columns);headerCount++;decodedPixels+=height*width;
      if(!Number.isSafeInteger(height)||!Number.isSafeInteger(width)||height<1||width<1||height>source.height||width>source.width||height*width>MAX_PIXELS||headerCount>64||decodedPixels>MAX_PIXELS*4)throw Error('mask_resource_limit');
    }
    for(const box of text.matchAll(/<\|box;([^|]*)\|>/gu)){
      const fields=new Map((box[1]??'').split(';').map(field=>{const i=field.indexOf('=');return [field.slice(0,i).trim(),field.slice(i+1).trim()];}));
      if(Number(fields.get('w'))!==source.width||Number(fields.get('h'))!==source.height)throw Error('source_dimensions_changed');
      const x1=Number(fields.get('x1')),x2=Number(fields.get('x2')),y1=Number(fields.get('y1')),y2=Number(fields.get('y2'));
      if(![x1,x2,y1,y2].every(Number.isSafeInteger)||x1<0||y1<0||x2<x1||y2<y1||x2>=source.width||y2>=source.height)throw Error('invalid_mask_geometry');
    }
  }
  for await(const event of events(raw)){
    collected.push(event);
    if(event.type==='response.output_text.delta'&&typeof event.delta==='string')delta+=event.delta;
    const pending:unknown[]=[event];
    while(pending.length){const value=pending.pop();if(typeof value==='string')preflight(value);else if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(...Object.values(value));}
  }
  preflight(delta);
  async function* checkedEvents(){yield* collected;}
  const result=await parseImageStream(checkedEvents()).finalResult;
  if(result.outcome.status!=='completed'||result.diagnostics.some(d=>d.severity==='error'))throw Error('incomplete_or_invalid_segmentation');
  const boxes=[...result.rawOutput.matchAll(/<\|box;([^|]*)\|>/gu)];
  for(const box of boxes){const fields=new Map((box[1]??'').split(';').map(field=>{const i=field.indexOf('=');return [field.slice(0,i).trim(),field.slice(i+1).trim()];}));if(Number(fields.get('w'))!==source.width||Number(fields.get('h'))!==source.height)throw Error('source_dimensions_changed');}
  const masks=recordsOfKind(result.records,'mask');
  const ids=masks.map(m=>m.objectId);
  if(masks.length<1||masks.length>16||new Set(ids).size!==ids.length||boxes.length!==masks.length)throw Error('invalid_matches');
  if(expectedIds){if(new Set(expectedIds).size!==expectedIds.length||ids.length!==expectedIds.length||ids.some(id=>!expectedIds.includes(id)))throw Error('missing_or_unexpected_component');}
  else if(masks.length!==1)throw Error('ambiguous_matches');
  const pixels=new Array<number>(source.width*source.height).fill(0),components=[],parts=[];
  for(const record of masks){
    const {width,height}=record.mask,{left,top,right,bottom}=record.bounds;
    if(width>4096||height>4096||width*height>MAX_PIXELS||left<0||top<0||right>source.width||bottom>source.height||right<=left||bottom<=top)throw Error('invalid_mask_geometry');
    const raster=decodeMaskToRaster(record.mask);let selected=0;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const mx=Math.floor((x-left)*width/(right-left)),my=Math.floor((y-top)*height/(bottom-top));
      if(raster[my*width+mx]===1){pixels[y*source.width+x]=1;selected++;}
    }
    if(selected===0)throw Error('empty_component');
    parts.push({id:record.objectId,bounds:record.bounds,mask:Mask.parse({width,height,pixels:Array.from(raster)})});
    components.push({id:record.objectId,bounds:record.bounds,pixels:selected,encoding:record.mask.encoding});
  }
  return {mask:Mask.parse({width:source.width,height:source.height,pixels}),components,parts};
}
