import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { OwnerChange, judgeOwnerChange } from '@/domain/whatsapp/owner-change';
import type { MerchantRule } from '@/domain/offers/schema';
import type { Db, Executor } from '@/lib/db/client';
import { merchants, ownerChanges, ownerVoiceEdits, rules } from '@/lib/db/schema';
import { constraintOf, settleDue, toRule } from '@/lib/commitments/service';
import { windowText } from '@/lib/onboarding/service';
import type { ProposeOwnerChange } from '@/lib/whatsapp/owner-model';
import { inspectWav } from './wav';

export type Transcription = { text: string; providerSessionId: string | null; audioDurationMs: number | null; costNanoUsd: number | null };
export type VoiceDeps = { transcribe: (bytes: Uint8Array) => Promise<Transcription | null>; propose: ProposeOwnerChange; voiceModel: string; wonderModel: string; source: 'fixture' | 'provider' };
const Terms = z.object({ discountBps: z.int(), capacityCovers: z.int(), minPoolCovers: z.int(), perAgentCapCovers: z.int() });
const StoredText = z.string().refine(value => !value.includes('\u0000') && Buffer.from(value, 'utf8').toString('utf8') === value, 'unsupported text encoding');
// Rejected proposals are recorded in PostgreSQL integer columns too.
const StoredCount = z.int().min(0).max(2_147_483_647);
const VoiceChange = OwnerChange.extend({ capacityCovers: StoredCount, minPoolCovers: StoredCount, perAgentCapCovers: StoredCount, reply: StoredText.min(1).max(300) });
const Source = z.enum(['fixture', 'provider']);
const Phase = z.enum(['transcribing', 'transcribed', 'reviewed', 'proposing', 'proposed', 'failed', 'cancelled', 'applied', 'superseded']);
export type VoiceView = {
  id: string; ruleId: string; termsVersion: number; revision: number; phase: z.infer<typeof Phase>;
  rawTranscript: string | null; transcript: string | null; source: z.infer<typeof Source>;
  voiceModel: string; wonderModel: string; proposalId: string | null; proposal: OwnerChange | null;
  before: z.infer<typeof Terms>; reason: string | null; expiresAt: string;
  audio: { sha256: string; durationMs: number };
  approval: { proposalId: string; at: string; version: number } | null;
};
export type VoiceResult = { status: string; edit: VoiceView | null };
type ProposalReservation = { invoke: false; output: VoiceResult } | { invoke: true; output: VoiceResult; row: typeof ownerVoiceEdits.$inferSelect; rule: MerchantRule; name: string };
const Id = z.uuid();
const Review = z.object({ id: Id, revision: z.int().nonnegative(), text: StoredText.trim().min(1).max(500) });
const Revision = z.object({ id: Id, revision: z.int().nonnegative() });
const TERMINAL = new Set(['applied', 'cancelled', 'superseded']);
export const VOICE_REVIEW_TTL_MS = 15 * 60_000;

async function rowOf(db: Executor, merchantId: string, id: string, lock = false) {
  const query = db.select().from(ownerVoiceEdits).where(and(eq(ownerVoiceEdits.id, id), eq(ownerVoiceEdits.merchantId, merchantId)));
  const [row] = lock ? await query.for('update') : await query;
  return row;
}
function view(row: typeof ownerVoiceEdits.$inferSelect): VoiceView {
  const output = OwnerChange.safeParse(row.proposalOutput);
  return {
    id: row.id, ruleId: row.ruleId, termsVersion: row.termsVersion, revision: row.revision,
    phase: Phase.parse(row.phase), rawTranscript: row.rawTranscript, transcript: row.transcript,
    source: Source.parse(row.source), voiceModel: row.voiceModel, wonderModel: row.wonderModel,
    proposalId: row.proposalId, proposal: output.success ? output.data : null,
    before: Terms.parse(row.before), reason: row.reason, expiresAt: row.expiresAt.toISOString(),
    audio: { sha256: row.audioSha256, durationMs: row.audioDurationMs },
    approval: row.approvedAt !== null && row.approvedVersion !== null && row.proposalId !== null
      ? { proposalId: row.proposalId, at: row.approvedAt.toISOString(), version: row.approvedVersion } : null,
  };
}
function result(status: string, row?: typeof ownerVoiceEdits.$inferSelect): VoiceResult { return { status, edit: row ? view(row) : null }; }
function unavailable(row: typeof ownerVoiceEdits.$inferSelect | undefined): string | null {
  if (!row) return 'not_found';
  if (TERMINAL.has(row.phase)) return row.phase;
  if (row.expiresAt.getTime() <= Date.now()) return 'expired';
  return null;
}
export async function getVoice(db: Db, merchantId: string, id: string): Promise<VoiceResult> {
  if (!Id.safeParse(id).success || !Id.safeParse(merchantId).success) return result('not_found');
  const row = await rowOf(db, merchantId, id);
  return result(unavailable(row) ?? row?.phase ?? 'not_found', row);
}

