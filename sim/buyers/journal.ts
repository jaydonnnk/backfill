import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Recording } from "./recording";
import type { LlmCallRecord } from "@/integrations/meta/provider";

// A partial run is evidence too. The exclusive journal remains after a failure and each complete
// line is flushed before the next external step. It contains public prompts/replies, never tokens.
export function openRecordingJournal(recordingPath: string) {
  if (existsSync(recordingPath)) throw new Error("recording already exists; use a new path");
  mkdirSync(dirname(recordingPath), { recursive: true });
  const path = `${recordingPath}.partial.jsonl`;
  const fd = openSync(path, "wx", 0o600);
  const scope = new AsyncLocalStorage<string>();
  const append = (event: { type: string; data: unknown }) => {
    writeFileSync(fd, `${JSON.stringify(event)}\n`);
    fsyncSync(fd);
  };
  return {
    path,
    append,
    within<T>(type: "buyer_started" | "wonder_started", data: Record<string, unknown>, operation: () => Promise<T>): Promise<T> {
      const callId = randomUUID();
      append({ type, data: { ...data, callId } });
      return scope.run(callId, operation);
    },
    recordAttempt(record: LlmCallRecord): void {
      const callId = scope.getStore();
      if (callId === undefined) throw new Error("model attempt is outside its recording invocation");
      append({ type: "attempt", data: { callId, record, billingEvidence: "reported usage; zero is not proof of no charge" } });
    },
    complete(recording: Recording): void {
      writeFileSync(recordingPath, `${JSON.stringify(recording, null, 2)}\n`, { flag: "wx" });
      append({ type: "complete", data: { costNanoUsd: recording.costNanoUsd } });
    },
    close(): void { closeSync(fd); },
  };
}
