import { z } from 'zod';
import { EVALUATION_MODELS } from './models';

const Key = z.object({ data: z.object({ limit: z.number().positive().max(3), limit_remaining: z.number().positive(), limit_reset: z.null(), usage: z.number().nonnegative() }) });
export function checkAllowance(input: unknown, startingUsage: number, calls: { costNanoUsd: number; error: string | null }[]) {
  const key = Key.parse(input).data;
  if (calls.length >= 18 || calls.some(c => c.error === 'eval_cost_unknown')) throw new Error('Attempt limit or unknown charge: stop');
  const spent = calls.reduce((sum,c) => sum+c.costNanoUsd,0)/1e9;
  // Operational target only, not a provider-enforced US$1 hard limit. Leave US$0.05 headroom.
  if (Math.max(spent,key.usage-startingUsage) >= .95 || key.limit_remaining < .05) throw new Error('Run spending target reached: stop');
  return key;
}
export function checkCatalog(input: unknown) {
  const catalog = z.object({ data: z.array(z.object({ id: z.string(), supported_parameters: z.array(z.string()) })) }).parse(input);
  for (const id of EVALUATION_MODELS) {
    const model = catalog.data.find(m=>m.id===id);
    if (!model || !['max_tokens','temperature','response_format','structured_outputs'].every(p=>model.supported_parameters.includes(p))) throw new Error(`Required model or capability unavailable: ${id}`);
  }
}