export async function uploadVoice(db: Db, merchantId: string, input: { id: string; ruleId: string; termsVersion: number; bytes: Uint8Array }, deps: VoiceDeps): Promise<VoiceResult> {
  if (!z.object({ id: Id, ruleId: Id, termsVersion: z.int().positive() }).safeParse(input).success || !Id.safeParse(merchantId).success) return result('invalid_request');
  const wave = inspectWav(input.bytes);
  if (!wave.ok) return result(wave.reason);
  const hash = createHash('sha256').update(input.bytes).digest('hex');
  const reservation = await db.transaction(async tx => {
    // Serialize uploads for an owner without holding an offer lock during network work.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${merchantId},4151010))`);
    const [existing] = await tx.select().from(ownerVoiceEdits).where(eq(ownerVoiceEdits.id, input.id));
    if (existing) {
      if (existing.merchantId !== merchantId) return { invoke: false, output: result('not_found') };
      if (existing.ruleId !== input.ruleId || existing.termsVersion !== input.termsVersion || existing.audioSha256 !== hash) return { invoke: false, output: result('conflict') };
      return { invoke: false, output: result(unavailable(existing) ?? existing.phase, existing) };
    }
    const [attempts] = await tx.execute<{ count: number }>(sql`select count(*)::int as count from owner_voice_edits where merchant_id=${merchantId}::uuid and created_at > now() - interval '1 day'`);
    if ((attempts?.count ?? 0) >= 30) return { invoke: false, output: result('daily_cap') };
    const [r] = await tx.select().from(rules).where(and(eq(rules.id, input.ruleId), eq(rules.merchantId, merchantId)));
    if (!r) return { invoke: false, output: result('not_found') };
    if (r.termsVersion !== input.termsVersion) return { invoke: false, output: result('stale') };
    await tx.update(ownerVoiceEdits).set({ phase: 'superseded', reason: 'replaced_audio' }).where(and(eq(ownerVoiceEdits.merchantId, merchantId), eq(ownerVoiceEdits.ruleId, input.ruleId), inArray(ownerVoiceEdits.phase, ['transcribing', 'transcribed', 'reviewed', 'proposing', 'proposed', 'failed'])));
    const [saved] = await tx.insert(ownerVoiceEdits).values({
      id: input.id, merchantId, ruleId: input.ruleId, termsVersion: input.termsVersion,
      phase: 'transcribing', audioSha256: hash, audioDurationMs: Math.max(1, Math.round(wave.durationMs)), sampleRate: wave.sampleRate,
      source: deps.source, voiceModel: deps.voiceModel, wonderModel: deps.wonderModel,
      before: { discountBps: r.discountBps, capacityCovers: r.capacityCovers, minPoolCovers: r.minPoolCovers, perAgentCapCovers: r.perAgentCapCovers },
      expiresAt: new Date(Date.now() + VOICE_REVIEW_TTL_MS),
    }).returning();
    return { invoke: true, output: result('transcribing', saved) };
  });
  if (!reservation.invoke) return reservation.output;
  let transcription: Transcription | null = null;
  try { transcription = await deps.transcribe(input.bytes); } catch { /* Provider content is never logged. */ }
  const parsed = z.object({ text: StoredText.trim().min(1).max(500), providerSessionId: StoredText.max(200).nullable(), audioDurationMs: z.int().nonnegative().max(60_000).nullable(), costNanoUsd: z.int().nonnegative().nullable() }).safeParse(transcription);
  return db.transaction(async tx => {
    const row = await rowOf(tx, merchantId, input.id, true);
    const blocked = unavailable(row);
    if (blocked || row?.phase !== 'transcribing') return result(blocked ?? 'interrupted', row);
    const [saved] = await tx.update(ownerVoiceEdits).set(parsed.success ? {
      phase: 'transcribed', rawTranscript: parsed.data.text, transcript: parsed.data.text,
      providerSessionId: parsed.data.providerSessionId, providerDurationMs: parsed.data.audioDurationMs, audioCostNanoUsd: parsed.data.costNanoUsd, reason: null,
    } : { phase: 'failed', reason: 'transcription_failed' }).where(eq(ownerVoiceEdits.id, input.id)).returning();
    return result(saved?.phase ?? 'failed', saved);
  });
}

