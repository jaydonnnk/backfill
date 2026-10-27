import { defineConfig } from "drizzle-kit";

// Generation only reads the schema file; migrations are applied by src/lib/db/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
