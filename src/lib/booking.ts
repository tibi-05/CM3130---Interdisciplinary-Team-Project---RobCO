import { LAB } from "./config";
import { londonDate, londonParts, minutesOfDay } from "./time";

export type BookingLike = {
  start: Date;
  end: Date;
  checkedOutAt: Date | null;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
};

export type Status<B extends BookingLike = BookingLike> =
  | { kind: "out"; reason: string | null }
  | { kind: "overdue"; since: Date; booking: B }
  | { kind: "in-use"; until: Date; booking: B }
  | { kind: "booked"; until: Date; booking: B }
  | { kind: "free"; nextStart: Date | null };

export type StatusKind = Status["kind"];

/** How long a booking really holds the item: returned early frees the rest, overdue holds until now. */
export function effectiveEnd(b: BookingLike, now: Date): Date {
  if (b.checkedInAt) return b.checkedInAt;
  if (b.checkedOutAt && now > b.end) return now;
  return b.end;
}

/** Still needs attention: upcoming, running, or checked out and not back (overdue included). */
export const isActive = (b: BookingLike, now: Date) => !b.cancelledAt && !b.checkedInAt && (b.checkedOutAt !== null || b.end > now);

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

export function findClash<B extends BookingLike>(start: Date, end: Date, bookings: B[], now: Date): B | undefined {
  return bookings.find((b) => !b.cancelledAt && overlaps(start, end, b.start, effectiveEnd(b, now)));
}

export function statusOf<B extends BookingLike>(
  equipment: { outOfService: boolean; outOfServiceReason: string | null },
  bookings: B[],
  now: Date,
): Status<B> {
  if (equipment.outOfService) return { kind: "out", reason: equipment.outOfServiceReason };

  const live = bookings.filter((b) => !b.cancelledAt && !b.checkedInAt);

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

/** Returns a message for the person, or null when the range is allowed. */
export function validateRange(start: Date, end: Date, now: Date, opts: { walkUp?: boolean } = {}): string | null {
  if (!(end > start)) return "The end time must be after the start time.";
  if (end <= now) return "That time has already passed.";
  if (!opts.walkUp && start.getTime() < now.getTime() - LAB.slotMinutes * 60_000) return "That start time has already passed.";
  if (start.getTime() > now.getTime() + LAB.maxWeeksAhead * 7 * 86_400_000)
    return `Bookings can be made up to ${LAB.maxWeeksAhead} weeks ahead.`;
  if (londonDate(start) !== londonDate(end)) return "A booking has to start and end on the same day.";
  if (!(LAB.workDays as readonly number[]).includes(londonParts(start).weekday)) return "The lab is only open Monday to Friday.";

  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s < LAB.openMinutes || e > LAB.closeMinutes) return "Bookings must fit within lab hours (09:00–17:00).";
  if ((!opts.walkUp && s % LAB.slotMinutes) || e % LAB.slotMinutes) return `Times must be on ${LAB.slotMinutes}-minute steps.`;
  if (end.getTime() - start.getTime() > LAB.maxBookingMinutes * 60_000)
    return `The longest booking is ${LAB.maxBookingMinutes / 60} hours.`;
  return null;
}
