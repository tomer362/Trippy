import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type DayPlan = { dayIndex: number; date: string | null };

/** ISO date (yyyy-MM-dd) helpers that never touch time zones. */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function addISODays(iso: string, n: number): string {
  return toISODate(addDays(parseISO(iso), n));
}

export function dayCountBetween(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
}

/**
 * Builds the day list for a trip. With dates, one day per calendar day; without, `dayCount`
 * undated days.
 */
export function buildDays(input: {
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
}): DayPlan[] {
  if (input.startDate && input.endDate) {
    const n = Math.max(1, dayCountBetween(input.startDate, input.endDate));
    return Array.from({ length: n }, (_, i) => ({
      dayIndex: i,
      date: addISODays(input.startDate!, i),
    }));
  }
  const n = Math.min(60, Math.max(1, input.dayCount));
  return Array.from({ length: n }, (_, i) => ({ dayIndex: i, date: null }));
}

/**
 * Reconciles existing days with a new date configuration. Days keep their index and content;
 * only dates are rewritten. Returns which indexes to create, update or drop (drop = move
 * content to "Unscheduled").
 */
export function reconcileDays(
  existing: DayPlan[],
  next: { startDate: string | null; endDate: string | null; dayCount: number },
): { create: DayPlan[]; update: DayPlan[]; drop: number[] } {
  const target = buildDays(next);
  const have = new Map(existing.map((d) => [d.dayIndex, d]));
  const create = target.filter((d) => !have.has(d.dayIndex));
  const update = target.filter((d) => {
    const cur = have.get(d.dayIndex);
    return cur && cur.date !== d.date;
  });
  const drop = existing.filter((d) => d.dayIndex >= target.length).map((d) => d.dayIndex);
  return { create, update, drop };
}

export function formatDayLabel(
  day: { dayIndex: number; date: string | null },
  opts?: { long?: boolean },
): string {
  if (!day.date) return `Day ${day.dayIndex + 1}`;
  const d = parseISO(day.date);
  return opts?.long ? format(d, "EEEE, d MMMM") : format(d, "EEE, d MMM");
}

export function formatDateRange(
  start: string | null,
  end: string | null,
  dayCount?: number,
): string {
  if (!start || !end)
    return dayCount ? `${dayCount} day${dayCount === 1 ? "" : "s"}` : "No dates yet";
  const s = parseISO(start);
  const e = parseISO(end);
  if (s.getFullYear() !== e.getFullYear())
    return `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
  if (s.getMonth() !== e.getMonth()) return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
  return `${format(s, "d")} – ${format(e, "d MMM yyyy")}`;
}

/** Days whose date lies within [checkIn, checkOut) — the nights spent at a lodging. */
export function daysCoveredByStay(days: DayPlan[], checkIn: string, checkOut: string): number[] {
  return days
    .filter((d) => d.date && d.date >= checkIn && d.date < checkOut)
    .map((d) => d.dayIndex);
}
