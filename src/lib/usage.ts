// Usage history (client: evidence for replacement funding, and spreading work across identical robots).
// Pure functions over booking records, so they can be tested without a database.
import { holdsSlot, type BookingLike } from "./booking";
import { londonDate, workWeek } from "./time";

type Use = BookingLike & { equipmentId: number; userId: number };

/** Minutes the item was actually out: check-out to check-in (or to now while still out). */
export function minutesUsed(b: BookingLike, now: Date): number {
  if (!b.checkedOutAt) return 0;
  const end = b.checkedInAt ?? now;
  return Math.max(0, Math.round((end.getTime() - b.checkedOutAt.getTime()) / 60_000));
}

/** Returned after the booking ended, or still out past it. */
export const isLate = (b: BookingLike, now: Date) =>
  !!b.checkedOutAt && (b.checkedInAt ? b.checkedInAt > b.end : now > b.end);

/** Approved, never collected, and over: a missed booking. */
export const isNoShow = (b: BookingLike, now: Date) => holdsSlot(b) && b.approval !== "PENDING" && !b.checkedOutAt && now >= b.end;

export type ItemUsage = { equipmentId: number; uses: number; minutes: number; late: number; noShows: number; lastUsed: Date | null };

export function usageByItem(bookings: Use[], now: Date): Map<number, ItemUsage> {
  const out = new Map<number, ItemUsage>();
  for (const b of bookings) {
    const u = out.get(b.equipmentId) ?? { equipmentId: b.equipmentId, uses: 0, minutes: 0, late: 0, noShows: 0, lastUsed: null };
    if (b.checkedOutAt) {
      u.uses++;
      u.minutes += minutesUsed(b, now);
      if (!u.lastUsed || b.checkedOutAt > u.lastUsed) u.lastUsed = b.checkedOutAt;
    }
    if (isLate(b, now)) u.late++;
    if (isNoShow(b, now)) u.noShows++;
    out.set(b.equipmentId, u);
  }
  return out;
}

/** Collected uses per lab week, oldest first, for the last `weeks` weeks including this one. */
export function usesPerWeek(bookings: BookingLike[], now: Date, weeks = 8): { monday: string; uses: number }[] {
  const mondays = Array.from({ length: weeks }, (_, i) => workWeek(now, i - weeks + 1)[0]);
  const counts = new Map(mondays.map((m) => [m, 0]));
  for (const b of bookings) {
    if (!b.checkedOutAt) continue;
    const m = workWeek(b.checkedOutAt)[0];
    if (counts.has(m)) counts.set(m, counts.get(m)! + 1);
  }
  return mondays.map((monday) => ({ monday, uses: counts.get(monday)! }));
}

/** Late returns and missed bookings per person, for staff to review repeated problems (no penalties). */
export function problemsByUser(bookings: Use[], now: Date): { userId: number; late: number; noShows: number }[] {
  const out = new Map<number, { userId: number; late: number; noShows: number }>();
  for (const b of bookings) {
    const late = isLate(b, now) ? 1 : 0;
    const noShow = isNoShow(b, now) ? 1 : 0;
    if (!late && !noShow) continue;
    const u = out.get(b.userId) ?? { userId: b.userId, late: 0, noShows: 0 };
    u.late += late;
    u.noShows += noShow;
    out.set(b.userId, u);
  }
  return [...out.values()].sort((a, b) => b.late + b.noShows - (a.late + a.noShows));
}

/**
 * Identical units (same asset ID) with their usage, least used first, so staff can suggest
 * the one that has had the least wear. Only groups with more than one unit.
 */
export function twinBalance<E extends { id: number; name: string; assetId: string | null; outOfService: boolean }>(
  equipment: E[],
  usage: Map<number, ItemUsage>,
): { assetId: string; units: { item: E; minutes: number }[]; suggest: E | null }[] {
  const groups = new Map<string, E[]>();
  for (const e of equipment) if (e.assetId) groups.set(e.assetId, [...(groups.get(e.assetId) ?? []), e]);
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([assetId, items]) => {
      const units = items.map((item) => ({ item, minutes: usage.get(item.id)?.minutes ?? 0 })).sort((a, b) => a.minutes - b.minutes);
      return { assetId, units, suggest: units.find((u) => !u.item.outOfService)?.item ?? null };
    });
}

export const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** One CSV cell, quoted when needed. */
export const csv = (v: unknown) => {
  const s = v instanceof Date ? londonDate(v) : v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
