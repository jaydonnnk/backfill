import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { asc, eq, sum } from "drizzle-orm";
import postgres from "postgres";
import { loadLocalEnvFile, webEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { formatUsd } from "@/integrations/meta/pricing";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { llmCalls, merchants, negotiationRounds, rules } from "@/lib/db/schema";
import { isEntrypoint } from "@/lib/entrypoint";
import { llmCallRecorder } from "@/lib/llm-calls";
import { redact } from "@/lib/log";
import { mcpPostHandler } from "@/lib/mcp/http";
import { NEGOTIATION_PURPOSE, sparkMerchant } from "./merchant-agent";

// One negotiation against the real merchant model, for evidence: npm run negotiation:live --
// <local-postgres-url>. It creates a scratch database on that local server (never Neon), seeds the
// demo offer (S$12.50 at 25% off, so S$9.38, with a hidden floor of S$9.03), and drives
// negotiate_offer through the MCP handler as a runtime-role login, bidding S$8.50 each round until
// the merchant accepts or the rounds run out. Each model attempt is recorded in the scratch
// database's llm_calls, and no round starts once their cost reaches the cap. It then commits at the
// last counter-offer, prints the rounds and the calls, and drops the scratch database and role.

export const SPEND_CAP_NANO_USD = 100_000_000; // US$0.10
const LIST_CENTS = 1250;
const FLOOR_CENTS = 903;
const BID_CENTS = 850;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type LiveOptions = {
  // A local PostgreSQL server URL whose user may create databases and roles.
  serverUrl: string;
  meta: { baseUrl: string; apiKey: string; model: string };
  fetch?: typeof fetch;
  out?: (line: string) => void;
  // No round starts once the recorded cost reaches this; US$0.10 unless set.
  capNanoUsd?: number;
};

export type LiveSummary = {
  rounds: { round: number; bidCents: number; proposedCents: number | null; verdict: string | null; status: string; counterCents: number }[];
  calls: { attempt: number; ok: boolean; tokensIn: number; tokensOut: number; costNanoUsd: number; latencyMs: number; error: string | null }[];
  costNanoUsd: number;
  committed: { ok: boolean; negotiatedPriceCents?: number; reason?: string };
  stoppedForCap: boolean;
  // The scratch database and role, both dropped before this returns.
  scratch: { database: string; login: string };
};

function withDatabase(url: string, database: string, user?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) {
    parsed.username = user;
    parsed.password = "";
  }
  return parsed.toString();
}

