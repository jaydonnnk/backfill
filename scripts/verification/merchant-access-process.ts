import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

export async function stopProcessGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, "exit");
  try { process.kill(-child.pid, "SIGTERM"); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
    throw error;
  }
  const kill = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } }, 5000);
  try { await ended; } finally { clearTimeout(kill); }
}
