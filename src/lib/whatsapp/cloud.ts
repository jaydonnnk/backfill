import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { errorFields, log } from "@/lib/log";

// The WhatsApp Cloud API edge: verifying that a webhook call is Meta's, reading its messages, and
// sending a text reply. Nothing here touches the database.

export type WhatsappConfig = {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  baseUrl: string;
};

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

// Meta signs the raw request body with the app secret and sends "sha256=<hex>" in X-Hub-Signature-256.
export function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  const given = /^sha256=([0-9a-f]{64})$/.exec(header ?? "")?.[1];
  if (given === undefined) return false;
  return sameSecret(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"), given);
}

// The GET that subscribes the webhook: Meta sends the verify token we set and expects the challenge back.
export function challengeFor(params: URLSearchParams, verifyToken: string): string | null {
  const challenge = params.get("hub.challenge");
  if (params.get("hub.mode") !== "subscribe" || challenge === null) return null;
  return sameSecret(params.get("hub.verify_token") ?? "", verifyToken) ? challenge : null;
}

export type InboundMessage = { wamid: string; from: string; text: string | null };

const Payload = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z.array(z.object({ id: z.string(), from: z.string(), type: z.string(), text: z.object({ body: z.string() }).optional() })).optional(),
          }),
        }),
      ),
    }),
  ),
});

// The messages in a webhook body; delivery receipts and other events carry none. A body that is not
// the shape Meta documents yields none, so it is dropped rather than guessed at.
export function inboundMessages(body: unknown): InboundMessage[] {
  const parsed = Payload.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.entry.flatMap((e) =>
    e.changes.flatMap((c) => (c.value.messages ?? []).map((m) => ({ wamid: m.id, from: m.from, text: m.type === "text" && m.text ? m.text.body : null }))),
  );
}

export type SendText = (to: string, body: string) => Promise<boolean>;

// Sends a plain text reply from the business number. A reply inside the 24 hours after the owner's
// own message needs no template. A failure is logged and reported as false, never thrown, so a
// refused send cannot undo what the message already did.
export function sendText(config: WhatsappConfig, fetchImpl: typeof fetch = fetch): SendText {
  return async (to, body) => {
    try {
      const res = await fetchImpl(`${config.baseUrl}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) log("error", "whatsapp.send_failed", { status: res.status });
      return res.ok;
    } catch (err) {
      log("error", "whatsapp.send_failed", errorFields(err));
      return false;
    }
  };
}
