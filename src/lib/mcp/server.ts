import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Cents, Covers, TermsVersion } from "@/domain/money";
import { Offer } from "@/domain/offers/schema";
import {
  cancelCommitment,
  type Clock,
  getAgentTerms,
  getCommitmentStatus,
  listOffers,
  submitCommitment,
  type SubmitRefusal,
} from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { errorFields, log } from "@/lib/log";

// The buyer-facing MCP server. Every tool reply is parsed by one of the strict schemas below before
// it is sent, so a reply carrying a field the schemas do not name (a floor, a capacity) or a
// refusal reason they do not list (such as below_floor) fails instead of reaching the buyer.

const BINDING =
  "A commitment is binding: if the pool reaches its minimum by the deadline, the buyer agrees to come in that window and pay the offer price per cover. " +
  "It can be cancelled only before the commit deadline; from the deadline on it cannot be withdrawn.";

const Occurrence = z.strictObject({ visitDate: z.iso.date(), commitBy: z.iso.datetime(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime() });
const OfferView = z.strictObject({ merchantName: z.string(), offer: Offer, summary: z.string(), nextOccurrence: Occurrence });

const CommitmentView = z.strictObject({
  commitmentId: z.uuid(),
  ruleId: z.uuid(),
  termsVersion: TermsVersion,
  visitDate: z.iso.date(),
  covers: Covers,
  maxPricePerCoverCents: Cents,
  committedAt: z.iso.datetime(),
  commitBy: z.iso.datetime(),
  status: z.enum(["pending", "cancelled", "filled", "not_filled"]),
  pooledCovers: z.int().nonnegative().optional(),
  minPoolCovers: Covers.optional(),
  pricePerCoverCents: Cents.optional(),
});

const REFUSAL_MESSAGES = {
  offer_unavailable: "This offer is not available. Call list_offers for the current offers.",
  stale_terms: "The offer's terms have changed. Call get_agent_terms, show the buyer the new terms, and submit with the new termsVersion.",
  not_on_offer_weekday: "visitDate is not on the offer's weekday. Use nextOccurrence.visitDate from get_agent_terms.",
  past_deadline: "The commit deadline for that visitDate has passed. Use nextOccurrence.visitDate from get_agent_terms.",
  over_agent_cap: "This agent would hold more covers than the offer's per-agent cap for that visit.",
  max_price_below_offer_price: "maxPricePerCoverCents is below the offer price, so this commitment could never be filled.",
  idempotency_key_reused: "This idempotencyKey was already used for a different commitment. Use a new key for a new commitment.",
  occurrence_cleared: "That visit has already cleared; no new commitments are taken for it.",
  not_found: "No commitment with that id belongs to this agent.",
  binding: "The commit deadline has passed, so this commitment is binding and cannot be cancelled.",
  unavailable: "The server could not answer just now. Try again; retrying a submission with the same idempotencyKey is safe.",
} as const satisfies Record<SubmitRefusal | "not_found" | "binding" | "unavailable", string>;

const Refusal = z.strictObject({
  ok: z.literal(false),
  reason: z.enum(Object.keys(REFUSAL_MESSAGES) as [keyof typeof REFUSAL_MESSAGES, ...(keyof typeof REFUSAL_MESSAGES)[]]),
  message: z.string(),
});

export const ToolReplies = {
  list_offers: z.strictObject({ ok: z.literal(true), offers: z.array(OfferView), binding: z.string() }),
  get_agent_terms: z.union([z.strictObject({ ok: z.literal(true), terms: OfferView, binding: z.string() }), Refusal]),
  submit_commitment: z.union([z.strictObject({ ok: z.literal(true), replayed: z.boolean(), commitment: CommitmentView, binding: z.string() }), Refusal]),
  get_commitment_status: z.union([z.strictObject({ ok: z.literal(true), commitment: CommitmentView }), Refusal]),
  cancel_commitment: z.union([z.strictObject({ ok: z.literal(true), commitment: CommitmentView }), Refusal]),
};
type ToolName = keyof typeof ToolReplies;

function refusal(reason: keyof typeof REFUSAL_MESSAGES) {
  return { ok: false as const, reason, message: REFUSAL_MESSAGES[reason] };
}

function result(payload: { ok: boolean }): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload as Record<string, unknown>, isError: !payload.ok };
}

