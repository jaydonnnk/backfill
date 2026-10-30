import { loadLocalEnvFile, migrationEnv } from "@/env";
import { connectDb } from "@/lib/db/client";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";
import { mintMerchant } from "./links";

// Creates a merchant and its secret link: npm run merchant:mint -- "<merchant name>". The link is
// printed once for the person running the command, as a path to append to the app's base URL; the
// token is in its fragment, so opening it sends the token to no server log. Only its hash is stored.
// A synthetic merchant's name must say "(synthetic)".
if (isEntrypoint(import.meta.url)) {
  const [name] = process.argv.slice(2);
  if (!name || name.trim() === "" || process.argv.length > 3) {
    console.error('usage: npm run merchant:mint -- "<merchant name>"');
    process.exit(2);
  }
  loadLocalEnvFile();
  const { db, close } = connectDb(migrationEnv().DATABASE_URL, 1);
  mintMerchant(db, name.trim())
    .then(({ id, token }) => console.log(`merchant ${id} minted; secret link (shown once): /merchant/enter#${token}`))
    .catch((err: unknown) => {
      console.error("mint failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    })
    .finally(close);
}
