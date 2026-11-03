import { describe, expect, it } from 'vitest';
import { inspectWav } from '@/lib/owner-voice/wav';

function wav(seconds = 1, sampleRate = 16000) {
  const data = sampleRate * 2 * seconds;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF'); b.writeUInt32LE(36 + data, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data, 40);
  return b;
}

describe('owner voice WAV boundary', () => {
  it('accepts mono 16-bit PCM at 16/24 kHz with actual duration', () => {
    expect(inspectWav(wav())).toEqual({ ok: true, durationMs: 1000, sampleRate: 16000 });
    expect(inspectWav(wav(2, 24000))).toEqual({ ok: true, durationMs: 2000, sampleRate: 24000 });
  });
  it('refuses mislabeled containers, broken chunk lengths and non-mono PCM', () => {
    expect(inspectWav(Buffer.from('OggSnotwav')).ok).toBe(false);
    const broken = wav(); broken.writeUInt32LE(999999, 40);
    expect(inspectWav(broken).ok).toBe(false);
    const stereo = wav(); stereo.writeUInt16LE(2, 22);
    expect(inspectWav(stereo).ok).toBe(false);
    expect(inspectWav(wav().subarray(0, 100)).ok).toBe(false);
  });
  it('refuses empty/oversized/over-duration and unsupported rates', () => {
    expect(inspectWav(wav(0)).ok).toBe(false);
    expect(inspectWav(wav(61)).ok).toBe(false);
    expect(inspectWav(wav(1, 44100)).ok).toBe(false);
    expect(inspectWav(Buffer.alloc(3 * 1024 * 1024 + 1)).ok).toBe(false);
  });
});
