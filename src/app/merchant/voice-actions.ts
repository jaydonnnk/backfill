"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { webDb } from "@/lib/db/client";
import { voiceDeps } from "@/lib/owner-voice/deps";
import { uploadVoice, reviewTranscript, proposeVoice, approveVoice, discardVoice, type VoiceView } from "@/lib/owner-voice/service";
import { currentMerchant } from "./session";

const Id = z.uuid();
const Reference = z.object({ id: Id, revision: z.int().nonnegative() });
type Result = { status: string; edit: VoiceView | null };

// Each action resolves the cookie again. Client-supplied identities never authorize a change.
export async function uploadOwnerVoice(form: FormData): Promise<Result> {
  const merchant = await currentMerchant();
  if (!merchant) return { status: "signed_out", edit: null };
  const parsed = z.object({ id: Id, ruleId: Id, termsVersion: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "invalid_request", edit: null };
  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return { status: "invalid_audio", edit: null };
  return uploadVoice(webDb(), merchant.id, { ...parsed.data, bytes: new Uint8Array(await file.arrayBuffer()) }, voiceDeps());
}

export async function reviewOwnerVoice(input: unknown): Promise<Result> {
  const merchant = await currentMerchant();
  if (!merchant) return { status: "signed_out", edit: null };
  const parsed = Reference.extend({ text: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { status: "invalid_request", edit: null };
  return reviewTranscript(webDb(), merchant.id, parsed.data);
}

export async function proposeOwnerVoice(input: unknown): Promise<Result> {
  const merchant = await currentMerchant();
  if (!merchant) return { status: "signed_out", edit: null };
  const parsed = Reference.safeParse(input);
  if (!parsed.success) return { status: "invalid_request", edit: null };
  return proposeVoice(webDb(), merchant.id, parsed.data, voiceDeps());
}

export async function approveOwnerVoice(input: unknown): Promise<Result> {
  const merchant = await currentMerchant();
  if (!merchant) return { status: "signed_out", edit: null };
  const parsed = Reference.extend({ proposalId: Id }).safeParse(input);
  if (!parsed.success) return { status: "invalid_request", edit: null };
  const result = await approveVoice(webDb(), merchant.id, parsed.data);
  revalidatePath("/merchant");
  return result;
}

export async function discardOwnerVoice(input: unknown): Promise<Result> {
  const merchant = await currentMerchant();
  if (!merchant) return { status: "signed_out", edit: null };
  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { status: "invalid_request", edit: null };
  return discardVoice(webDb(), merchant.id, parsed.data);
}
