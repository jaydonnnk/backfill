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
    // Signs negotiation counter-offers (S5); unset leaves negotiate_offer out, and a short one refuses to boot.
    NEGOTIATION_SIGNING_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
    // The WhatsApp Cloud API (S6b): all four are set together or none is, and unset leaves /api/whatsapp off.
    WHATSAPP_APP_SECRET: z.string().min(1).optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d{5,20}$/, "must be the numeric phone number ID").optional(),
    WHATSAPP_GRAPH_BASE_URL: httpsUrl.default("https://graph.facebook.com/v23.0"),
  })
  .refine(
    (env) => [env.WHATSAPP_APP_SECRET, env.WHATSAPP_VERIFY_TOKEN, env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID].every((v) => v === undefined) || [env.WHATSAPP_APP_SECRET, env.WHATSAPP_VERIFY_TOKEN, env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID].every((v) => v !== undefined),
    { message: "WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set together", path: ["WHATSAPP_APP_SECRET"] },
  )
  .transform(({ APP_BASE_URL, RENDER_EXTERNAL_URL, ...rest }) => ({
    ...rest,
    APP_BASE_URL: APP_BASE_URL ?? RENDER_EXTERNAL_URL ?? LOCAL_BASE_URL,
  }));

const migrationSchema = z.object({ DATABASE_URL: postgresUrl });
const testSchema = z.object({ TEST_DATABASE_URL: postgresUrl });

export type WebEnv = z.output<typeof webSchema>;

export type WhatsappEnv = { appSecret: string; verifyToken: string; accessToken: string; phoneNumberId: string; baseUrl: string };

// The WhatsApp settings, or null when they are not set; the schema already refuses a partial set.
export function whatsappEnv(env: WebEnv): WhatsappEnv | null {
  const { WHATSAPP_APP_SECRET: appSecret, WHATSAPP_VERIFY_TOKEN: verifyToken, WHATSAPP_ACCESS_TOKEN: accessToken, WHATSAPP_PHONE_NUMBER_ID: phoneNumberId } = env;
  if (appSecret === undefined || verifyToken === undefined || accessToken === undefined || phoneNumberId === undefined) return null;
  return { appSecret, verifyToken, accessToken, phoneNumberId, baseUrl: env.WHATSAPP_GRAPH_BASE_URL };
}
export type MigrationEnv = z.infer<typeof migrationSchema>;
export type TestEnv = z.infer<typeof testSchema>;

// Names set by the platform or read by Next.js itself, not listed in .env.example.
const PLATFORM_NAMES = new Set(["RENDER_EXTERNAL_URL"]);

// Every name this module reads that a person sets. .env.example must list exactly these, plus the
// ones Next.js reads itself (NEXT_TELEMETRY_DISABLED).
export const ENV_NAMES = [
  ...new Set([
    ...Object.keys(webSchema.in.shape),
    ...Object.keys(migrationSchema.shape),
    ...Object.keys(testSchema.shape),
  ]),
].filter((name) => !PLATFORM_NAMES.has(name));

// A plain record, so tests need not supply the NODE_ENV that Next.js types require of process.env.
export type EnvSource = Readonly<Record<string, string | undefined>>;

function parse<T>(schema: z.ZodType<T>, source: EnvSource, scope: string): T {
  // An empty value, such as a key copied from .env.example and left blank, counts as unset.
  const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = schema.safeParse(set);
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
