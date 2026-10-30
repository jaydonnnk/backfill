import { z } from "zod";
import { costNanoUsd, hasPrice, type Usage } from "./pricing";

// The one model interface the product calls. Every reply is constrained by a JSON schema on the
// server and validated again here with Zod; an invalid reply is retried with the validation errors.

export type StructuredRequest<T> = {
  model: string;
  // What the call is for, logged with every attempt.
  purpose: string;
  system: string;
  prompt: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxCompletionTokens: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  // Images sent with the prompt, such as a menu photo for Muse Spark vision. Never logged.
  images?: readonly ImageInput[];
};

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type StructuredResult<T> = {
  value: T;
  attempts: number;
  // Summed over every attempt, failed ones included, since each was billed.
  usage: Usage;
  costNanoUsd: number;
  latencyMs: number;
};

export interface LLMProvider {
  generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

// One row per attempt, matching the llm_calls table.
export type LlmCallRecord = Usage & {
  provider: string;
  model: string;
  purpose: string;
  attempt: number;
  costNanoUsd: number;
  latencyMs: number;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  output: string | null;
};

export type CallRecorder = (record: LlmCallRecord) => Promise<void>;

export class LlmError extends Error {
  override name = "LlmError";
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export type MetaProviderOptions = {
  baseUrl: string;
  apiKey: string;
  record: CallRecorder;
  fetch?: typeof fetch;
  maxAttempts?: number;
  timeoutMs?: number;
  // Delay before retry n (1-based); the default backs off exponentially from 500 ms.
  backoffMs?: (retry: number) => number;
  now?: () => number;
};

const OUTPUT_LIMIT = 4000;
// 429 and 5xx may succeed later; every other 4xx means the request itself must change.
const RETRYABLE_STATUS = (status: number) => status === 429 || status >= 500;

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional() }).nullish(),
  }),
});

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Message = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

// A prompt with images goes as content parts, the images as data URLs; a text-only prompt stays a string.
function userContent(prompt: string, images: readonly ImageInput[] | undefined): Message["content"] {
  if (!images || images.length === 0) return prompt;
  return [{ type: "text", text: prompt }, ...images.map((image) => ({ type: "image_url" as const, image_url: { url: `data:${image.mediaType};base64,${image.base64}` } }))];
}

type AttemptOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "invalid"; content: string; problem: string }
  | { kind: "failed"; retryable: boolean; problem: string };

export function createMetaProvider(options: MetaProviderOptions): LLMProvider {
  const fetchImpl = options.fetch ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const backoffMs = options.backoffMs ?? ((retry) => 500 * 2 ** (retry - 1));
  const now = options.now ?? (() => performance.now());
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    // An unpriced call could never be logged with its cost, so it is never sent.
    if (!hasPrice(request.model)) throw new LlmError(`No price for model ${request.model}`, 0);
    const jsonSchema = z.toJSONSchema(request.schema, { target: "draft-2020-12" }) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const messages: Message[] = [
      { role: "system", content: request.system },
      { role: "user", content: userContent(request.prompt, request.images) },
    ];
    const total: Usage = { tokensIn: 0, tokensCachedIn: 0, tokensOut: 0 };
    let totalCost = 0;
    let totalLatency = 0;
    let lastProblem = "no attempt made";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt - 1)));

      const started = now();
      let usage: Usage = { tokensIn: 0, tokensCachedIn: 0, tokensOut: 0 };
      let httpStatus: number | null = null;
      let content: string | null = null;
      let outcome: AttemptOutcome<T>;

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify({
            model: request.model,
            messages,
            max_completion_tokens: request.maxCompletionTokens,
            ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
            response_format: { type: "json_schema", json_schema: { name: request.schemaName, schema: jsonSchema, strict: true } },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        httpStatus = response.status;
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          outcome = { kind: "failed", retryable: RETRYABLE_STATUS(response.status), problem: `HTTP ${response.status}` };
        } else {
          const completion = completionSchema.safeParse(body);
          if (!completion.success) {
            outcome = { kind: "failed", retryable: true, problem: "response did not match the chat completion shape" };
          } else {
            const { usage: raw, choices } = completion.data;
            usage = { tokensIn: raw.prompt_tokens, tokensCachedIn: raw.prompt_tokens_details?.cached_tokens ?? 0, tokensOut: raw.completion_tokens };
            content = choices[0]?.message.content ?? null;
            outcome = validate(content, request.schema);
          }
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : "Error";
        outcome = { kind: "failed", retryable: true, problem: name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : `network error (${name})` };
      }

      const latencyMs = Math.max(0, Math.round(now() - started));
      const cost = costNanoUsd(request.model, usage);
      total.tokensIn += usage.tokensIn;
      total.tokensCachedIn += usage.tokensCachedIn;
      total.tokensOut += usage.tokensOut;
      totalCost += cost;
      totalLatency += latencyMs;

      await options.record({
        provider: "meta",
        model: request.model,
        purpose: request.purpose,
        attempt,
        ...usage,
        costNanoUsd: cost,
        latencyMs,
        ok: outcome.kind === "ok",
        httpStatus,
        // Built only from constants, HTTP statuses, error names and Zod issue messages, none of
        // which carry a request value, so there is nothing to redact.
        error: outcome.kind === "ok" ? null : outcome.problem,
        output: content === null ? null : content.slice(0, OUTPUT_LIMIT),
      });

      if (outcome.kind === "ok") {
        return { value: outcome.value, attempts: attempt, usage: total, costNanoUsd: totalCost, latencyMs: totalLatency };
      }
      lastProblem = outcome.problem;
      if (outcome.kind === "failed" && !outcome.retryable) throw new LlmError(`Model call failed: ${lastProblem}`, attempt);
      if (outcome.kind === "invalid") {
        // Show the model its own reply and what was wrong with it.
        messages.push(
          { role: "assistant", content: outcome.content },
          { role: "user", content: `That reply was invalid: ${outcome.problem}. Reply again with only JSON that matches the schema.` },
        );
      }
    }
    throw new LlmError(`Model call failed after ${maxAttempts} attempts: ${lastProblem}`, maxAttempts);
  }

  return { generate };
}

function validate<T>(content: string | null, schema: z.ZodType<T>): AttemptOutcome<T> {
  if (content === null || content.trim() === "") return { kind: "invalid", content: "", problem: "the reply was empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "invalid", content, problem: "the reply was not JSON" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { kind: "invalid", content, problem: issues.join("; ") };
  }
  return { kind: "ok", value: result.data };
}
