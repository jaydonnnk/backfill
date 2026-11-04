import { describe, expect, it } from "vitest";
import { encodeWav } from "@/lib/owner-voice/encode-wav";
import { inspectWav } from "@/lib/owner-voice/wav";

describe("recorded owner audio", () => {
  it("encodes a WAV the server accepts, with its true duration", () => {
    expect(inspectWav(encodeWav(new Float32Array(16_000), 16_000))).toEqual({ ok: true, durationMs: 1000, sampleRate: 16_000 });
  });

  it("clamps samples outside the PCM range", () => {
    const wav = encodeWav(Float32Array.of(2, -2, 0), 16_000);
    const samples = new DataView(wav.buffer, 44);
    expect([samples.getInt16(0, true), samples.getInt16(2, true), samples.getInt16(4, true)]).toEqual([32767, -32768, 0]);
  });

  it("stays inside the server's limits at the longest recording", () => {
    expect(inspectWav(encodeWav(new Float32Array(16_000 * 60), 16_000)).ok).toBe(true);
  });
});
