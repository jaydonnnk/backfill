"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWav } from "@/lib/owner-voice/encode-wav";
import { MAX_VOICE_DURATION_MS } from "@/lib/owner-voice/wav";

const SAMPLE_RATE = 16_000;
const MIN_SECONDS = 0.5;
// Stops just short of the server's limit so a late timer cannot produce a refused file.
const AUTO_STOP_MS = MAX_VOICE_DURATION_MS - 1_000;

// Browsers record compressed audio, so decode it and render one 16 kHz channel for the WAV.
async function toWav(recording: Blob): Promise<File | null> {
  const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await recording.arrayBuffer());
  if (decoded.duration < MIN_SECONDS) return null;
  const length = Math.min(Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE * (MAX_VOICE_DURATION_MS / 1000));
  const context = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), SAMPLE_RATE);
  return new File([wav.slice().buffer], "owner-instruction.wav", { type: "audio/wav" });
}

export function VoiceRecorder({ disabled, onRecorded, onNotice }: { disabled: boolean; onRecorded: (wav: File) => void; onNotice: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    const active = recorder.current;
    if (active) { active.onstop = null; if (active.state !== "inactive") active.stop(); active.stream.getTracks().forEach(track => track.stop()); }
  }, []);

  async function start() {
    onNotice("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onNotice("This browser cannot record here. Upload a WAV instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onNotice("Backfill could not use your microphone. Allow microphone access for this site, or upload a WAV instead.");
      return;
    }
    const active = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    active.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
    active.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      recorder.current = null;
      clearTimers();
      setRecording(false);
      try {
        const wav = await toWav(new Blob(chunks, { type: active.mimeType }));
        if (wav) onRecorded(wav);
        else onNotice("That recording was too short. Your offer is unchanged. Record the change again.");
      } catch {
        onNotice("The recording could not be read. Your offer is unchanged. Record again or upload a WAV.");
      }
    };
    recorder.current = active;
    active.start();
    setSeconds(0);
    setRecording(true);
    const startedAt = Date.now();
    const tick = () => { setSeconds(Math.floor((Date.now() - startedAt) / 1000)); timers.current.push(window.setTimeout(tick, 1000)); };
    timers.current.push(window.setTimeout(tick, 1000), window.setTimeout(() => active.stop(), AUTO_STOP_MS));
  }

  return (
    <div className="voice-recorder">
      {recording
        ? <button type="button" className="button recording" onClick={() => recorder.current?.stop()}><span aria-hidden="true" className="record-dot" />Stop and transcribe</button>
        : <button type="button" className="button primary" disabled={disabled} onClick={start}><span aria-hidden="true" className="record-dot" />Record your change</button>}
      {recording ? <p role="status" className="small">Recording {seconds}s of up to {AUTO_STOP_MS / 1000}s</p> : <p className="small">Try &ldquo;make it 20% off and unlock at 10 covers&rdquo;.</p>}
    </div>
  );
}
