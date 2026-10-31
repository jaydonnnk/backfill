import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadLocalEnvFile, migrationEnv, webEnv } from "@/env";
import { createMetaProvider, type LlmCallRecord } from "@/integrations/meta/provider";
import { formatUsd } from "@/integrations/meta/pricing";
import { connectDb } from "@/lib/db/client";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";
import { wonderMerchant } from "@/lib/onboarding/models";
import { sparkBuyer } from "./buyer";
import { BUYERS, tokenEnvName } from "./intents";
import { type ConnectBuyer, type Models, Recording, runScene } from "./scene";

// The demo scene in one command: npm run demo:scene -- <base-url> replay|record [recording.json].
// Buyers talk to the MCP server at <base-url> (the Render URL for the real scene) with their tokens
// from .env.local; the scene rule and Wonder's re-plan go to DATABASE_URL, the same database the
// server uses. record calls Muse Spark for every buyer and Muse Wonder for the sellout, stops
// calling once the billed cost reaches US$5.00, and writes the recording; replay makes no model call.

export const SPEND_CAP_NANO_USD = 5_000_000_000; // US$5.00
export const DEFAULT_RECORDING = "sim/buyers/recordings/scene.json";

export function mcpConnector(baseUrl: string, tokens: ReadonlyMap<string, string>, fetchImpl?: typeof fetch): ConnectBuyer {
  return async (agentId) => {
    const token = tokens.get(agentId);
    if (!token) throw new Error(`no token for ${agentId}`);
    const client = new Client({ name: `backfill-sim-${agentId}`, version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));
    return {
      call: async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent,
      close: () => client.close(),
    };
  };
}

async function main(baseUrl: string, mode: "record" | "replay", path: string): Promise<void> {
  loadLocalEnvFile();
  const tokens = new Map<string, string>();
  for (const b of BUYERS) {
    const token = process.env[tokenEnvName(b.agentId)];
    if (token) tokens.set(b.agentId, token);
  }
  if (tokens.size !== BUYERS.length) throw new Error(`${BUYERS.length - tokens.size} of ${BUYERS.length} buyer tokens are missing from .env.local; run npm run sim:mint`);
  const { db, close } = connectDb(migrationEnv().DATABASE_URL, 3);
  try {
    let models: Models;
    if (mode === "record") {
      const env = webEnv();
      const calls: LlmCallRecord[] = [];
      const provider = createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: async (r) => void calls.push(r) });
      const spent = () => calls.reduce((sum, c) => sum + c.costNanoUsd, 0);
      models = { mode, spark: env.META_MODEL_SPARK, wonder: env.META_MODEL_WONDER, decide: sparkBuyer(provider, env.META_MODEL_SPARK), propose: wonderMerchant(provider, env.META_MODEL_WONDER), spentNanoUsd: spent, capNanoUsd: SPEND_CAP_NANO_USD };
    } else {
      models = { mode, recording: Recording.parse(JSON.parse(readFileSync(path, "utf8"))) };
    }
    const result = await runScene({
      db,
      connect: mcpConnector(baseUrl, tokens),
      models,
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      leadMinutes: mode === "record" ? 4 : 2,
      concurrency: 4,
      settleMs: 5000,
      out: (line) => console.log(line),
    });
    if (result.recording) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(result.recording, null, 2)}\n`);
      console.log(`recording written to ${path}; billed ${formatUsd(result.recording.costNanoUsd)}`);
    }
    for (const b of result.buyers) console.log(`${b.agentId}: ${b.covers} covers, ${b.outcome}${b.reason ? ` (${b.reason})` : ""}`);
    const scene = result.snapshot.scene;
    if (scene) {
      console.log(`solo: ${scene.buyers.filter((b) => b.soloUnlocks).length} of ${scene.buyers.length} unlock alone`);
      console.log(`pooled: ${scene.pooled.covers} covers of ${scene.minPoolCovers}, ${scene.pooled.unlocked ? "unlocked" : "locked"}, ${scene.pooled.filledCovers} filled${scene.pooled.soldOut ? ", sold out" : ""}`);
      console.log(`re-plan: ${result.replan}${scene.plan ? `, verdict ${scene.plan.verdict}` : ""}`);
    }
    if (result.snapshot.muse) console.log(`real Muse user: ${result.snapshot.muse.covers} covers at ${result.snapshot.muse.merchantName}, ${result.snapshot.muse.status}`);
    console.log(`demo screen: ${new URL("/demo", baseUrl).toString()}`);
  } finally {
    await close();
  }
}

if (isEntrypoint(import.meta.url)) {
  const [baseUrl, mode, path] = process.argv.slice(2);
  if (!baseUrl || (mode !== "record" && mode !== "replay")) {
    console.error("usage: npm run demo:scene -- <base-url> replay|record [recording.json]");
    process.exit(2);
  }
  main(baseUrl, mode, path ?? DEFAULT_RECORDING).catch((err: unknown) => {
    console.error("scene failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
    process.exitCode = 1;
  });
}
