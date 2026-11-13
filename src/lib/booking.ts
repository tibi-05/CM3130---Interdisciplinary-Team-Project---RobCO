import { LAB } from "./config";
import { londonDate, londonParts, minutesOfDay } from "./time";

export type BookingLike = {
  start: Date;
  end: Date;
  checkedOutAt: Date | null;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
  approval?: string; // APPROVED (default) | PENDING | REJECTED
};

export type Status<B extends BookingLike = BookingLike> =
  | { kind: "out"; reason: string | null }
  | { kind: "overdue"; since: Date; booking: B }
  | { kind: "in-use"; until: Date; booking: B }
  | { kind: "booked"; until: Date; booking: B }
  | { kind: "free"; nextStart: Date | null };

export type StatusKind = Status["kind"];

/** Holds the item at all: not cancelled and not turned down. Pending requests hold it until staff decide. */
export const holdsSlot = (b: BookingLike) => !b.cancelledAt && b.approval !== "REJECTED";

/** How long a booking really holds the item: returned early frees the rest, overdue holds until now. */
export function effectiveEnd(b: BookingLike, now: Date): Date {
  if (b.checkedInAt) return b.checkedInAt;
  if (b.checkedOutAt && now > b.end) return now;
  return b.end;
}

/** Still needs attention: upcoming, running, or checked out and not back (overdue included). */
export const isActive = (b: BookingLike, now: Date) =>
  holdsSlot(b) && !b.checkedInAt && (b.checkedOutAt !== null || b.end > now);

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export function findClash<B extends BookingLike>(start: Date, end: Date, bookings: B[], now: Date): B | undefined {
  return bookings.find((b) => holdsSlot(b) && overlaps(start, end, b.start, effectiveEnd(b, now)));
}

export function statusOf<B extends BookingLike>(
  equipment: { outOfService: boolean; outOfServiceReason: string | null },
  bookings: B[],
  now: Date,
): Status<B> {
  if (equipment.outOfService) return { kind: "out", reason: equipment.outOfServiceReason };

  const live = bookings.filter((b) => holdsSlot(b) && !b.checkedInAt);

  const out = live.find((b) => b.checkedOutAt);
  if (out) return now >= out.end ? { kind: "overdue", since: out.end, booking: out } : { kind: "in-use", until: out.end, booking: out };

  const reserved = live.find((b) => b.start <= now && now < b.end);
  if (reserved) return { kind: "booked", until: reserved.end, booking: reserved };

  const next = live.filter((b) => b.start > now).sort((a, b) => +a.start - +b.start)[0];
  return { kind: "free", nextStart: next?.start ?? null };
}

/** Why a booking can't be collected yet (someone else still has the item), or null. `others` = the item's other bookings. */
export function checkOutBlocker(others: (BookingLike & { user: { name: string } })[]): string | null {
  const holder = others.find((b) => b.checkedOutAt && !b.checkedInAt && !b.cancelledAt);
  if (holder) return `${holder.user.name} still has it. It has to be checked in first.`;
  return null;
}

const isLabDay = (d: Date) => (LAB.workDays as readonly number[]).includes(londonParts(d).weekday);
const inHours = (m: number) => m >= LAB.openMinutes && m <= LAB.closeMinutes;

/**
 * Returns a message for the person, or null when the range is allowed.
 * Standard: one lab day, up to LAB.maxBookingMinutes. Extended: may span days, no maximum,
 * but collection and return must both fall in lab hours on lab days.
 */
export function validateRange(
  start: Date,
  end: Date,
  now: Date,
  opts: { walkUp?: boolean; extended?: boolean } = {},
): string | null {
  if (!(end > start)) return "The end time must be after the start time.";
  if (end <= now) return "That time has already passed.";
  if (!opts.walkUp && start.getTime() < now.getTime() - LAB.slotMinutes * 60_000) return "That start time has already passed.";
  if (start.getTime() > now.getTime() + LAB.maxWeeksAhead * 7 * 86_400_000)
    return `Bookings can be made up to ${LAB.maxWeeksAhead} weeks ahead.`;

  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (opts.extended) {
    if (!isLabDay(start) || !isLabDay(end)) return "Collection and return must both be on a weekday (Monday to Friday).";
    if (!inHours(s) || !inHours(e)) return "Collection and return must both be within lab hours (09:00–17:00).";
    if (s % LAB.slotMinutes || e % LAB.slotMinutes) return `Times must be on ${LAB.slotMinutes}-minute steps.`;
    return null;
  }

  if (londonDate(start) !== londonDate(end))
    return "A standard booking has to start and end on the same day. For several days, request an extended booking.";
  if (!isLabDay(start)) return "The lab is only open Monday to Friday.";
  if (!inHours(s) || !inHours(e)) return "Bookings must fit within lab hours (09:00–17:00).";
  if ((!opts.walkUp && s % LAB.slotMinutes) || e % LAB.slotMinutes) return `Times must be on ${LAB.slotMinutes}-minute steps.`;
  if (end.getTime() - start.getTime() > LAB.maxBookingMinutes * 60_000)
    return `Standard bookings are up to ${LAB.maxBookingMinutes / 60} hours. For longer, request an extended booking.`;
  return null;
}

/** Why a booking has to wait for staff approval (empty = confirmed straight away). */
export function approvalReasons(b: { start: Date; end: Date; useLocation?: string | null; kind?: string }): string[] {
  const reasons: string[] = [];
  if (b.kind === "EXTENDED" || b.end.getTime() - b.start.getTime() > LAB.maxBookingMinutes * 60_000)
    reasons.push(londonDate(b.start) === londonDate(b.end) ? "Longer than a standard booking" : "Runs over several days");
  if (b.useLocation) reasons.push(`Leaves the lab: ${b.useLocation}`);
  return reasons;
}

/**
 * Fair-use flag (never a block): people who booked the same item LAB.repeatFlagCount times or more
 * within LAB.repeatWindowDays either side of `now`.
 */
export function repeatedBookings<B extends BookingLike & { userId: number; equipmentId: number }>(
  bookings: B[],
  now: Date,
): { userId: number; equipmentId: number; count: number }[] {
  const window = LAB.repeatWindowDays * 86_400_000;
  const counts = new Map<string, { userId: number; equipmentId: number; count: number }>();
  for (const b of bookings) {
    if (!holdsSlot(b) || Math.abs(b.start.getTime() - now.getTime()) > window) continue;
    const key = `${b.userId}:${b.equipmentId}`;
    const c = counts.get(key) ?? { userId: b.userId, equipmentId: b.equipmentId, count: 0 };
    c.count++;
    counts.set(key, c);
  }
  return [...counts.values()].filter((c) => c.count >= LAB.repeatFlagCount).sort((a, b) => b.count - a.count);
}
