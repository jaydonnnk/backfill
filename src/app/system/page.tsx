import { count, eq, sql } from "drizzle-orm";
import { llmCalls } from "@/lib/db/schema";
import { formatUsd } from "@/integrations/meta/pricing";
import { webDb } from "@/lib/db/client";
import { recentCalls, latestOkCall, type LlmCallRow } from "@/lib/llm-calls";
import { errorFields, log } from "@/lib/log";
import { TRACER_COOLDOWN_MS, TRACER_DAILY_CAP, TRACER_PURPOSE, tracerReplySchema } from "@/lib/tracer";
import { askSpark } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  ok: "Muse Spark replied. The call is logged below.",
  busy: "Another call is in progress. Try again shortly.",
  cooldown: `One call per ${TRACER_COOLDOWN_MS / 1000} seconds. Try again shortly.`,
  daily_cap: `The daily limit of ${TRACER_DAILY_CAP} calls is reached.`,
  failed: "The call failed. Each attempt is still logged with its cost.",
};

function replyText(row: LlmCallRow): string {
  try {
    return tracerReplySchema.parse(JSON.parse(row.output ?? "")).reply;
  } catch {
    return row.output ?? "";
  }
}

async function loadLatest(): Promise<{ row: LlmCallRow | null; error: boolean; total: { calls: number; cost: number } | null; calls: Awaited<ReturnType<typeof recentCalls>> }> {
  try {
    const db = webDb();
    const [total] = await db.select({ calls: count(), cost: sql<string>`coalesce(sum(${llmCalls.costNanoUsd}), 0)` }).from(llmCalls).where(eq(llmCalls.provider, "meta"));
    return { calls: await recentCalls(db), row: await latestOkCall(db, TRACER_PURPOSE), error: false, total: { calls: total?.calls ?? 0, cost: Number(total?.cost ?? 0) } };
  } catch (err) {
    log("error", "page.latest_failed", errorFields(err));
    return { calls: [], row: null, error: true, total: null };
  }
}

export default async function System({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const notice = status ? STATUS_TEXT[status] : undefined;
  const { row, error, total, calls } = await loadLatest();

  return (
    <main className="workspace-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">System diagnostics</h1>
        <p className="text-[var(--muted)]">AI agents pool committed spend. Small merchants sell spoiling off-peak capacity to them.</p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-[var(--border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Latest Muse Spark reply</h2>
          <form action={askSpark}>
            <button type="submit" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] hover:opacity-90">
              Ask Muse Spark
            </button>
          </form>
        </div>

        {total && <p className="text-sm">Meta Model API calls: {total.calls} · recorded cost {formatUsd(total.cost)}</p>}

        {notice && <p role="status" className="text-sm text-[var(--muted)]">{notice}</p>}

        {error ? (
          <p className="text-sm">The call log could not be read.</p>
        ) : row ? (
          <>
            <blockquote className="border-l-2 border-[var(--accent)] pl-4 text-lg leading-relaxed">{replyText(row)}</blockquote>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label="Model" value={row.model} />
              <Stat label="Cost" value={formatUsd(row.costNanoUsd)} testId="cost" />
              <Stat label="Latency" value={`${row.latencyMs} ms`} />
              <Stat label="Tokens in" value={String(row.tokensIn)} />
              <Stat label="Tokens out" value={String(row.tokensOut)} />
              <Stat label="Logged (UTC)" value={row.createdAt.toISOString().replace("T", " ").slice(0, 16)} />
            </dl>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">No reply logged yet. Press the button to make one call.</p>
        )}
      </section>
      <section><h2>Recent model attempts</h2><p>These totals exclude voice, media, sandbox models and the US$0.0878 scene recording. They are not a total product bill.</p><div className="table-scroll"><table><thead><tr><th>Model</th><th>Purpose</th><th>OK</th><th>Tokens in / out</th><th>Cost</th><th>Latency</th></tr></thead><tbody>{calls.map(call=><tr key={call.id}><td>{call.model}</td><td>{call.purpose}</td><td>{call.ok?'yes':'no'}</td><td>{call.tokensIn} / {call.tokensOut}</td><td>{formatUsd(call.costNanoUsd)}</td><td>{call.latencyMs} ms</td></tr>)}</tbody></table></div></section>
    </main>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-mono" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
