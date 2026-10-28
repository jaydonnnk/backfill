import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadLocalEnvFile } from "@/env";
import { isEntrypoint } from "@/lib/entrypoint";

// A scripted MCP client for checking a deployed server: npm run mcp:smoke -- <base-url> <ENV_NAME>
// [covers]. It reads the agent token from ENV_NAME (in .env.local or the shell) and never prints
// it, lists the offers, reads the first offer's terms, submits a binding commitment of `covers` for
// its next visit at the offer price, and reads the commitment's status back. Without covers it
// stops after reading the terms.
async function smoke(baseUrl: string, token: string, covers: number | null): Promise<void> {
  const client = new Client({ name: "backfill-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", baseUrl), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  try {
    const show = (label: string, value: unknown) => console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
    show("tools", (await client.listTools()).tools.map((t) => t.name));
    const offers = (await client.callTool({ name: "list_offers", arguments: {} })).structuredContent as { offers: { offer: { ruleId: string } }[] };
    show("list_offers", offers);
    const first = offers.offers[0];
    if (!first) return;
    const terms = (await client.callTool({ name: "get_agent_terms", arguments: { ruleId: first.offer.ruleId } })).structuredContent as {
      terms: { offer: { termsVersion: number; offerPriceCents: number }; nextOccurrence: { visitDate: string } };
    };
    show("get_agent_terms", terms);
    if (covers === null) return;
    const submitted = (
      await client.callTool({
        name: "submit_commitment",
        arguments: {
          ruleId: first.offer.ruleId,
          termsVersion: terms.terms.offer.termsVersion,
          visitDate: terms.terms.nextOccurrence.visitDate,
          covers,
          maxPricePerCoverCents: terms.terms.offer.offerPriceCents,
          idempotencyKey: `smoke-${randomUUID()}`,
        },
      })
    ).structuredContent as { ok: boolean; commitment?: { commitmentId: string } };
    show("submit_commitment", submitted);
    if (submitted.commitment) show("get_commitment_status", (await client.callTool({ name: "get_commitment_status", arguments: { commitmentId: submitted.commitment.commitmentId } })).structuredContent);
  } finally {
    await client.close();
  }
}

if (isEntrypoint(import.meta.url)) {
  const [baseUrl, envName, coversArg] = process.argv.slice(2);
  if (!baseUrl || !envName || (coversArg !== undefined && !/^[1-9]\d*$/.test(coversArg))) {
    console.error("usage: npm run mcp:smoke -- <base-url> <ENV_NAME> [covers]");
    process.exit(2);
  }
  loadLocalEnvFile();
  const token = process.env[envName];
  if (!token) {
    console.error(`${envName} is not set`);
    process.exit(2);
  }
  smoke(baseUrl, token, coversArg === undefined ? null : Number(coversArg)).catch((err: unknown) => {
    console.error("smoke failed:", err instanceof Error ? `${err.name}: ${err.message}`.replace(token, "[redacted]") : "Error");
    process.exitCode = 1;
  });
}
