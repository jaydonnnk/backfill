import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAgent } from "@/lib/agents/tokens";
import type { Clock } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { errorFields, log } from "@/lib/log";
import { buildMcpServer } from "./server";

// Streamable HTTP MCP, stateless: each POST carries one JSON-RPC message or batch and gets a JSON
// reply, so the server keeps nothing in memory between requests and any instance can answer. The
// bearer token is checked before the MCP layer sees the request.
export function mcpPostHandler(db: () => Db, clock: Clock = () => new Date()): (req: Request) => Promise<Response> {
  return async (req) => {
    let agentId: string | null;
    try {
      agentId = await authenticateAgent(db(), req.headers.get("authorization"));
    } catch (err) {
      log("error", "mcp.auth_failed", errorFields(err));
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
    if (!agentId) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="backfill"' } });

    const server = buildMcpServer(db(), agentId, clock);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close();
    }
  };
}

// A stateless server offers no server-to-client stream and no session to delete.
export function methodNotAllowed(): Response {
  return Response.json({ error: "method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}
