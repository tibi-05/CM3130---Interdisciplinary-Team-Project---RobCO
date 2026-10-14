import { cancel, checkIn, checkOut } from "@/app/actions";
import { LAB } from "@/lib/config";
import { can } from "@/lib/permissions";
import type { BookingLike } from "@/lib/booking";
import { ConfirmButton } from "./ConfirmButton";

type B = BookingLike & { id: number; userId: number };

/** Check out / Check in / Cancel, shown only when the action makes sense for this person right now. */
export function BookingActions({ booking: b, user, now, returnTo }: { booking: B; user: { id: number; role: string }; now: Date; returnTo: string }) {
  if (!can.actOnBooking(user, b) || b.cancelledAt || b.checkedInAt) return null;
  if (!b.checkedOutAt && now >= b.end) return null; // never collected and over: nothing left to do
  const canCollect = !b.checkedOutAt && now.getTime() >= b.start.getTime() - LAB.checkOutEarlyMinutes * 60_000 && now < b.end;

  const hidden = (
    <>
      <input type="hidden" name="bookingId" value={b.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {canCollect && (
        <form action={checkOut}>
          {hidden}
          <button className="btn">Check out</button>
        </form>
      )}
      {b.checkedOutAt && (
        <form action={checkIn}>
          {hidden}
          <button className="btn">Check in</button>
        </form>
      )}
      {!b.checkedOutAt && (
        <form action={cancel}>
          {hidden}
          <ConfirmButton message="Cancel this booking?" className="btn btn-light">
            Cancel
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