export async function liveNegotiation(options: LiveOptions): Promise<LiveSummary> {
  if (!LOCAL_HOSTS.has(new URL(options.serverUrl).hostname)) throw new Error("the server URL must be a local PostgreSQL");
  const out = options.out ?? ((line: string) => console.log(line));
  const cap = options.capNanoUsd ?? SPEND_CAP_NANO_USD;
  const suffix = randomBytes(4).toString("hex");
  const database = `backfill_live_s5_${suffix}`;
  const login = `backfill_live_rt_${suffix}`;
  const root = postgres(options.serverUrl, { max: 1, onnotice: () => {} });
  await root.unsafe(`CREATE DATABASE "${database}"`);
  const url = withDatabase(options.serverUrl, database);
  const admin = connectDb(url, 1);
  let app: ReturnType<typeof connectDb> | null = null;
  try {
    await runMigrations(url);
    await root.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
    app = connectDb(withDatabase(options.serverUrl, database, login), 4);
    const appDb = app.db;

    const [merchant] = await admin.db.insert(merchants).values({ name: "Demo Kopitiam (synthetic)" }).returning();
    const [rule] = await admin.db
      .insert(rules)
      .values({
        merchantId: merchant!.id,
        listPriceCents: LIST_CENTS,
        capacityCovers: 20,
        weekday: 2,
        startMinute: 840,
        endMinute: 1020,
        commitByMinute: 720,
        discountBps: 2500,
        minPoolCovers: 8,
        perAgentCapCovers: 4,
        floorPriceCents: FLOOR_CENTS,
      })
      .returning();
    const agent = await mintAgent(admin.db, `live-${suffix}`, "S5 live negotiation");

    const provider = createMetaProvider({ baseUrl: options.meta.baseUrl, apiKey: options.meta.apiKey, record: llmCallRecorder(appDb), fetch: options.fetch });
    const secret = randomBytes(32).toString("hex");
    const handler = mcpPostHandler(
      () => appDb,
      () => new Date(),
      () => ({ secret, propose: sparkMerchant(provider, options.meta.model) }),
    );
    const client = new Client({ name: "backfill-live-negotiation", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://backfill.local/mcp"), {
        fetch: (input, init) => handler(new Request(input, init)),
        requestInit: { headers: { Authorization: `Bearer ${agent.token}` } },
      }),
    );

    const spent = async () => Number((await admin.db.select({ total: sum(llmCalls.costNanoUsd) }).from(llmCalls))[0]?.total ?? 0);
    try {
      const terms = (await client.callTool({ name: "get_agent_terms", arguments: { ruleId: rule!.id } })).structuredContent as {
        terms: { offer: { termsVersion: number; offerPriceCents: number }; nextOccurrence: { visitDate: string } };
      };
      const args = { ruleId: rule!.id, termsVersion: terms.terms.offer.termsVersion, visitDate: terms.terms.nextOccurrence.visitDate, covers: 2, bidCents: BID_CENTS };
      out(`offer ${terms.terms.offer.offerPriceCents} cents, visit ${args.visitDate}, bid ${BID_CENTS} cents each round`);

      let counterOffer: string | null = null;
      let merchantPrice = terms.terms.offer.offerPriceCents;
      let stoppedForCap = false;
      for (;;) {
        if ((await spent()) >= cap) {
          stoppedForCap = true;
          out("spend cap reached; no further round");
          break;
        }
        const reply = (await client.callTool({ name: "negotiate_offer", arguments: args })).structuredContent as {
          ok: boolean;
          reason?: string;
          negotiation?: { round: number; roundsLeft: number; status: string; merchantPriceCents: number; counterOffer: string };
        };
        if (!reply.ok || !reply.negotiation) {
          out(`negotiate_offer refused: ${reply.reason}`);
          break;
        }
        const n = reply.negotiation;
        out(`round ${n.round}: ${n.status} at ${n.merchantPriceCents} cents, ${n.roundsLeft} left`);
        counterOffer = n.counterOffer;
        merchantPrice = n.merchantPriceCents;
        if (n.status === "accepted" || n.roundsLeft === 0) break;
      }

      let committed: LiveSummary["committed"] = { ok: false, reason: "no counter-offer" };
      if (counterOffer) {
        const { termsVersion, visitDate, covers, ruleId } = args;
        const submitted = (
          await client.callTool({
            name: "submit_commitment",
            arguments: { ruleId, termsVersion, visitDate, covers, maxPricePerCoverCents: merchantPrice, idempotencyKey: randomUUID(), counterOffer },
          })
        ).structuredContent as { ok: boolean; reason?: string; commitment?: { negotiatedPriceCents?: number } };
        committed = submitted.ok ? { ok: true, negotiatedPriceCents: submitted.commitment?.negotiatedPriceCents } : { ok: false, reason: submitted.reason };
        out(`submit_commitment: ${submitted.ok ? `ok at ${submitted.commitment?.negotiatedPriceCents} cents` : `refused: ${submitted.reason}`}`);
      }

      const rounds = (await admin.db.select().from(negotiationRounds).orderBy(asc(negotiationRounds.round))).map((r) => ({
        round: r.round,
        bidCents: r.bidCents,
        proposedCents: r.proposedCents,
        verdict: r.proposalVerdict,
        status: r.status,
        counterCents: r.counterCents,
      }));
      const calls = (await admin.db.select().from(llmCalls).where(eq(llmCalls.purpose, NEGOTIATION_PURPOSE)).orderBy(asc(llmCalls.id))).map((c) => ({
        attempt: c.attempt,
        ok: c.ok,
        tokensIn: c.tokensIn,
        tokensOut: c.tokensOut,
        costNanoUsd: c.costNanoUsd,
        latencyMs: c.latencyMs,
        error: c.error,
      }));
      const costNanoUsd = await spent();
      out(`rounds: ${JSON.stringify(rounds, null, 2)}`);
      out(`calls: ${JSON.stringify(calls, null, 2)}`);
      out(`total model cost ${formatUsd(costNanoUsd)} (cap ${formatUsd(cap)})`);
      return { rounds, calls, costNanoUsd, committed, stoppedForCap, scratch: { database, login } };
    } finally {
      await client.close();
    }
  } finally {
    await app?.close();
    await admin.close();
    await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.unsafe(`DROP ROLE IF EXISTS ${login}`);
    await root.end({ timeout: 5 });
  }
}

if (isEntrypoint(import.meta.url)) {
  const [serverUrl] = process.argv.slice(2);
  if (!serverUrl) {
    console.error("usage: npm run negotiation:live -- <local-postgres-url>");
    process.exit(2);
  }
  loadLocalEnvFile();
  const env = webEnv();
  // Only whether it is set: this run signs with a fresh secret of its own.
  console.log(`NEGOTIATION_SIGNING_SECRET in .env.local or the shell: ${env.NEGOTIATION_SIGNING_SECRET ? "set" : "not set"}`);
  liveNegotiation({ serverUrl, meta: { baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, model: env.META_MODEL_SPARK } }).catch((err: unknown) => {
    console.error("live negotiation failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
    process.exitCode = 1;
  });
}
