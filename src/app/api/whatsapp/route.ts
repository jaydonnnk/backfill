import { after } from "next/server";
import { webEnv, whatsappEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { log } from "@/lib/log";
import { challengeFor, inboundMessages, sendText, signatureValid } from "@/lib/whatsapp/cloud";
import { wonderOwner } from "@/lib/whatsapp/owner-model";
import { processInbound } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

// The WhatsApp Cloud API webhook for the merchant agent (S6b). Without the WHATSAPP_* settings the
// route does not exist (404). GET answers Meta's subscription check; POST takes the owner's messages.

export async function GET(request: Request): Promise<Response> {
  const config = whatsappEnv(webEnv());
  if (config === null) return new Response("Not found", { status: 404 });
  const challenge = challengeFor(new URL(request.url).searchParams, config.verifyToken);
  return challenge === null ? new Response("Forbidden", { status: 403 }) : new Response(challenge, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const env = webEnv();
  const config = whatsappEnv(env);
  if (config === null) return new Response("Not found", { status: 404 });
  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    log("warn", "whatsapp.rejected", { reason: request.headers.has("x-hub-signature-256") ? "bad_signature" : "no_signature", bytes: raw.length });
    return new Response("Forbidden", { status: 403 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const messages = inboundMessages(body);
  log("info", "whatsapp.received", { messages: messages.length, bytes: raw.length });
  const db = webDb();
  const provider = createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(db) });
  // Answer Meta at once: the model call can take several seconds, and an unanswered webhook is retried.
  after(() =>
    processInbound(db, messages, { propose: wonderOwner(provider, env.META_MODEL_WONDER), model: env.META_MODEL_WONDER }, sendText(config)).catch((err: unknown) =>
      log("error", "whatsapp.process_failed", { name: err instanceof Error ? err.name : "Error" }),
    ),
  );
  return new Response("ok", { status: 200 });
}
