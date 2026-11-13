import Link from "next/link";
import { cancel } from "@/app/actions";
import { LAB } from "@/lib/config";
import { can } from "@/lib/permissions";
import type { BookingLike } from "@/lib/booking";
import { ConfirmButton } from "./ConfirmButton";

type B = BookingLike & { id: number; userId: number };

/**
 * Check out / Check in / Cancel, shown only when the action makes sense for this person right now.
 * Check-out and check-in open the hand-over page, which records condition and battery.
 */
export function BookingActions({ booking: b, user, now, returnTo }: { booking: B; user: { id: number; role: string }; now: Date; returnTo: string }) {
  if (!can.actOnBooking(user, b) || b.cancelledAt || b.checkedInAt || b.approval === "REJECTED") return null;
  if (!b.checkedOutAt && now >= b.end) return null; // never collected and over: nothing left to do
  const canCollect =
    b.approval !== "PENDING" && !b.checkedOutAt && now.getTime() >= b.start.getTime() - LAB.checkOutEarlyMinutes * 60_000 && now < b.end;

  return (
    <div className="flex flex-wrap gap-2">
      {canCollect && (
        <Link href={`/handover/${b.id}`} className="btn">
          Check out
        </Link>
      )}
      {b.checkedOutAt && (
        <Link href={`/handover/${b.id}`} className="btn">
          Check in
        </Link>
      )}
      {!b.checkedOutAt && (
        <form action={cancel}>
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <ConfirmButton message={b.approval === "PENDING" ? "Withdraw this request?" : "Cancel this booking?"} className="btn btn-light">
            {b.approval === "PENDING" ? "Withdraw" : "Cancel"}
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
