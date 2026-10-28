import { webDb } from "@/lib/db/client";
import { methodNotAllowed, mcpPostHandler } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

// The buyer-facing MCP server, shaped as a Muse custom connector: streamable HTTP at /mcp with a
// per-agent bearer token.
export const POST = mcpPostHandler(webDb);
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
