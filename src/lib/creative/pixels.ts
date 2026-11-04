import sharp from 'sharp';
import { z } from 'zod';
import { judgePhoto } from '@/domain/onboarding/menu';

export const MAX_PIXELS = 8_000_000;
export const Mask = z.strictObject({
  width: z.int().positive().max(4096), height: z.int().positive().max(4096),
  pixels: z.array(z.union([z.literal(0), z.literal(1)])).max(MAX_PIXELS),
}).refine(m => m.pixels.length === m.width * m.height && m.pixels.some(p => p === 1), 'Invalid or empty mask');
export type Mask = z.infer<typeof Mask>;
const decode = (bytes: Uint8Array) => sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: false, failOn: 'warning' }).autoOrient().toColourspace('srgb').ensureAlpha();

export async function inspectPhoto(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  if (!judgePhoto(bytes).ok) throw new Error('invalid_photo');
  const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  if ((meta.pages ?? 1) !== 1 || !['png', 'jpeg', 'webp'].includes(meta.format ?? '')) throw new Error('invalid_photo');
  const { info } = await decode(bytes).raw().toBuffer({ resolveWithObject: true });
  if (info.width > 4096 || info.height > 4096) throw new Error('photo_dimensions');
  return { width: info.width, height: info.height };
}
export async function cutoutPhoto(source: Uint8Array, value: unknown): Promise<Buffer> {
  await inspectPhoto(source);
  const mask = Mask.parse(value);
  const { data, info } = await decode(source).raw().toBuffer({ resolveWithObject: true });
  if (mask.width !== info.width || mask.height !== info.height) throw new Error('mask_dimensions');
  for (let i = 0; i < mask.pixels.length; i++) {
    // Refuse transparent source pixels instead of silently replacing their original alpha.
    if (data[i * 4 + 3] !== 255) throw new Error('source_not_opaque');
    data[i * 4 + 3] = mask.pixels[i] === 1 ? 255 : 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
export async function maskPng(value: unknown): Promise<Buffer> {
  const mask = Mask.parse(value);
  return sharp(Uint8Array.from(mask.pixels, p => p * 255), { raw: { width: mask.width, height: mask.height, channels: 1 } }).png().toBuffer();
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);
export async function composeAsset(input: { cutout: Uint8Array; text: string; background: Uint8Array | null; provenance: 'fixture' | 'provider' | 'replay' }) {
  if (input.text.length > 1200 || !input.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input.text)) throw new Error('invalid_text');
  const food = await decode(input.cutout).raw().toBuffer({ resolveWithObject: true });
  const width = Math.max(720, food.info.width + 64);
  const labels = [input.provenance === 'provider' ? 'Local review only' : `${input.provenance.toUpperCase()} / synthetic local review`, input.background ? 'Generated decorative background' : 'Plain local background'];
  // Pango wraps the actual glyphs, including long words, to the available pixel width.
  const lettering = await sharp({ text: { text: escape([...labels, input.text].join('\n')), font: 'sans 16', width: width - 64, wrap: 'word-char', spacing: 6, rgba: true } }).png().toBuffer({ resolveWithObject: true });
  if (lettering.info.width > width - 64) throw new Error('text_overflow');
  const textBottom = lettering.info.height + 64;
  const foodTop = textBottom + 24, foodLeft = Math.floor((width - food.info.width) / 2);
  const height = foodTop + food.info.height + 32;
  const bg = input.background
    ? sharp(input.background, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).resize(width, height, { fit: 'cover' }).ensureAlpha()
    : sharp({ create: { width, height, channels: 4, background: '#e6e3db' } });
  const band = Buffer.from(`<svg width="${width}" height="${textBottom}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${textBottom}" fill="#fffdf7"/></svg>`);
  const output = await bg.composite([{ input: band, top: 0, left: 0 }, { input: lettering.data, top: 32, left: 32 }]).raw().toBuffer();
  for (let y = 0; y < food.info.height; y++) for (let x = 0; x < food.info.width; x++) {
    const i = (y * food.info.width + x) * 4, alpha = food.data[i + 3];
    if (alpha !== 0 && alpha !== 255) throw new Error('cutout_not_binary');
    if (alpha === 255) food.data.copy(output, ((y + foodTop) * width + x + foodLeft) * 4, i, i + 4);
  }
  return { png: await sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer(), text: input.text, foodTop, foodLeft, textBottom, textWidth: lettering.info.width, textHeight: lettering.info.height };
}
