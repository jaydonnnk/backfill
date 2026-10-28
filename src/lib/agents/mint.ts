import { appendFileSync } from "node:fs";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb } from "@/lib/db/client";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";

// Mints a buyer agent and its bearer token: npm run agent:mint -- <agent-id> <label> [ENV_NAME].
// With ENV_NAME, the token is appended to .env.local as ENV_NAME=<token> and never printed;
// without it, the token is printed once for the person running the command. Only the token's hash
// is stored.
if (isEntrypoint(import.meta.url)) {
  const [id, label, envName] = process.argv.slice(2);
  if (!id || !label || (envName !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(envName))) {
    console.error("usage: npm run agent:mint -- <agent-id> <label> [ENV_NAME]");
    process.exit(2);
  }
  loadLocalEnvFile();
  const { db, close } = connectDb(migrationEnv().DATABASE_URL, 1);
  mintAgent(db, id, label)
    .then(({ token }) => {
      if (envName) {
        appendFileSync(".env.local", `\n${envName}=${token}\n`, { mode: 0o600 });
        console.log(`agent ${id} minted; token written to .env.local as ${envName}`);
      } else {
        console.log(`agent ${id} minted; token (shown once): ${token}`);
      }
    })
    .catch((err: unknown) => {
      console.error("mint failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    })
    .finally(close);
}
