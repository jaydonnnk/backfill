import { webEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { methodNotAllowed, mcpPostHandler } from "@/lib/mcp/http";
import { sparkMerchant } from "@/lib/negotiation/merchant-agent";
import type { NegotiationDeps } from "@/lib/negotiation/service";

export const dynamic = "force-dynamic";

// Negotiation needs the signing secret; without it, negotiate_offer is not offered.
function negotiation(): NegotiationDeps | null {
  const env = webEnv();
  if (!env.NEGOTIATION_SIGNING_SECRET) return null;
  const provider = createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(webDb()) });
  return { secret: env.NEGOTIATION_SIGNING_SECRET, propose: sparkMerchant(provider, env.META_MODEL_SPARK) };
}

// The buyer-facing MCP server, shaped as a Muse custom connector: streamable HTTP at /mcp with a
// per-agent bearer token.
export const POST = mcpPostHandler(webDb, () => new Date(), negotiation);
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