export async function reviewTranscript(db: Db, merchantId: string, input: { id: string; revision: number; text: string }): Promise<VoiceResult> {
  const parsed = Review.safeParse(input);
  if (!parsed.success || !Id.safeParse(merchantId).success) return result('invalid_request');
  return db.transaction(async tx => {
    const row = await rowOf(tx, merchantId, input.id, true);
    const blocked = unavailable(row);
    if (blocked || !row) return result(blocked ?? 'not_found', row);
    if (row.revision !== input.revision) return result('revision_changed', row);
    if (row.revision >= 10) return result('review_limit', row);
    if (!row.rawTranscript) return result('transcript_unavailable', row);
    const [saved] = await tx.update(ownerVoiceEdits).set({ transcript: parsed.data.text, revision: row.revision + 1, reviewedAt: new Date(), phase: 'reviewed', proposalId: null, proposalOutput: null, reason: null }).where(eq(ownerVoiceEdits.id, input.id)).returning();
    return result('reviewed', saved);
  });
}

// These requests must refuse all edits, including a mixed supported/unsupported instruction.
const MANUAL = /\b(window|floor|deadline|time|hours?|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|pause|start|end|minimum\s+price|lowest\s+price)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu;
const CONFIRM_ONLY = /^(?:yes|y|yep|confirm|ok|okay|no|cancel|stop)[.!\s]*$/iu;
export async function proposeVoice(db: Db, merchantId: string, input: { id: string; revision: number }, deps: VoiceDeps): Promise<VoiceResult> {
  if (!Revision.safeParse(input).success || !Id.safeParse(merchantId).success) return result('invalid_request');
  const reserved = await db.transaction<ProposalReservation>(async tx => {
    const row = await rowOf(tx, merchantId, input.id, true);
    const blocked = unavailable(row);
    if (blocked || !row) return { invoke: false, output: result(blocked ?? 'not_found', row) };
    if (row.revision !== input.revision) return { invoke: false, output: result('revision_changed', row) };
    if (row.phase !== 'reviewed' || !row.transcript) return { invoke: false, output: result(row.phase, row) };
    if (deps.source !== row.source || deps.wonderModel !== row.wonderModel) return { invoke: false, output: result('model_mismatch', row) };
    const [r] = await tx.select().from(rules).where(and(eq(rules.id, row.ruleId), eq(rules.merchantId, merchantId)));
    if (!r || r.termsVersion !== row.termsVersion) return { invoke: false, output: result('stale', row) };
    const before = Terms.parse(row.before);
    if (before.discountBps !== r.discountBps || before.capacityCovers !== r.capacityCovers || before.minPoolCovers !== r.minPoolCovers || before.perAgentCapCovers !== r.perAgentCapCovers) return { invoke: false, output: result('stale', row) };
    const refusal = MANUAL.test(row.transcript) ? 'manual_route' : CONFIRM_ONLY.test(row.transcript) ? 'clarification' : null;
    if (refusal) {
      const [saved] = await tx.update(ownerVoiceEdits).set({ phase: 'failed', reason: refusal }).where(eq(ownerVoiceEdits.id, row.id)).returning();
      return { invoke: false, output: result(refusal, saved) };
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${merchantId},4151011))`);
    const [attempts] = await tx.execute<{ count: number }>(sql`select coalesce(sum(proposal_attempts),0)::int as count from owner_voice_edits where merchant_id=${merchantId}::uuid and created_at > now() - interval '1 day'`);
    if ((attempts?.count ?? 0) >= 30) return { invoke: false, output: result('daily_cap', row) };
    const [merchant] = await tx.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId));
    const [saved] = await tx.update(ownerVoiceEdits).set({ phase: 'proposing', proposalAttempts: row.proposalAttempts + 1 }).where(eq(ownerVoiceEdits.id, row.id)).returning();
    return { invoke: true, output: result('proposing', saved), row, rule: toRule(r), name: merchant?.name ?? '' };
  });
  if (!reserved.invoke || !reserved.row.transcript) return reserved.output;
  let output: unknown = null;
  try {
    const r = reserved.rule;
    output = await deps.propose(reserved.row.transcript, { merchantName: reserved.name, listPriceCents: r.listPriceCents, capacityCovers: r.capacityCovers, discountBps: r.terms.discountBps, minPoolCovers: r.terms.minPoolCovers, perAgentCapCovers: r.terms.perAgentCapCovers, window: windowText(r) });
  } catch { /* Failure is a bounded outcome, not an implicit retry. */ }
  const parsed = VoiceChange.safeParse(output);
  return db.transaction(async tx => {
    const row = await rowOf(tx, merchantId, input.id, true);
    const blocked = unavailable(row);
    if (blocked || !row || row.phase !== 'proposing' || row.revision !== input.revision) return result(blocked ?? 'interrupted', row);
    if (!parsed.success) {
      const [saved] = await tx.update(ownerVoiceEdits).set({ phase: 'failed', reason: output === null ? 'no_proposal' : 'invalid_output' }).where(eq(ownerVoiceEdits.id, row.id)).returning();
      return result(saved?.reason ?? 'failed', saved);
    }
    const change = parsed.data;
    const verdict = judgeOwnerChange(reserved.rule, change);
    const [proposal] = await tx.insert(ownerChanges).values({
      merchantId, ruleId: row.ruleId, termsVersion: row.termsVersion, voiceEditId: row.id, transcriptRevision: row.revision,
      messageText: row.transcript ?? '', model: deps.wonderModel, verdict: verdict.ok ? 'ok' : verdict.reason,
      expiresAt: row.expiresAt,
      ...(change.understood ? { discountBps: change.discountBps, capacityCovers: change.capacityCovers, minPoolCovers: change.minPoolCovers, perAgentCapCovers: change.perAgentCapCovers } : {}),
    }).returning({ id: ownerChanges.id });
    const [saved] = await tx.update(ownerVoiceEdits).set({ phase: verdict.ok ? 'proposed' : 'failed', proposalId: proposal?.id ?? null, proposalOutput: change, reason: verdict.ok ? null : verdict.reason === 'not_understood' ? 'clarification' : verdict.reason }).where(eq(ownerVoiceEdits.id, row.id)).returning();
    return result(saved?.phase === 'proposed' ? 'proposed' : saved?.reason ?? 'failed', saved);
  });
}

export async function approveVoice(db: Db, merchantId: string, input: { id: string; revision: number; proposalId: string }): Promise<VoiceResult> {
  if (!Revision.extend({ proposalId: Id }).safeParse(input).success || !Id.safeParse(merchantId).success) return result('invalid_request');
  const current = await rowOf(db, merchantId, input.id);
  if (!current) return result('not_found');
  // Settlement is the existing prerequisite for any owner change. It never approves this edit.
  await settleDue(db, merchantId);
  try {
    return await db.transaction(async tx => {
      const row = await rowOf(tx, merchantId, input.id, true);
      if (!row) return result('not_found');
      if (row.revision !== input.revision || row.proposalId !== input.proposalId) return result('revision_changed', row);
      if (row.phase === 'applied') return result('already_applied', row);
      const blocked = unavailable(row);
      if (blocked || row.phase !== 'proposed') return result(blocked ?? 'not_proposed', row);
      await tx.execute(sql`select apply_owner_change(${merchantId}::uuid, ${input.proposalId}::uuid)`);
      return result('applied', await rowOf(tx, merchantId, input.id));
    });
  } catch (error) {
    const constraint = constraintOf(error);
    const reason = constraint?.replace('apply_owner_change_', '');
    if (reason && ['owner', 'verdict', 'expired', 'superseded', 'stale', 'bounds', 'pending', 'voice'].includes(reason)) return result(reason, await rowOf(db, merchantId, input.id));
    throw error;
  }
}
export async function discardVoice(db: Db, merchantId: string, input: { id: string }): Promise<VoiceResult> {
  if (!Id.safeParse(input.id).success || !Id.safeParse(merchantId).success) return result('invalid_request');
  return db.transaction(async tx => {
    const row = await rowOf(tx, merchantId, input.id, true);
    if (!row) return result('not_found');
    if (TERMINAL.has(row.phase)) return result(row.phase, row);
    const [saved] = await tx.update(ownerVoiceEdits).set({ phase: 'cancelled', reason: 'owner_discarded' }).where(eq(ownerVoiceEdits.id, row.id)).returning();
    return result('cancelled', saved);
  });
}
