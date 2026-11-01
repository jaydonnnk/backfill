import { z } from "zod";
import { authenticateAgent } from "@/lib/agents/tokens";
import type { Clock } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { errorFields, log } from "@/lib/log";
import { completeCheckout, getCheckout } from "./service";

const Create = z.strictObject({ commitment_id: z.uuid() });
const Complete = z.strictObject({ simulate: z.literal(true) });
const Id = z.uuid();
const HEADERS = { "Cache-Control": "no-store", "X-Backfill-Mode": "simulation" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });

async function body(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 4096) { await reader.cancel(); return null; }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

// ACP-shaped simulation subset. No payment token, charge, fulfillment or model integration.
export function checkoutHandler(db: () => Db, operation: "create" | "read" | "complete", clock: Clock = () => new Date()) {
  return async (req: Request, sessionId?: string): Promise<Response> => {
    try {
      const connection = db();
      const agentId = await authenticateAgent(connection, req.headers.get("authorization"));
      if (!agentId) return Response.json({ error: "unauthorized" }, { status: 401, headers: { ...HEADERS, "WWW-Authenticate": 'Bearer realm="backfill"' } });
      let id: string;
      if (operation === "create") {
        if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return json({ error: "json_required" }, 415);
        const parsed = Create.safeParse(await body(req));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        id = parsed.data.commitment_id;
      } else {
        const parsed = Id.safeParse(sessionId);
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        id = parsed.data;
      }
      if (operation === "complete") {
        if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return json({ error: "json_required" }, 415);
        if (!Complete.safeParse(await body(req)).success) return json({ error: "invalid_request" }, 400);
        const result = await completeCheckout(connection, agentId, id, clock);
        return result.ok ? json(result.checkout) : json({ error: result.reason }, result.reason === "not_found" ? 404 : 422);
      }
      const session = await getCheckout(connection, agentId, id, clock);
      return session ? json(session, operation === "create" ? 201 : 200) : json({ error: "not_found" }, 404);
    } catch (err) {
      log("error", "checkout.unavailable", errorFields(err));
      return json({ error: "unavailable" }, 503);
    }
  };
}
