import type { VoiceDeps } from '../../src/lib/owner-voice/service';

// Authored boundary fixtures. The WAV below contains silence, not these spoken words.
export const S3_TRANSCRIPT = 'Set discount to 25 percent, capacity to 10, minimum pool to 6, per-agent cap to 3.';
export const S3_CORRECTION = 'Set discount to 15 percent, capacity to 10, minimum pool to 6, per-agent cap to 3.';

export function silentOwnerWav(): Buffer {
  const sampleRate = 16000;
  const dataBytes = sampleRate * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF'); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

export function voiceFixtureDeps(): VoiceDeps {
  return {
    voiceModel: 'fixture:s3-voice', wonderModel: 'fixture:s3-wonder', source: 'fixture',
    transcribe: async () => ({ text: S3_TRANSCRIPT, providerSessionId: 'fixture-s3-asr', audioDurationMs: 1000, costNanoUsd: null }),
    propose: async (message, rule) => {
      const clear = message === S3_TRANSCRIPT || message === S3_CORRECTION;
      return {
        understood: clear,
        discountBps: clear ? (message === S3_CORRECTION ? 1500 : 2500) : rule.discountBps,
        capacityCovers: clear ? 10 : rule.capacityCovers,
        minPoolCovers: clear ? 6 : rule.minPoolCovers,
        perAgentCapCovers: clear ? 3 : rule.perAgentCapCovers,
        reply: clear ? 'Fixture Wonder proposal: use these four requested values.' : 'Please specify the exact discount, capacity, minimum pool or per-agent cap.',
      };
    },
  };
}
