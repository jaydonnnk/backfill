import { appendFileSync } from "node:fs";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb } from "@/lib/db/client";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";
import { BUYERS, tokenEnvName } from "./intents";

// Mints the 20 simulated buyer agents once: npm run sim:mint. Each token is appended to .env.local
// as SIM_BUYER_TOKEN_NN and never printed; a buyer whose token is already there is skipped.
if (isEntrypoint(import.meta.url)) {
  loadLocalEnvFile();
  const { db, close } = connectDb(migrationEnv().DATABASE_URL, 1);
  (async () => {
    for (const buyer of BUYERS) {
      const name = tokenEnvName(buyer.agentId);
      if (process.env[name]) continue;
      const { token } = await mintAgent(db, buyer.agentId, buyer.intent);
      appendFileSync(".env.local", `\n${name}=${token}\n`, { mode: 0o600 });
      console.log(`agent ${buyer.agentId} minted; token written to .env.local as ${name}`);
    }
  })()
    .catch((err: unknown) => {
      console.error("mint failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    })
    .finally(close);
}
