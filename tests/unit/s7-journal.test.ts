import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Recording } from "../../sim/buyers/recording";
import { mapLimit } from "../../sim/buyers/scene";
import { openRecordingJournal } from "../../sim/buyers/journal";

it("keeps completed decisions in a durable partial journal when a later step fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-journal-"));
  try {
    const path = join(dir, "new-scene.json");
    const journal = openRecordingJournal(path);
    journal.append({ type: "buyer", data: { agentId: "sim-buyer-01", reply: { covers: 2, reason: "fits" } } });
    journal.append({ type: "failed", data: { error: "MCP connection failed" } });
    journal.close();
    expect(existsSync(journal.path)).toBe(true);
    expect(readFileSync(journal.path, "utf8").split("\n").filter(Boolean).map(s => JSON.parse(s))).toEqual([
      { type: "buyer", data: { agentId: "sim-buyer-01", reply: { covers: 2, reason: "fits" } } },
      { type: "failed", data: { error: "MCP connection failed" } },
    ]);
    expect(existsSync(path)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("refuses an existing recording before creating any new journal or changing its bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-existing-"));
  try {
    const path = join(dir, "scene.json"); writeFileSync(path, "frozen recording\n");
    let opened: ReturnType<typeof openRecordingJournal> | undefined;
    const error = (() => { try { opened = openRecordingJournal(path); return null; } catch(e) { return e instanceof Error ? e.message : "unknown"; } })();
    opened?.close();
    expect(error).toBe("recording already exists; use a new path");
    expect(readFileSync(path, "utf8")).toBe("frozen recording\n");
    expect(existsSync(`${path}.partial.jsonl`)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("refuses a second writer for the same partial recording", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-exclusive-"));
  try {
    const path = join(dir, "scene.json");
    const first = openRecordingJournal(path);
    first.append({ type: "started", data: { mode: "record" } });
    let second: ReturnType<typeof openRecordingJournal> | undefined;
    const error = (() => { try { second = openRecordingJournal(path); return null; } catch(e) { return e instanceof Error ? e.message : "unknown"; } })();
    second?.close(); first.close();
    expect(error).not.toBeNull();
    expect(readFileSync(first.path, "utf8")).toBe('{"type":"started","data":{"mode":"record"}}\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("drains started workers and leaves queued decisions unstarted after a fatal failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-drain-"));
  const journal = openRecordingJournal(join(dir, "scene.json"));
  let release = () => {};
  let entered = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let settled = false;
  const result = mapLimit([1, 2, 3], 2, async n => {
    if (n === 1) { await started; throw new Error("first failed"); }
    if (n === 2) { entered(); await blocked; }
    journal.append({ type: "completed", data: n });
    return n;
  }).then(() => { settled = true; return null; }, error => { settled = true; return error instanceof Error ? error.message : "unknown"; });
  await started;
  await new Promise(resolve => setImmediate(resolve));
  const settledBeforeDrain = settled;
  release();
  const failure = await result;
  await new Promise(resolve => setImmediate(resolve));
  journal.close();
  try {
    expect(settledBeforeDrain).toBe(false);
    expect(failure).toBe("first failed");
    expect(readFileSync(journal.path, "utf8")).toBe('{"type":"completed","data":2}\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("attributes interleaved attempt output to the correct buyer invocation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-attribution-"));
  const journal = openRecordingJournal(join(dir, "scene.json"));
  try {
    expect(journal).toHaveProperty("within", expect.any(Function));
    const record = (output: string) => ({ provider: "meta", model: "muse-spark-1.3", purpose: "sim_buyer", attempt: 1, tokensIn: 1, tokensCachedIn: 0, tokensOut: 1, costNanoUsd: 5500, latencyMs: 1, ok: true, httpStatus: 200, error: null, output });
    await Promise.all([
      journal.within("buyer_started", { agentId: "one" }, async () => { await new Promise(r => setImmediate(r)); journal.recordAttempt(record("one")); }),
      journal.within("buyer_started", { agentId: "two" }, async () => { journal.recordAttempt(record("two")); }),
    ]);
    const entries: { type: string; data: { callId: string; agentId?: string; record?: { output: string } } }[] = readFileSync(journal.path, "utf8").split("\n").filter(Boolean).map(s => JSON.parse(s));
    const started = entries.filter(e => e.type === "buyer_started");
    const attempts = entries.filter(e => e.type === "attempt");
    expect(new Set(started.map(e => e.data.callId)).size).toBe(2);
    expect(attempts.map(e => [started.find(s => s.data.callId === e.data.callId)?.data.agentId, e.data.record?.output])).toEqual([["two", "two"], ["one", "one"]]);
  } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

it("refuses an attempt with no request attribution instead of writing an ambiguous entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-unscoped-"));
  const journal = openRecordingJournal(join(dir, "scene.json"));
  try {
    expect(journal).toHaveProperty("recordAttempt", expect.any(Function));
    const error = (() => { try { journal.recordAttempt({ provider: "meta", model: "muse-spark-1.3", purpose: "sim_buyer", attempt: 1, tokensIn: 1, tokensCachedIn: 0, tokensOut: 1, costNanoUsd: 5500, latencyMs: 1, ok: true, httpStatus: 200, error: null, output: "one" }); return null; } catch(e) { return e instanceof Error ? e.message : "unknown"; } })();
    expect(error).toBe("model attempt is outside its recording invocation");
    expect(readFileSync(journal.path, "utf8")).toBe("");
  } finally { journal.close(); rmSync(dir, { recursive: true, force: true }); }
});

it("writes a completed recording exclusively and preserves a competing file byte for byte", () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-complete-"));
  const path = join(dir, "scene.json"), rivalPath = join(dir, "rival.json");
  const journal = openRecordingJournal(path), rival = openRecordingJournal(rivalPath);
  const recording = Recording.parse(JSON.parse(readFileSync("sim/buyers/recordings/scene.json", "utf8")));
  try {
    expect(journal).toHaveProperty("complete", expect.any(Function));
    journal.complete(recording);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(recording);
    expect(readFileSync(journal.path, "utf8")).toBe('{"type":"complete","data":{"costNanoUsd":87823600}}\n');
    writeFileSync(rivalPath, "competing recording\n");
    const error = (() => { try { rival.complete(recording); return null; } catch(e) { return e instanceof Error ? e.message : "unknown"; } })();
    expect(error).not.toBeNull();
    expect(readFileSync(rivalPath, "utf8")).toBe("competing recording\n");
  } finally { journal.close(); rival.close(); rmSync(dir, { recursive: true, force: true }); }
});
