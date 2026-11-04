import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
// One durable slot per named model. Every dispatch, including errors/timeouts, consumes it.
export function guardedMediaFetch({directory,rawDirectory,requests,upstream}){
 return async(input,init)=>{
  const endpoint=String(input),request=requests.find(r=>r.endpoint===endpoint);
  requireValue(request&&['sam','image'].includes(request.slot),'unapproved_media_endpoint');
  requireValue(init?.method==='POST'&&init.redirect==='error'&&init.signal instanceof AbortSignal,'unapproved_transport');
  requireValue(typeof init.body==='string'&&Buffer.byteLength(init.body)<=3_000_000&&sha(init.body)===request.bodySha256,'media_request_changed');
  requireValue(request.maxResponseBytes>0&&request.maxResponseBytes<=6_100_000,'invalid_response_limit');
  await writeFile(join(directory,`${request.slot}-dispatch.json`),JSON.stringify({slot:request.slot,endpoint,model:request.model,bodySha256:request.bodySha256,startedAt:new Date().toISOString(),maxAttempts:1,consumed:true})+'\n',{flag:'wx',flush:true});
  try{
   const response=await upstream(input,init);
   await writeFile(join(directory,`${request.slot}-http.json`),JSON.stringify({status:response.status,requestId:response.headers.get('x-request-id'),consumed:true,invoicedUsd:null})+'\n',{flag:'wx',flush:true});
   const chunks=[];let size=0;const reader=response.body?.getReader();
   try{if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>request.maxResponseBytes)throw Error('media_response_limit');chunks.push(part.value);}}
   finally{void reader?.cancel().catch(()=>{});}
   const raw=Buffer.concat(chunks);
   await writeFile(join(rawDirectory,`${request.slot}-response.raw`),raw,{flag:'wx',flush:true});
   await writeFile(join(directory,`${request.slot}-output.json`),JSON.stringify({bytes:raw.length,sha256:sha(raw),consumed:true})+'\n',{flag:'wx',flush:true});
   return new Response(raw,{status:response.status,headers:response.headers});
  }catch{
   await writeFile(join(directory,`${request.slot}-failure.json`),JSON.stringify({failed:true,consumed:true,retries:0})+'\n',{flag:'wx',flush:true});
   throw Error('media_dispatch_failed_no_retry');
  }
 };
}
