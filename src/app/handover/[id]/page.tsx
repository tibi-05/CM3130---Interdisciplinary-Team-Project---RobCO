import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtWhen } from "@/lib/time";
import { BATTERY, CONDITIONS, needsCharge } from "@/lib/handover";
import { checkIn, checkOut } from "@/app/actions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";
import { TextArea } from "@/components/Field";

// Collection and return in one place, with a 20-second condition check each way
// (client: record condition before and after use; flat batteries delayed the next user).
export default async function HandoverPage({ params, searchParams }: PageProps<"/handover/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const now = await requestNow();
  const user = await currentUser();
  if (!/^\d+$/.test(id)) notFound();
  const b = await prisma.booking.findUnique({ where: { id: Number(id) }, include: { equipment: true, user: true } });
  if (!b || b.cancelledAt || !can.actOnBooking(user, b)) notFound();

  const returning = !!b.checkedOutAt && !b.checkedInAt;
  const done = !!b.checkedInAt;
  const late = returning && now > b.end;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/bookings" className="text-rgu-blue underline font-semibold">
        ← My bookings
      </Link>
      <div className="mt-4">
        <Notice ok={one(sp.ok)} error={one(sp.error)} />
      </div>
      <div className="flex items-center gap-4">
        <EquipmentIcon type={b.equipment.type} className="size-14 text-rgu-purple" />
        <div>
          <h1 className="text-3xl font-extrabold">{done ? "Already returned" : returning ? "Return" : "Collect"}</h1>
          <p className="text-neutral-700">
            {b.equipment.name} · {fmtWhen(b.start, now)}–{fmtWhen(b.end, b.start)}
            {b.user.id !== user.id && <> · booked by {b.user.name}</>}
          </p>
        </div>
      </div>

      {done ? (
        <p className="mt-6">This booking was checked in {fmtWhen(b.checkedInAt!, now)}.</p>
      ) : (
        <form action={returning ? checkIn : checkOut} className="mt-6 border border-neutral-300 p-5">
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="returnTo" value={`/handover/${b.id}`} />
          {late && (
            <p className="mb-4 border-l-4 border-overdue bg-overdue-bg p-3 font-semibold text-overdue">
              This is {fmtWhen(b.end, now)} past due. It will be recorded as a late return.
            </p>
          )}
          {returning && needsCharge(b.batteryOut) && (
            <p className="mb-4 text-sm">The battery was {b.batteryOut?.toLowerCase()} when you collected it.</p>
          )}
          <p>{returning ? "Quick check before you hand it back." : "Quick check before you take it."} This helps the next person.</p>

          <fieldset className="mt-4">
            <legend className="font-extrabold">Condition</legend>
            {CONDITIONS.map((c, i) => (
              <label key={c} className="mt-1 flex items-center gap-2">
                <input type="radio" name="condition" value={c} defaultChecked={i === 0} required /> {c}
              </label>
            ))}
          </fieldset>
          <fieldset className="mt-4">
            <legend className="font-extrabold">Battery</legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {BATTERY.map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="battery" value={v} required /> {v}
                </label>
              ))}
            </div>
          </fieldset>
          <TextArea
            className="mt-4"
            label="Notes (optional)"
            name="note"
            maxLength={500}
            hint={returning ? "Anything the next person or lab staff should know." : "Describe anything that isn't right."}
          />
          <p className="mt-3 text-sm text-neutral-700">
            {returning
              ? "Anything other than Good is passed to lab staff as a fault report. Low or flat batteries alert staff to charge it."
              : "If it's damaged or not working, it won't be checked out: the fault is recorded and staff are told."}
          </p>
          <button className="btn mt-4">{returning ? "Check in" : "Check out"}</button>
        </form>
      )}
    </div>
  );
}
