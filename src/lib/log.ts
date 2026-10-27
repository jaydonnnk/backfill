// Redacting logger. Free-text fields pass through redact() before reaching a sink, which removes
// connection strings and bearer values.

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/postgres(?:ql)?:(?:\\?\/){2}[^\s"'@]*@/gi, "postgres://[redacted]@"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
];

export function redact(text: string): string {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | null>;

function threshold(): Level {
  const configured = process.env.LOG_LEVEL;
  return configured === "debug" || configured === "warn" || configured === "error" ? configured : "info";
}

export function log(level: Level, event: string, fields: LogFields = {}): void {
  if (ORDER[level] < ORDER[threshold()]) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = typeof value === "string" ? redact(value) : value;
  }
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...safe });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

// What can be logged about an error without leaking a value: its name, a Postgres SQLSTATE code if
// there is one (drizzle puts the driver error in cause), and the configuration message, which names
// keys only.
export function errorFields(err: unknown): LogFields {
  const name = err instanceof Error ? err.name : "Error";
  const candidates = [err, err instanceof Error ? err.cause : undefined];
  const code = candidates.map((c) => (c as { code?: unknown } | undefined)?.code).find((c): c is string => typeof c === "string" && /^[0-9A-Z]{5}$/.test(c));
  const message = err instanceof Error && err.message.startsWith("Invalid web configuration:") ? err.message : null;
  return { name, pgCode: code ?? null, message };
}
