import { expect, it } from 'vitest';
import { decodeSamResponse, samObjectTarget } from '@/integrations/meta/sam';

// Independent literal masks from Meta's public conformance vectors, not model output.
// https://github.com/meta-models/meta-sam/blob/main/conformance/cases/compact-api-image-lossless.json
const lossless='<0f>7<|box;x1=0;y1=0;x2=2;y2=1;w=3;h=2|><|mask;x=0;y=0;data=2,3,~!!!!.!0^zlTde]:)]`W|>\n';
// https://github.com/meta-models/meta-sam/blob/main/conformance/cases/synthetic-image-chunking.json
const onebit='<0f>0<|box;x1=0;y1=0;x2=4;y2=4;w=20;h=10|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>\n';
function sse(text:string,finish=true){const lane={item_id:'fixture',output_index:0,content_index:0};return [{type:'response.output_text.delta',...lane,delta:text.slice(0,31)},{type:'response.output_text.delta',...lane,delta:text.slice(31)},...(finish?[{type:'response.output_text.done',...lane,text},{type:'response.completed'}]:[])].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');}
it('decodes official lossless threshold vector through actual SSE and parser',async()=>{
 expect((await decodeSamResponse(sse(lossless),{width:3,height:2})).mask).toEqual({width:3,height:2,pixels:[0,0,1,1,0,1]});
});
it('decodes the official arithmetic one-bit vector and places it at source coordinates',async()=>{
 const result=await decodeSamResponse(sse(onebit),{width:20,height:10});
 const expected=[1,0,0,1,0,0,0,1,1,0,0,0,0,0,0,1,0,1,1,1,1,0,0,0,1];
 for(let y=0;y<10;y++)for(let x=0;x<20;x++)expect(result.mask.pixels[y*20+x]).toBe(y<5&&x<5?expected[y*5+x]:0);
});
it('requires all explicit component IDs, unions their geometry, refuses accidental multiple matches',async()=>{
 const second=lossless.replace('<0f>7','8').replace('x1=0','x1=3').replace('x2=2','x2=5');
 const text=lossless.trimEnd().replace('w=3','w=6')+','+second.replace('w=3','w=6');
 const result=await decodeSamResponse(sse(text),{width:6,height:2},['7','8']);
 expect(result.mask.pixels).toEqual([0,0,1,0,0,1,1,0,1,1,0,1]);expect(result.components.map(c=>c.id)).toEqual(['7','8']);
 await expect(decodeSamResponse(sse(text),{width:6,height:2})).rejects.toThrow();
 await expect(decodeSamResponse(sse(text),{width:6,height:2},['7','8','9'])).rejects.toThrow();
});
it('fails on incomplete streams, wrong source size, malformed payload, oversized geometry and duplicated IDs',async()=>{
 for(const raw of [sse(lossless,false),sse(lossless.replace('w=3','w=4')),sse(lossless.replace('~!!!!.','~broken')),sse(lossless.replace('data=2,3','data=999999,999999')),sse(lossless.trimEnd()+','+lossless.replace('<0f>',''))])await expect(decodeSamResponse(raw,{width:3,height:2},['7'])).rejects.toThrow();
});
it('formats explicit stable object boxes without food/price inference',()=>{
 expect(samObjectTarget({width:20,height:10},[{id:2,prompts:[{box:{left:3,top:1,right:8,bottom:6}}]}])).toBe('<0f>2<|box;x1=3;y1=1;x2=7;y2=5;w=20;h=10|>');
});
it('rejects resource-excessive mask headers before the parser can decode them',async()=>{
 await expect(decodeSamResponse(sse(lossless.replace('data=2,3','data=999999,999999')),{width:3,height:2})).rejects.toThrow('mask_resource_limit');
});
it('applies mask resource limits to whitespace-normalized provider fields',async()=>{
 const overSource=lossless.replace('x2=2','x2=1').replace('w=3','w=2');
 for(const field of ['data=','data = ',' data\t=\t'])await expect(decodeSamResponse(sse(overSource.replace('data=',field)),{width:2,height:2})).rejects.toThrow('mask_resource_limit');
});
it('decodes valid whitespace-normalized mask fields without changing their pixels',async()=>{
 expect((await decodeSamResponse(sse(lossless.replace('data=',' data = ')),{width:3,height:2})).mask.pixels).toEqual([0,0,1,1,0,1]);
});
