import type { ImageInput, LLMProvider } from "@/integrations/meta/provider";
import { MenuDraft } from "@/domain/onboarding/menu";
import { percent, WonderPlan } from "@/domain/onboarding/replan";
import { errorFields, log } from "@/lib/log";

// The two S6 model calls. Muse Spark reads a menu photo into a MenuDraft; Muse Wonder, the
// merchant's agent, plans the rule's next terms after a sellout. Neither is told the hidden floor,
// and neither result counts until the domain judges it. Any failure becomes null.

export const MENU_VISION_PURPOSE = "menu_vision";
export const WONDER_PLAN_PURPOSE = "wonder_plan";

export type ReadMenu = (photo: ImageInput) => Promise<MenuDraft | null>;

const MENU_PROMPT = [
  "This is a photo of a Singapore cafe or restaurant menu.",
  "List every item whose price you can read, in menu order, with its printed price in SGD cents (S$6.50 is 650).",
  "Skip items with no readable price; never guess a price. Set currency to other if the prices are not Singapore dollars.",
  "Then pick the items that make one typical off-peak cover for one person, such as one main and one drink, by their zero-based indexes, and describe that cover in one short line.",
].join("\n");

export function sparkMenuReader(provider: LLMProvider, model: string): ReadMenu {
  return async (photo) => {
    try {
      const result = await provider.generate({
        model,
        purpose: MENU_VISION_PURPOSE,
        system: "You read menu photos for Backfill, which lists small Singapore food and drink merchants. Reply only with JSON matching the schema.",
        prompt: MENU_PROMPT,
        images: [photo],
        schemaName: "MenuDraft",
        schema: MenuDraft,
        maxCompletionTokens: 4096,
        reasoningEffort: "low",
      });
      log("info", "onboarding.menu_read", { attempts: result.attempts, costNanoUsd: result.costNanoUsd, latencyMs: result.latencyMs, items: result.value.items.length });
      return result.value;
    } catch (err) {
      log("error", "onboarding.menu_read_failed", errorFields(err));
      return null;
    }
  };
}

// What Wonder remembers: the rule's public terms and capacity, every past occurrence's fill, and
// every past plan with what became of it. It lives in Postgres and goes into each call.
export type PlanMemory = {
  merchantName: string;
  listPriceCents: number;
  capacityCovers: number;
  discountBps: number;
  minPoolCovers: number;
  perAgentCapCovers: number;
  window: string;
  soldOutDate: string;
  fills: { visitDate: string; unlocked: boolean; covers: number }[];
  plans: { visitDate: string; verdict: string; applied: boolean; discountBps: number | null; capacityCovers: number | null }[];
};

export type ProposePlan = (memory: PlanMemory) => Promise<WonderPlan | null>;

export function planPrompt(m: PlanMemory): string {
  const fills = m.fills.map((f) => `- ${f.visitDate}: ${f.unlocked ? `${f.covers} covers filled` : "pool not reached, nothing filled"}`);
  const plans = m.plans.map(
    (p) => `- after ${p.visitDate}: ${p.verdict === "ok" ? `proposed ${p.discountBps === null ? "?" : percent(p.discountBps)} off, capacity ${p.capacityCovers}, ${p.applied ? "applied" : "not applied"}` : `refused (${p.verdict})`}`,
  );
  return [
    `You are the merchant agent of ${m.merchantName}, a Singapore food and drink merchant on Backfill, where buyer agents pool off-peak covers.`,
    `The off-peak slot is ${m.window}. List price S$${(m.listPriceCents / 100).toFixed(2)} per cover; current terms ${percent(m.discountBps)} off, capacity ${m.capacityCovers} covers, minimum pool ${m.minPoolCovers}, at most ${m.perAgentCapCovers} covers per agent.`,
    `The occurrence on ${m.soldOutDate} sold out.`,
    "Fill history, oldest first:",
    ...(fills.length > 0 ? fills : ["- none"]),
    "Your past plans:",
    ...(plans.length > 0 ? plans : ["- none"]),
    `Plan the next terms. Demand beat supply, so you may add capacity (up to ${m.capacityCovers * 2}), raise the minimum pool, give a smaller discount, or change the per-agent cap; never a bigger discount, never less capacity. Change at least one term.`,
  ].join("\n");
}

export function wonderMerchant(provider: LLMProvider, model: string): ProposePlan {
  return async (memory) => {
    try {
      const result = await provider.generate({
        model,
        purpose: WONDER_PLAN_PURPOSE,
        system: "You are a careful merchant agent for a small Singapore food and drink business. Reply only with JSON matching the schema.",
        prompt: planPrompt(memory),
        schemaName: "WonderPlan",
        schema: WonderPlan,
        maxCompletionTokens: 2048,
        reasoningEffort: "medium",
      });
      log("info", "onboarding.plan", { attempts: result.attempts, costNanoUsd: result.costNanoUsd, latencyMs: result.latencyMs, rationale: result.value.rationale });
      return result.value;
    } catch (err) {
      log("error", "onboarding.plan_failed", errorFields(err));
      return null;
    }
  };
}
