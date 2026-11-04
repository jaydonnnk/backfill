import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createMediaClient, backgroundRequest, samRequest, BACKGROUND_PROMPT } from '@/integrations/meta/media';
const wire='<0f>7<|box;x1=0;y1=0;x2=2;y2=1;w=3;h=2|><|mask;x=0;y=0;data=2,3,~!!!!.!0^zlTde]:)]`W|>\n';
it('pins separate media requests and excludes all terms and owner-private data', () => {
  expect(backgroundRequest()).toEqual({model:'muse-image-1.0',prompt:BACKGROUND_PROMPT,n:1,size:'1024x1024',response_format:'b64_json',output_format:'png',stream:false,tool_enablement:{enable_image_search:false,enable_web_search:false,enable_shell:false},reasoning_strength:'low'});
  expect(samRequest('dish','data:image/png;base64,AA==')).toMatchObject({model:'sam-3.1',stream:true,store:false,metadata:{mask_encoding:'one_bit'}});
});
it('reads chunked SAM SSE only through a completed event, zero retries', async () => {
  const lane={item_id:'fixture',output_index:0,content_index:0};
  const events = [{type:'response.output_text.delta',...lane,delta:wire},{type:'response.output_text.done',...lane,text:wire},{type:'response.completed'}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
  const fetcher = vi.fn(async()=> new Response(events,{headers:{'content-type':'text/event-stream'}}));
  const client = createMediaClient({apiKey:'dummy',baseUrl:'https://media.invalid/v1',fetch:fetcher});
  expect(await client.segment({bytes:Buffer.from('89504e470d0a1a0a','hex'),mediaType:'image/png',target:'dish',width:3,height:2})).toEqual({width:3,height:2,pixels:[0,0,1,1,0,1]});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refuses incomplete, malformed, empty, excessive, failed and timed-out replies without retry', async () => {
  for (const body of ['', 'data: {}\n\n', 'data: '+JSON.stringify({type:'response.completed'})+'\n\n', 'x'.repeat(2_100_000)]) {
    const fetcher=vi.fn(async()=>new Response(body,{headers:{'content-type':'text/event-stream'}}));
    expect(await createMediaClient({apiKey:'dummy',baseUrl:'https://media.invalid/v1',fetch:fetcher}).segment({bytes:new Uint8Array([1]),mediaType:'image/png',target:'dish',width:3,height:2})).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
  const fail = vi.fn(async()=>new Response('',{status:503}));
  expect(await createMediaClient({apiKey:'dummy',baseUrl:'https://media.invalid/v1',fetch:fail}).background()).toBeNull();
  expect(fail).toHaveBeenCalledTimes(1);
  const hang=vi.fn(()=>new Promise<Response>(()=>{}));
  expect(await createMediaClient({apiKey:'dummy',baseUrl:'https://media.invalid/v1',fetch:hang,timeoutMs:10}).background()).toBeNull();
  expect(hang).toHaveBeenCalledTimes(1);
});
it('accepts one bounded PNG background, refuses URL fetching and invalid/base64 or multi-image output',async()=>{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
  for(const body of [{data:[{b64_json:png.toString('base64')}],output_format:'png'},{data:[{url:'https://unsafe.invalid/image'}]},{data:[]},{data:[{b64_json:'fake'}]},{data:[{b64_json:png.toString('base64')},{b64_json:png.toString('base64')}]}]){
    const fetcher=vi.fn(async()=>Response.json(body));
    const result=await createMediaClient({apiKey:'dummy',baseUrl:'https://media.invalid/v1',fetch:fetcher}).background();
    if('output_format' in body)expect(result).toEqual(png);else expect(result).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
