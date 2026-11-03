import { webEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { createVoiceTranscriber, VOICE_MODEL } from "@/integrations/meta/voice";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { wonderOwner } from "@/lib/whatsapp/owner-model";
import type { VoiceDeps } from "./service";

export function voiceDeps(): VoiceDeps {
  const env = webEnv();
  const provider = createMetaProvider({
    baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(webDb()), maxAttempts: 1, timeoutMs: 30_000,
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });
  return {
    transcribe: createVoiceTranscriber({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY }),
    propose: wonderOwner(provider, env.META_MODEL_WONDER),
    voiceModel: VOICE_MODEL, wonderModel: env.META_MODEL_WONDER, source: "provider",
  };
}
