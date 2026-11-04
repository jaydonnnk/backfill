import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { stopProcessGroup } from "../../scripts/verification/merchant-access-process";

it("cleans up when a preview already terminated by signal", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
  await once(child, "spawn");
  const ended = once(child, "exit");
  if (!child.pid) throw new Error("Child did not start");
  process.kill(-child.pid, "SIGTERM");
  await ended;
  expect(child.signalCode).toBe("SIGTERM");
  await expect(stopProcessGroup(child)).resolves.toBeUndefined();
});

it("stops a running detached preview", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
  await once(child, "spawn");
  await stopProcessGroup(child);
  expect(child.signalCode).toBe("SIGTERM");
});
