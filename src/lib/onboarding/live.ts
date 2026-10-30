import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asc, sql, sum } from "drizzle-orm";
import postgres from "postgres";
import { loadLocalEnvFile, webEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { formatUsd } from "@/integrations/meta/pricing";
import { mintAgent } from "@/lib/agents/tokens";
import { getAgentTerms, getCommitmentStatus, listOffers, submitCommitment } from "@/lib/commitments/service";
import { connectDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { llmCalls, wonderPlans } from "@/lib/db/schema";
import { isEntrypoint } from "@/lib/entrypoint";
import { llmCallRecorder } from "@/lib/llm-calls";
import { redact } from "@/lib/log";
import { mintMerchant } from "./links";
import { sparkMenuReader, wonderMerchant } from "./models";
import { applyPlan, getDraft, publishDraft, readMenu, replanSoldOut } from "./service";

// S6 end to end against the real models, for evidence: npm run onboarding:live -- <local-postgres-url>
// [menu-photo]. It creates a scratch database on that local server (never Neon) and, as a
// runtime-role login, has Muse Spark read the synthetic menu photo of "Singapore Test Restaurant",
// publishes the draft with fixed terms (Tuesday 2-5pm, 25% off, 4 covers, a hidden floor at 70% of
// the list price), sells the next Tuesday out with two agents, has Muse Wonder plan the sellout, and
// applies the plan if it counted. Each model attempt is recorded in the scratch database's llm_calls;
// no model step starts once their cost reaches the cap, and each step is one provider call of at
// most 3 attempts. It prints only non-secret results and drops the scratch database and role.

export const SPEND_CAP_NANO_USD = 1_000_000_000; // US$1.00
export const MERCHANT_NAME = "Singapore Test Restaurant";
export const DEFAULT_PHOTO = "docs/plans/backfill/evidence/s6-onboarding/menu.png";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CAPACITY = 4;
const COVERS_PER_AGENT = 2;
const FLOOR_SHARE = 0.7;

export type LiveOptions = {
  // A local PostgreSQL server URL whose user may create databases and roles.
  serverUrl: string;
  meta: { baseUrl: string; apiKey: string; spark: string; wonder: string };
  photo: Uint8Array;
  fetch?: typeof fetch;
  out?: (line: string) => void;
  // No model step starts once the recorded cost reaches this; US$1.00 unless set.
  capNanoUsd?: number;
};

export type LiveSummary = {
  read: string;
  draft: { items: { name: string; priceCents: number }[]; cover: string; verdict: string; listPriceCents: number | null } | null;
  published: { listPriceCents: number; offerPriceCents: number; floorPriceCents: number; floorHiddenFromBuyers: boolean } | null;
  soldOut: { visitDate: string; filled: number } | null;
  plan: { verdict: string; discountBps: number | null; capacityCovers: number | null; minPoolCovers: number | null; perAgentCapCovers: number | null; rationale: string | null } | null;
  applied: string | null;
  calls: { purpose: string; model: string; attempt: number; ok: boolean; tokensIn: number; tokensOut: number; costNanoUsd: number; latencyMs: number; error: string | null }[];
  costNanoUsd: number;
  stoppedForCap: boolean;
  // The scratch database and role, both dropped before this returns, and the role every merchant
  // step ran as.
  scratch: { database: string; login: string; ranAs: string };
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

export async function liveOnboarding(options: LiveOptions): Promise<LiveSummary> {
  if (!LOCAL_HOSTS.has(new URL(options.serverUrl).hostname)) throw new Error("the server URL must be a local PostgreSQL");
  const out = options.out ?? ((line: string) => console.log(line));
  const cap = options.capNanoUsd ?? SPEND_CAP_NANO_USD;
  const suffix = randomBytes(4).toString("hex");
  const database = `backfill_live_s6_${suffix}`;
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
    const db = app.db;
    const [whoami] = await db.execute<{ user: string }>(sql`select current_user as user`);
    const provider = createMetaProvider({ baseUrl: options.meta.baseUrl, apiKey: options.meta.apiKey, record: llmCallRecorder(db), fetch: options.fetch });
    const spent = async () => Number((await admin.db.select({ total: sum(llmCalls.costNanoUsd) }).from(llmCalls))[0]?.total ?? 0);
    const summary: Omit<LiveSummary, "calls" | "costNanoUsd" | "scratch"> = { read: "not run", draft: null, published: null, soldOut: null, plan: null, applied: null, stoppedForCap: false };

    const run = async () => {
      const merchant = await mintMerchant(admin.db, MERCHANT_NAME);
      out(`merchant: ${MERCHANT_NAME}`);

      if ((await spent()) >= cap) return void (summary.stoppedForCap = true);
      const read = await readMenu(db, merchant.id, options.photo, sparkMenuReader(provider, options.meta.spark), options.meta.spark);
      summary.read = read.status;
      out(`menu read: ${read.status}`);
      if (!("draftId" in read)) return;
      const draft = await getDraft(db, merchant.id, read.draftId);
      if (!draft) throw new Error("the stored draft is missing");
      summary.draft = { items: draft.draft.items, cover: draft.draft.cover.description, verdict: draft.verdict, listPriceCents: draft.listPriceCents };
      out(`draft: ${JSON.stringify(summary.draft, null, 2)}`);
      if (draft.listPriceCents === null) return;

      const floorPriceCents = Math.floor(draft.listPriceCents * FLOOR_SHARE);
      const published = await publishDraft(db, merchant.id, draft.id, {
        capacityCovers: CAPACITY,
        terms: { window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 }, discountBps: 2500, minPoolCovers: 2, perAgentCapCovers: COVERS_PER_AGENT, floorPriceCents },
      });
      out(`publish: ${published.status}`);
      if (published.status !== "published") return;
      const offer = (await listOffers(db)).find((o) => o.offer.ruleId === published.ruleId);
      if (!offer) throw new Error("the published offer is not listed");
      // Without its random ids, whose hex digits could spell the floor by chance.
      const buyerView = JSON.stringify(offer).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
      summary.published = {
        listPriceCents: offer.offer.listPriceCents,
        offerPriceCents: offer.offer.offerPriceCents,
        floorPriceCents,
        floorHiddenFromBuyers: !/floor/i.test(buyerView) && !buyerView.includes(String(floorPriceCents)),
      };
      out(`buyers see: ${offer.summary}`);
      out(`floor hidden from buyers: ${summary.published.floorHiddenFromBuyers ? "yes" : "NO"}`);

      // Two agents take every cover of the next occurrence; the first status read after the deadline clears it.
      const terms = await getAgentTerms(db, published.ruleId);
      if (!terms) throw new Error("the published offer has no terms");
      const visitDate = terms.nextOccurrence.visitDate;
      const commitmentIds: { agentId: string; id: string }[] = [];
      for (const n of [1, 2]) {
        const agent = await mintAgent(admin.db, `live-s6-${suffix}-${n}`, "S6 live sellout");
        const submitted = await submitCommitment(db, agent.id, {
          ruleId: published.ruleId,
          termsVersion: terms.offer.termsVersion,
          visitDate,
          covers: COVERS_PER_AGENT,
          maxPricePerCoverCents: terms.offer.offerPriceCents,
          idempotencyKey: randomUUID(),
        });
        if (!submitted.ok) throw new Error(`commitment refused: ${submitted.reason}`);
        commitmentIds.push({ agentId: agent.id, id: submitted.commitment.commitmentId });
      }
      const afterDeadline = () => new Date(`${visitDate}T13:00:00+08:00`);
      let filled = 0;
      for (const c of commitmentIds) {
        const status = await getCommitmentStatus(db, c.agentId, c.id, afterDeadline);
        if (status.ok && status.commitment.status === "filled") filled += COVERS_PER_AGENT;
      }
      summary.soldOut = { visitDate, filled };
      out(`${visitDate}: ${filled} of ${CAPACITY} covers filled`);

      if ((await spent()) >= cap) return void (summary.stoppedForCap = true);
      const replanned = await replanSoldOut(db, { id: merchant.id, name: MERCHANT_NAME }, wonderMerchant(provider, options.meta.wonder), options.meta.wonder);
      out(`replan: ${JSON.stringify(replanned)}`);
      const [plan] = await admin.db.select().from(wonderPlans);
      if (!plan) return;
      summary.plan = {
        verdict: plan.verdict,
        discountBps: plan.discountBps,
        capacityCovers: plan.capacityCovers,
        minPoolCovers: plan.minPoolCovers,
        perAgentCapCovers: plan.perAgentCapCovers,
        rationale: plan.rationale,
      };
      out(`plan: ${JSON.stringify(summary.plan, null, 2)}`);
      if (plan.verdict !== "ok") return;
      const applied = await applyPlan(db, merchant.id, plan.id);
      summary.applied = applied.status;
      out(`apply: ${JSON.stringify(applied)}`);
    };
    await run();
    if (summary.stoppedForCap) out("spend cap reached; no further model step");

    const calls = (await admin.db.select().from(llmCalls).orderBy(asc(llmCalls.id))).map((c) => ({
      purpose: c.purpose,
      model: c.model,
      attempt: c.attempt,
      ok: c.ok,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      costNanoUsd: c.costNanoUsd,
      latencyMs: c.latencyMs,
      error: c.error,
    }));
    const costNanoUsd = await spent();
    out(`calls: ${JSON.stringify(calls, null, 2)}`);
    out(`total model cost ${formatUsd(costNanoUsd)} (cap ${formatUsd(cap)})`);
    return { ...summary, calls, costNanoUsd, scratch: { database, login, ranAs: String(whoami?.user) } };
  } finally {
    await app?.close();
    await admin.close();
    await root.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await root.unsafe(`DROP ROLE IF EXISTS ${login}`);
    await root.end({ timeout: 5 });
  }
}

if (isEntrypoint(import.meta.url)) {
  const [serverUrl, photoPath = DEFAULT_PHOTO] = process.argv.slice(2);
  if (!serverUrl || process.argv.length > 4) {
    console.error("usage: npm run onboarding:live -- <local-postgres-url> [menu-photo]");
    process.exit(2);
  }
  loadLocalEnvFile();
  const env = webEnv();
  liveOnboarding({
    serverUrl,
    meta: { baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, spark: env.META_MODEL_SPARK, wonder: env.META_MODEL_WONDER },
    photo: new Uint8Array(readFileSync(photoPath)),
  }).catch((err: unknown) => {
    console.error("live onboarding failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
    process.exitCode = 1;
  });
}
