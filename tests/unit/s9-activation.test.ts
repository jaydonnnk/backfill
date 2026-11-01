import { expect, it } from 'vitest';
import { checkAllowance, checkCatalog } from '../../evals/agenticpay/activation';
const key = { data: { limit: 3, limit_remaining: 2.99, limit_reset: null, usage: .01 } };
it('allows the explicitly accepted existing cap but stops on reset, increased cap, budget target, unknown charge or eighteenth call', () => {
  expect(checkAllowance(key,.01,[]).limit).toBe(3);
  for (const change of [{limit:4},{limit_reset:'daily'},{usage:1},{limit_remaining:.01}]) expect(()=>checkAllowance({data:{...key.data,...change}},.01,[])).toThrow();
  expect(()=>checkAllowance(key,.01,[{costNanoUsd:950000000,error:null}])).toThrow();
  expect(()=>checkAllowance(key,.01,[{costNanoUsd:0,error:'eval_cost_unknown'}])).toThrow();
  expect(()=>checkAllowance(key,.01,Array.from({length:18},()=>({costNanoUsd:0,error:null})))).toThrow();
});
it('requires both exact pinned catalog entries and capabilities without requiring provider seeds', () => {
  const parameters=['max_tokens','temperature','response_format','structured_outputs'];
  const data=[{id:'meta/muse-spark-1.3',supported_parameters:parameters},{id:'deepseek/deepseek-v4.1-flash-1017',supported_parameters:parameters}];
  expect(()=>checkCatalog({data})).not.toThrow();
  expect(()=>checkCatalog({data:data.slice(0,1)})).toThrow();
  expect(()=>checkCatalog({data:[data[0],{...data[1],id:'~deepseek/deepseek-flash-latest'}]})).toThrow();
  expect(()=>checkCatalog({data:data.map(m=>({...m,supported_parameters:[]}))})).toThrow();
});
