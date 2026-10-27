import { z } from "zod";

// Single parsed view of process.env. Other modules read configuration only through here.
// Names only ever appear in .env.example; values live in the ignored .env.local and in Render.

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

// Meta trains on prompts sent to the contributor tier, so a contributor model ID refuses to boot.
const metaModelId = z
  .string()
  .min(1)
  .refine((value) => !value.endsWith("-contributor"), "must not be a -contributor tier model");

const httpsUrl = z.url().refine((value) => value.startsWith("https://"), "must be an https:// URL");

const LOCAL_BASE_URL = "http://localhost:3000";

const webSchema = z
  .object({
    DATABASE_URL: postgresUrl,
    // Unset on Render, which injects RENDER_EXTERNAL_URL instead.
    APP_BASE_URL: z.url().optional(),
    RENDER_EXTERNAL_URL: z.url().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    META_API_KEY: z.string().min(1),
    META_BASE_URL: httpsUrl,
    META_MODEL_SPARK: metaModelId,
    META_MODEL_WONDER: metaModelId,
    // Signs negotiation counter-offers from S5 on; nothing reads it yet, but a short one refuses to boot.
    NEGOTIATION_SIGNING_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  })
  .transform(({ APP_BASE_URL, RENDER_EXTERNAL_URL, ...rest }) => ({
    ...rest,
    APP_BASE_URL: APP_BASE_URL ?? RENDER_EXTERNAL_URL ?? LOCAL_BASE_URL,
  }));

// The S9 eval baseline only. Never set on Render, and the live product never reads it.
const evalSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: httpsUrl.optional(),
  OPENROUTER_MODEL_DEEPSEEK: z.string().min(1).optional(),
});

const migrationSchema = z.object({ DATABASE_URL: postgresUrl });
const testSchema = z.object({ TEST_DATABASE_URL: postgresUrl });

export type WebEnv = z.output<typeof webSchema>;
export type EvalEnv = z.infer<typeof evalSchema>;
export type MigrationEnv = z.infer<typeof migrationSchema>;
export type TestEnv = z.infer<typeof testSchema>;

// Names set by the platform or read by Next.js itself, not listed in .env.example.
const PLATFORM_NAMES = new Set(["RENDER_EXTERNAL_URL"]);

// Every name this module reads that a person sets. .env.example must list exactly these, plus the
// ones Next.js reads itself (NEXT_TELEMETRY_DISABLED).
export const ENV_NAMES = [
  ...new Set([
    ...Object.keys(webSchema.in.shape),
    ...Object.keys(evalSchema.shape),
    ...Object.keys(migrationSchema.shape),
    ...Object.keys(testSchema.shape),
  ]),
].filter((name) => !PLATFORM_NAMES.has(name));

// A plain record, so tests need not supply the NODE_ENV that Next.js types require of process.env.
export type EnvSource = Readonly<Record<string, string | undefined>>;

function parse<T>(schema: z.ZodType<T>, source: EnvSource, scope: string): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report names and reasons only, never values.
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid ${scope} configuration: ${problems.join("; ")}`);
  }
  return result.data;
}

let webCache: WebEnv | undefined;

export function webEnv(source: EnvSource = process.env): WebEnv {
  if (source !== process.env) return parse(webSchema, source, "web");
  webCache ??= parse(webSchema, source, "web");
  return webCache;
}

export function evalEnv(source: EnvSource = process.env): EvalEnv {
  return parse(evalSchema, source, "eval");
}

export function migrationEnv(source: EnvSource = process.env): MigrationEnv {
  return parse(migrationSchema, source, "migration");
}

export function testEnv(source: EnvSource = process.env): TestEnv {
  return parse(testSchema, source, "test");
}

// Command-line entrypoints are not started by Next.js, so they load .env.local themselves.
export function loadLocalEnvFile(path = ".env.local"): void {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
