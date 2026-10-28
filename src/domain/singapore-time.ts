// Every window and deadline is a Singapore wall-clock time. Asia/Singapore has kept one offset
// (UTC+8) since 1982, but the zone is still resolved through Intl, never from the host's time zone
// and never from a hard-coded offset.
export const SINGAPORE_TZ = "Asia/Singapore";

export const MINUTES_PER_DAY = 1440;

export type SingaporeLocal = {
  // ISO calendar date in Singapore, such as "2026-11-03".
  date: string;
  // ISO weekday: 1 is Monday, 7 is Sunday.
  weekday: number;
  // Minutes since Singapore midnight, 0 to 1439.
  minute: number;
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SINGAPORE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// en-US short weekday names, which the formatter above always produces.
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as const;

export function singaporeLocal(instant: Date): SingaporeLocal {
  if (Number.isNaN(instant.getTime())) throw new Error("invalid instant");
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday as keyof typeof WEEKDAYS],
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}
