import { z } from 'zod';
import { type Mask, inspectPhoto } from '@/lib/creative/pixels';
import { decodeSamResponse, samObjectTarget } from './sam';
import type { PromptObject } from '@meta-sam/parser';
import type { PhotoType } from '@/domain/onboarding/menu';

export const SAM_MODEL = 'sam-3.1';
export const IMAGE_MODEL = 'muse-image-1.0';
export const BACKGROUND_PROMPT = 'An empty warm cafe tabletop, neutral daylight, uncluttered center. Decorative background only. No food, drinks, people, text, prices, brands or logos.';
export const backgroundRequest = () => ({ model: IMAGE_MODEL, prompt: BACKGROUND_PROMPT, n: 1, size: '1024x1024', response_format: 'b64_json', output_format: 'png', stream: false, tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false }, reasoning_strength: 'low' });
export const samRequest = (target: string, imageUrl: string) => ({ model: SAM_MODEL, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: target }, { type: 'input_image', image_url: imageUrl }] }], stream: true, store: false, metadata: { mask_encoding: 'one_bit' } });
export type SegmentInput = { bytes: Uint8Array; mediaType: PhotoType; target: string; width: number; height: number; objects?: readonly PromptObject[] };
const ImageResponse = z.object({ output_format: z.literal('png'), data: z.array(z.object({ b64_json: z.string().min(4).max(6_000_000) })).length(1) });
export function createMediaClient(options: { apiKey: string; baseUrl: string; fetch?: typeof fetch; timeoutMs?: number }) {
  const endpoint = new URL(options.baseUrl);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('invalid_media_endpoint');
  const post = async (path: string, body: unknown, maxBytes: number, sse: boolean): Promise<string | null> => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const work = async () => {
        const res = await (options.fetch ?? fetch)(`${options.baseUrl.replace(/\/$/u,'')}/${path}`, { method: 'POST', redirect: 'error', signal: abort.signal, headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', Accept: sse ? 'text/event-stream' : 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes(sse ? 'text/event-stream' : 'application/json')) return null;
        reader = res.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
        for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > maxBytes) return null; chunks.push(part.value); }
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      };
      return await Promise.race([work(), new Promise<null>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(null); }, options.timeoutMs ?? 30_000); })]);
    } catch { return null; }
    finally { clearTimeout(timer); abort.abort(); void reader?.cancel().catch(() => {}); }
  };
  return {
    segment: async (input: SegmentInput): Promise<Mask | null> => {
      if (!z.string().trim().min(1).max(120).safeParse(input.target).success) return null;
      const dataUrl = `data:${input.mediaType};base64,${Buffer.from(input.bytes).toString('base64')}`;
      const target=input.objects?samObjectTarget(input,input.objects):input.target;
      const raw = await post('responses', samRequest(target, dataUrl), 2_097_152, true);
      if (raw === null) return null;
      try { return (await decodeSamResponse(raw,input,input.objects?.map(o=>String(o.id)))).mask; }
      catch { return null; }
    },
    background: async (): Promise<Uint8Array | null> => {
      const raw = await post('images/generations', backgroundRequest(), 6_100_000, false);
      if (!raw) return null;
      try {
        const result = ImageResponse.parse(JSON.parse(raw)); const encoded = result.data[0]?.b64_json;
        if (!encoded) return null;
        const bytes = Buffer.from(encoded,'base64');
        if (bytes.toString('base64') !== encoded || !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return null;
        await inspectPhoto(bytes); return bytes;
      } catch { return null; }
    },
  };
}
