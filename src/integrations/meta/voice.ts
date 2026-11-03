import { z } from "zod";
import type { Transcription } from "@/lib/owner-voice/service";
import { inspectWav } from "@/lib/owner-voice/wav";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
export type VoiceOptions = { baseUrl: string; apiKey: string; fetch?: typeof fetch; timeoutMs?: number };

const TranscriptResponse = z.object({
  sessionId: z.string().min(1).max(200),
  transcript: z.string().trim().min(1).max(500),
  audioDurationMs: z.int().positive().max(60_000),
  turns: z.array(z.unknown()).length(0),
});

// One HTTP attempt only. Raw media, transcript and provider error bodies are never logged.
export function createVoiceTranscriber(options: VoiceOptions): (bytes: Uint8Array) => Promise<Transcription | null> {
  return async bytes => {
    const audio = inspectWav(bytes);
    if (!audio.ok) return null;
    const form = new FormData();
    form.set("request", new Blob([JSON.stringify({ model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
    form.set("audio", new File([new Uint8Array(bytes)], "instruction.wav", { type: "audio/wav" }));
    const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
    try {
      const response = await (options.fetch ?? fetch)(`${options.baseUrl.replace(/\/$/, "")}/asr/transcribe`, {
        method: "POST", redirect: "error", signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" }, body: form,
      });
      if (!response.ok || !response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 16_384) return null;
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const parsed = TranscriptResponse.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success || Math.abs(parsed.data.audioDurationMs - audio.durationMs) > 1000) return null;
      return { text: parsed.data.transcript, providerSessionId: parsed.data.sessionId, audioDurationMs: parsed.data.audioDurationMs, costNanoUsd: null };
    } catch {
      return null;
    }
  };
}
