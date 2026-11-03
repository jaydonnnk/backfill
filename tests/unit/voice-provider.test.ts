import { describe, expect, it } from "vitest";
import { createVoiceTranscriber, VOICE_MODEL } from "@/integrations/meta/voice";

function wav() {
  const bytes = Buffer.alloc(32_044);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24); bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(32_000, 40);
  return bytes;
}
const result = { sessionId: "documented-session", transcript: "Make it 25 percent off.", audioDurationMs: 1000, turns: [] };

describe("bounded Voice adapter", () => {
  it("sends one documented multipart WAV request and returns bounded actual transcript metadata", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const transcribe = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", fetch: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return Response.json(result);
    } });
    expect(await transcribe(wav())).toEqual({ text: result.transcript, providerSessionId: result.sessionId, audioDurationMs: 1000, costNanoUsd: null });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://model.invalid/v1/asr/transcribe");
    const body = requests[0]?.init.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new Error("Expected multipart form");
    const settings = body.get("request");
    expect(settings).toBeInstanceOf(File);
    if (!(settings instanceof File)) throw new Error("Expected JSON settings part");
    expect(settings.type).toBe("application/json");
    expect(JSON.parse(await settings.text())).toEqual({ model: VOICE_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK" });
    const audio = body.get("audio");
    expect(audio).toBeInstanceOf(File);
    if (!(audio instanceof File)) throw new Error("Expected audio file");
    expect(audio.type).toBe("audio/wav");
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(wav());
    expect(requests[0]?.init.redirect).toBe("error");
  });

  it.each([400, 429, 500, 503])("never retries provider status %s", async status => {
    let calls = 0;
    const transcribe = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", fetch: async () => { calls++; return new Response("private provider body", { status }); } });
    expect(await transcribe(wav())).toBeNull();
    expect(calls).toBe(1);
  });

  it.each([
    { ...result, transcript: "" }, { ...result, transcript: "x".repeat(501) },
    { ...result, audioDurationMs: 90_000 }, { ...result, turns: undefined },
    { transcript: "incomplete" },
  ])("refuses malformed or unbounded actual output", async body => {
    const transcribe = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", fetch: async () => Response.json(body) });
    expect(await transcribe(wav())).toBeNull();
  });

  it("rejects mislabeled containers before HTTP and fails closed on transport interruption", async () => {
    let calls = 0;
    const transcribe = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", fetch: async () => { calls++; throw new Error("private error"); } });
    expect(await transcribe(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(calls).toBe(0);
    expect(await transcribe(wav())).toBeNull();
    expect(calls).toBe(1);
  });

  it("bounds response bytes and times out without retrying", async () => {
    const oversized = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", fetch: async () => new Response("x".repeat(16_385)) });
    expect(await oversized(wav())).toBeNull();
    let calls = 0;
    const timeout = createVoiceTranscriber({ baseUrl: "https://model.invalid/v1", apiKey: "dummy", timeoutMs: 5, fetch: async (_url, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("interrupted")), { once: true }));
    } });
    expect(await timeout(wav())).toBeNull();
    expect(calls).toBe(1);
  });
});
