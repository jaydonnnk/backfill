import './proof-s7-loopback.mjs';
const localFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);
 if(url.startsWith('https://integrate.api.nvidia.com/v1/chat/completions')){
  const body=JSON.parse(init.body);const request=JSON.parse(body.messages[1].content).request;
  if(request.includes('provider-failure'))return new Response('{}',{status:503});
  const date=/\d{4}-\d{2}-\d{2}/.exec(request)?.[0];
  return Response.json({model:'fixture:glimmer-http',choices:[{finish_reason:'stop',message:{content:JSON.stringify({partySize:2,visitDate:date,earliest:'14:00',latest:'17:00',budgetPerCoverCents:600,currency:'SGD',requirements:[]})}}],usage:{prompt_tokens:10,completion_tokens:20}});
 }
 if(url.startsWith('https://ai-gateway.vercel.sh/v4/ai/language-model'))return Response.json({content:[{type:'text',text:JSON.stringify({covers:2,reason:'Synthetic HTTP fixture selects two covers.'})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:20,text:20,reasoning:0}},warnings:[]});
 return localFetch(input,init);
};
