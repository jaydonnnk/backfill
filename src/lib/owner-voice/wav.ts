export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 60_000;

export type WavInspection = { ok: true; durationMs: number; sampleRate: number } | { ok: false; reason: string };

// Validate bytes, not a browser MIME label. No platform-specific conversion is needed.
export function inspectWav(bytes: Uint8Array): WavInspection {
  const refuse = (reason: string): WavInspection => ({ ok: false, reason });
  if (bytes.length > MAX_VOICE_BYTES) return refuse('too_large');
  if (bytes.length < 44) return refuse('invalid_wav');
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) !== b.length - 8) return refuse('invalid_wav');
  let sampleRate: number | null = null;
  let dataBytes: number | null = null;
  let at = 12;
  while (at < b.length) {
    if (at + 8 > b.length) return refuse('invalid_wav');
    const tag = b.toString('ascii', at, at + 4);
    const length = b.readUInt32LE(at + 4);
    const end = at + 8 + length;
    if (end > b.length) return refuse('invalid_wav');
    if (tag === 'fmt ') {
      if (sampleRate !== null || length !== 16 || b.readUInt16LE(at + 8) !== 1 || b.readUInt16LE(at + 10) !== 1 || b.readUInt16LE(at + 22) !== 16 || b.readUInt16LE(at + 20) !== 2) return refuse('unsupported_wav');
      sampleRate = b.readUInt32LE(at + 12);
      if (![16000, 24000].includes(sampleRate) || b.readUInt32LE(at + 16) !== sampleRate * 2) return refuse('unsupported_wav');
    }
    if (tag === 'data') {
      if (dataBytes !== null || sampleRate === null || length === 0 || length % 2 !== 0) return refuse('invalid_wav');
      dataBytes = length;
    }
    at = end + length % 2;
  }
  if (at !== b.length || sampleRate === null || dataBytes === null) return refuse('invalid_wav');
  const durationMs = dataBytes / (sampleRate * 2) * 1000;
  if (durationMs > MAX_VOICE_DURATION_MS) return refuse('too_long');
  return { ok: true, durationMs, sampleRate };
}
