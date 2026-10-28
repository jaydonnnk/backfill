import type { Window } from "@/domain/offers/schema";
import { singaporeLocal } from "@/domain/singapore-time";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// One dated occurrence of a weekly window, as instants. A commitment is made against an occurrence;
// it may be made and cancelled before commitBy, and it is binding from then on.
export type Occurrence = {
  // The occurrence's Singapore date, such as "2026-11-03".
  visitDate: string;
  commitBy: Date;
  startsAt: Date;
  endsAt: Date;
};

function parseIsoDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("not an ISO date");
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new Error("not an ISO date");
  return ms;
}

// The instant at a Singapore wall-clock minute of a Singapore date (minute 1440 is the next
// midnight). The offset is read through singaporeLocal at that instant, never hard-coded.
export function singaporeInstant(date: string, minute: number): Date {
  const wallAsUtc = parseIsoDate(date) + minute * MS_PER_MINUTE;
  const local = singaporeLocal(new Date(wallAsUtc));
  const offset = parseIsoDate(local.date) + local.minute * MS_PER_MINUTE - wallAsUtc;
  return new Date(wallAsUtc - offset);
}

// The occurrence of the window on a Singapore date, or null when the date is not the window's
// weekday.
export function occurrenceOn(window: Window, visitDate: string): Occurrence | null {
  const noon = singaporeInstant(visitDate, 12 * 60);
  if (singaporeLocal(noon).weekday !== window.weekday) return null;
  return {
    visitDate,
    commitBy: singaporeInstant(visitDate, window.commitByMinute),
    startsAt: singaporeInstant(visitDate, window.startMinute),
    endsAt: singaporeInstant(visitDate, window.endMinute),
  };
}

// The first occurrence whose deadline is still ahead of now: the one a buyer can commit to next.
export function nextOccurrence(window: Window, now: Date): Occurrence {
  const today = parseIsoDate(singaporeLocal(now).date);
  for (let day = 0; day <= 7; day++) {
    const occurrence = occurrenceOn(window, new Date(today + day * MS_PER_DAY).toISOString().slice(0, 10));
    if (occurrence && now < occurrence.commitBy) return occurrence;
  }
  throw new Error("no occurrence within a week");
}
