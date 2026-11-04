import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cutoutPhoto, composeAsset, inspectPhoto, maskPng } from '@/lib/creative/pixels';

const bytes = Uint8Array.from([201, 12, 30, 255, 14, 180, 22, 255, 11, 22, 199, 255, 92, 80, 70, 255]);
async function photo() { return sharp(bytes, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer(); }
const mask = { width: 2, height: 2, pixels: [1, 0, 0, 1] };
describe('S5 original photo pixels', () => {
  it('decodes real PNG, rejects signature-only, oversized and unsupported images', async () => {
    expect(await inspectPhoto(await photo())).toEqual({ width: 2, height: 2 });
    await expect(inspectPhoto(Buffer.from('89504e470d0a1a0a', 'hex'))).rejects.toThrow();
    await expect(inspectPhoto(Buffer.alloc(4 * 1024 * 1024 + 1))).rejects.toThrow();
  });
  it('copies RGB exactly and changes only alpha; mask PNG independently agrees', async () => {
    const cutout = await cutoutPhoto(await photo(), mask);
    expect([...await sharp(cutout).raw().toBuffer()]).toEqual([201,12,30,255,14,180,22,0,11,22,199,0,92,80,70,255]);
    expect([...await sharp(await maskPng(mask)).removeAlpha().greyscale().raw().toBuffer()]).toEqual([255,0,0,255]);
  });
  it('refuses empty, fractional, mismatched, excessive and malformed masks', async () => {
    for (const bad of [null, {...mask,pixels:[0,0,0,0]}, {...mask,pixels:[1,0.5,0,1]}, {...mask,width:3}, {...mask,pixels:[1]}, {...mask,width:999999}]) {
      await expect(cutoutPhoto(await photo(), bad)).rejects.toThrow();
    }
  });
  it('places opaque food at 1:1 and keeps exact text outside food; composition is deterministic', async () => {
    const cutout = await cutoutPhoto(await photo(), mask);
    const input = { cutout, text: 'SYNTHETIC LOCAL OFFER\nS$6.80 becomes S$5.44 per cover\nUnlocks at 8 covers.', background: null, provenance: 'fixture' as const };
    const a = await composeAsset(input); const b = await composeAsset(input);
    expect(a.png.equals(b.png)).toBe(true);
    expect(a.text).toBe(input.text);
    const { data, info } = await sharp(a.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const offset = (a.foodTop * info.width + a.foodLeft) * 4;
    expect([...data.subarray(offset, offset + 4)]).toEqual([201,12,30,255]);
    expect([...data.subarray(offset + (info.width + 1) * 4, offset + (info.width + 1) * 4 + 4)]).toEqual([92,80,70,255]);
    expect(a.foodTop).toBeGreaterThanOrEqual(a.textBottom);
  });
});
it('wraps wide glyphs by rendered width so exact text is never clipped', async () => {
  const cutout=await cutoutPhoto(await photo(),mask), text='W'.repeat(120)+'\n'+'Exact offer text. '.repeat(20);
  const a=await composeAsset({cutout,text,background:null,provenance:'fixture'});
  expect(a.text).toBe(text);
  expect(a.textWidth).toBeLessThanOrEqual(656);
  expect(a.textHeight).toBeGreaterThan(150);
  expect(a.foodTop).toBeGreaterThan(a.textHeight);
});
