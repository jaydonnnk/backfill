"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { webEnv, whatsappEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import type { RuleSettings } from "@/domain/onboarding/menu";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { authenticateMerchant, MERCHANT_COOKIE } from "@/lib/onboarding/links";
import { sparkMenuReader, wonderMerchant } from "@/lib/onboarding/models";
import { applyPlan, publishDraft, readMenu, replanSoldOut } from "@/lib/onboarding/service";
import { newLinkCode } from "@/lib/whatsapp/service";
import { currentMerchant, setMerchantSession } from "./session";
import { MerchantName } from "@/domain/onboarding/access";
import { registerMerchant } from "@/lib/onboarding/registration";
import { clientKey } from "@/lib/rate-limit";
import { errorFields, log } from "@/lib/log";

// The merchant's actions. Each one authenticates the cookie again; none trusts a merchant id from the form.

export type CreateWorkspaceState = { status: "idle" | "invalid_name" | "rate_limited" | "failed" };

export async function createWorkspace(_previous: CreateWorkspaceState, form: FormData): Promise<CreateWorkspaceState> {
  const name = MerchantName.safeParse(form.get("name"));
  if (!name.success) return { status: "invalid_name" };
  let destination = "/merchant";
  try {
    if (!await currentMerchant()) {
      const result = await registerMerchant(webDb(), name.data, clientKey(await headers()));
      if (result.status === "rate_limited") return { status: "rate_limited" };
      await setMerchantSession(result.token);
      destination = "/merchant/access";
    }
  } catch (error) {
    log("error", "merchant.registration_failed", errorFields(error));
    return { status: "failed" };
  }
  redirect(destination);
}

function provider() {
  const env = webEnv();
  return { env, provider: createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(webDb()) }) };
}

async function merchantOrLeave() {
  const merchant = await currentMerchant();
  if (!merchant) redirect("/merchant");
  return merchant;
}

// Opening the secret link: the token arrives from the URL fragment, which no server or log sees,
// and is kept in an HttpOnly cookie for the merchant pages only.
export async function enterWithToken(token: string): Promise<boolean> {
  const merchant = await authenticateMerchant(webDb(), token);
  if (!merchant) return false;
  await setMerchantSession(token);
  return true;
}

export async function leave(): Promise<never> {
  (await cookies()).delete({ name: MERCHANT_COOKIE, path: "/merchant" });
  redirect("/merchant");
}

export async function uploadMenu(form: FormData): Promise<never> {
  const merchant = await merchantOrLeave();
  const photo = form.get("photo");
  const bytes = photo instanceof File ? new Uint8Array(await photo.arrayBuffer()) : new Uint8Array();
  const { env, provider: meta } = provider();
  const result = await readMenu(webDb(), merchant.id, bytes, sparkMenuReader(meta, env.META_MODEL_SPARK), env.META_MODEL_SPARK, undefined, clientKey(await headers()));
  if ("draftId" in result) redirect(`/merchant/drafts/${result.draftId}`);
  redirect(`/merchant?status=${result.status}`);
}

const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .transform((value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)));
const count = z.coerce.number().int().min(1).max(10_000);

const SettingsForm = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  start: clock,
  end: clock,
  commitBy: clock,
  discountPercent: z.coerce.number().int().min(1).max(99),
  minPool: count,
  perAgentCap: count,
  capacity: count,
  floorDollars: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .transform((value) => Math.round(Number(value) * 100)),
});

export async function publish(form: FormData): Promise<never> {
  const merchant = await merchantOrLeave();
  const draftId = String(form.get("draftId") ?? "");
  const parsed = SettingsForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/merchant/drafts/${encodeURIComponent(draftId)}?status=invalid_terms`);
  const f = parsed.data;
  const settings: RuleSettings = {
    capacityCovers: f.capacity,
    terms: {
      window: { weekday: f.weekday, startMinute: f.start, endMinute: f.end, commitByMinute: f.commitBy },
      discountBps: f.discountPercent * 100,
      minPoolCovers: f.minPool,
      perAgentCapCovers: f.perAgentCap,
      floorPriceCents: f.floorDollars,
    },
  };
  const result = await publishDraft(webDb(), merchant.id, draftId, settings);
  if (result.status === "published") redirect(`/merchant?published=${encodeURIComponent(draftId)}`);
  redirect(`/merchant/drafts/${encodeURIComponent(draftId)}?status=${result.status}`);
}

// Called by the dashboard when an occurrence has sold out and has no plan yet.
export async function replan(): Promise<string> {
  const merchant = await currentMerchant();
  if (!merchant) return "signed_out";
  const { env, provider: meta } = provider();
  return (await replanSoldOut(webDb(), merchant, wonderMerchant(meta, env.META_MODEL_WONDER), env.META_MODEL_WONDER)).status;
}

export async function apply(form: FormData): Promise<never> {
  const merchant = await merchantOrLeave();
  const result = await applyPlan(webDb(), merchant.id, String(form.get("planId") ?? ""));
  redirect(`/merchant?status=plan_${result.status}`);
}

// Gives the signed-in merchant a one-time WhatsApp link code, returned to the page, never put in a URL.
export async function startWhatsappLink(): Promise<{ code: string } | null> {
  const merchant = await currentMerchant();
  if (!merchant || whatsappEnv(webEnv()) === null) return null;
  return { code: (await newLinkCode(webDb(), merchant.id)).code };
}
