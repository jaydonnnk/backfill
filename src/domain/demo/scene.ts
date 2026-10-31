import { clear } from "@/domain/clearing/clear";
import type { ClearingResult } from "@/domain/clearing/schema";
import type { Commitment } from "@/domain/commitments/schema";
import type { MerchantRule } from "@/domain/offers/schema";
import { MINUTES_PER_DAY, singaporeLocal } from "@/domain/singapore-time";

// The S7 demo scene: a rule whose deadline is a few minutes ahead, so one run can show buyers
// pooling, the deadline passing and the pool clearing, and the comparison the demo screen draws
// between each buyer alone and the pool.

// How long the visit window lasts once commitments close.
export const SCENE_WINDOW_MINUTES = 60;

export type SceneWindow = { visitDate: string; weekday: number; commitByMinute: number; startMinute: number; endMinute: number };

// Today's Singapore window whose deadline is the first whole minute at least leadMinutes from now,
// with the visit starting at the deadline. Null when the window would run past midnight, since a
// rule's window never crosses into the next day.
export function sceneWindow(now: Date, leadMinutes: number): SceneWindow | null {
  if (!Number.isInteger(leadMinutes) || leadMinutes < 1) throw new Error("leadMinutes must be a positive integer");
  const local = singaporeLocal(now);
  const partial = now.getUTCSeconds() > 0 || now.getUTCMilliseconds() > 0 ? 1 : 0;
  const commitByMinute = local.minute + leadMinutes + partial;
  const endMinute = commitByMinute + SCENE_WINDOW_MINUTES;
  if (endMinute > MINUTES_PER_DAY) return null;
  return { visitDate: local.date, weekday: local.weekday, commitByMinute, startMinute: commitByMinute, endMinute };
}

export type SoloVsPooled = {
  // Whether each commitment, cleared as the only one in its occurrence, would unlock the rule.
  solo: { commitmentId: string; unlocked: boolean }[];
  pooled: ClearingResult;
};

// The same engine, run once per commitment alone and once over the whole pool.
export function soloVsPooled(rule: MerchantRule, visitDate: string, commitments: readonly Commitment[]): SoloVsPooled {
  return {
    solo: commitments.map((c) => ({ commitmentId: c.id, unlocked: clear(rule, visitDate, [c]).unlocked })),
    pooled: clear(rule, visitDate, commitments),
  };
}
