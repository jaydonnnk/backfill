import { ENV_NAMES } from "@/env";

// Runs before every test file. A developer's shell may export the app's real configuration
// (DATABASE_URL pointing at Neon, a live META_API_KEY), and a test must never reach those. Only
// TEST_DATABASE_URL, the disposable-database server, survives.
for (const name of [...ENV_NAMES, "RENDER_EXTERNAL_URL"]) {
  if (name !== "TEST_DATABASE_URL") delete process.env[name];
}