// Runs one tool and parses its reply. Any failure, a reply the schema refuses included, is logged by
// name and code only and answered "unavailable", so no query, parameter or error text reaches the
// buyer.
export async function toolReply(tool: ToolName, agentId: string, run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const parsed = ToolReplies[tool].parse(await run()) as { ok: boolean; reason?: string };
    log("info", "mcp.tool", { tool, agentId, ok: parsed.ok, reason: parsed.reason ?? null });
    return result(parsed);
  } catch (err) {
    log("error", "mcp.tool_failed", { tool, agentId, ...errorFields(err) });
    return result(refusal("unavailable"));
  }
}

// One server per request, bound to the agent its bearer token named. The agent id never comes from
// a tool argument.
export function buildMcpServer(db: Db, agentId: string, clock: Clock = () => new Date()): McpServer {
  const server = new McpServer({ name: "backfill", version: "0.4.0" });

  server.registerTool(
    "list_offers",
    {
      title: "List off-peak offers",
      description:
        "Lists the Singapore food and drink merchants' off-peak offers an agent can commit to: the discounted price per cover in SGD cents, the weekly window in Singapore time, " +
        "the minimum pool that unlocks the discount, the per-agent cap and the next visit date with its commit deadline. Read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => toolReply("list_offers", agentId, async () => ({ ok: true, offers: await listOffers(db, clock), binding: BINDING })),
  );

  server.registerTool(
    "get_agent_terms",
    {
      title: "Get an offer's agent terms",
      description:
        "Returns the agent terms of one offer: the terms version a commitment must accept, the price, the window, the minimum pool, the per-agent cap and the next visit date. " +
        "Show the summary to the user before submitting a commitment. Read-only.",
      inputSchema: { ruleId: z.uuid().describe("The offer's ruleId from list_offers.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ ruleId }) =>
      toolReply("get_agent_terms", agentId, async () => {
        const terms = await getAgentTerms(db, ruleId, clock);
        return terms ? { ok: true, terms, binding: BINDING } : refusal("offer_unavailable");
      }),
  );

  server.registerTool(
    "submit_commitment",
    {
      title: "Submit a binding commitment",
      description:
        `Commits the user to buy covers at an offer's terms. ${BINDING} ` +
        "Before calling, show the user the offer's summary, the visit date, the covers and the total at the offer price, and get their agreement. " +
        "Retrying with the same idempotencyKey returns the first commitment instead of committing twice.",
      inputSchema: {
        ruleId: z.uuid().describe("The offer's ruleId."),
        termsVersion: TermsVersion.describe("The termsVersion from get_agent_terms that the user agreed to."),
        visitDate: z.iso.date().describe("The Singapore date of the visit, YYYY-MM-DD, on the offer's weekday; usually nextOccurrence.visitDate."),
        covers: Covers.describe("Covers (seats or servings) to commit to."),
        maxPricePerCoverCents: Cents.describe("The most the user will pay per cover, in SGD cents; at least the offer price."),
        idempotencyKey: z.string().min(1).max(200).describe("A key unique to this commitment, chosen by the agent, reused only to retry it."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) =>
      toolReply("submit_commitment", agentId, async () => {
        const submitted = await submitCommitment(db, agentId, input, clock);
        return submitted.ok ? { ...submitted, binding: BINDING } : refusal(submitted.reason);
      }),
  );

  server.registerTool(
    "get_commitment_status",
    {
      title: "Get a commitment's status",
      description:
        "Returns one of this agent's commitments: pending (with the covers pooled so far and the minimum) before the deadline, cancelled, " +
        "or from the deadline on filled (with the price per cover) or not_filled. Read-only.",
      inputSchema: { commitmentId: z.uuid().describe("The commitmentId from submit_commitment.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ commitmentId }) =>
      toolReply("get_commitment_status", agentId, async () => {
        const status = await getCommitmentStatus(db, agentId, commitmentId, clock);
        return status.ok ? status : refusal(status.reason);
      }),
  );

  server.registerTool(
    "cancel_commitment",
    {
      title: "Cancel a commitment before its deadline",
      description: `Cancels one of this agent's commitments. Only possible before the commit deadline; from the deadline on the commitment is binding and this is refused.`,
      inputSchema: { commitmentId: z.uuid().describe("The commitmentId from submit_commitment.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ commitmentId }) =>
      toolReply("cancel_commitment", agentId, async () => {
        const cancelled = await cancelCommitment(db, agentId, commitmentId, clock);
        return cancelled.ok ? cancelled : refusal(cancelled.reason);
      }),
  );

  return server;
}
