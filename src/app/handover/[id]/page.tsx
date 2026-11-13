import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtWhen } from "@/lib/time";
import { BATTERY, CONDITIONS, needsCharge } from "@/lib/handover";
import { checkIn, checkOut } from "@/app/actions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";
import { TextArea } from "@/components/Field";
import { BackLink, PageHead } from "@/components/PageHead";
import { Form } from "@/components/Form";

// Collection and return in one place, with a 20-second condition check each way
// (client: record condition before and after use; flat batteries delayed the next user).
export default async function HandoverPage({ params, searchParams }: PageProps<"/handover/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const now = await requestNow();
  const user = await currentUser();
  if (!/^\d+$/.test(id)) notFound();
  const b = await prisma.booking.findUnique({ where: { id: Number(id) }, include: { equipment: true, user: true } });
  if (!b || b.cancelledAt) notFound();
  if (!can.actOnBooking(user, b)) redirect("/bookings"); // e.g. after switching from Staff to Student

  const returning = !!b.checkedOutAt && !b.checkedInAt;
  const done = !!b.checkedInAt;
  const late = returning && now > b.end;

  return (
    <>
      <PageHead
        back={<BackLink href="/bookings">My bookings</BackLink>}
        title={done ? "Already returned" : returning ? "Return" : "Collect"}
        sub={
          <ul className="meta text-base">
            <li>{b.equipment.name}</li>
            <li>
              {fmtWhen(b.start, now)} to {fmtWhen(b.end, b.start)}
            </li>
            {b.user.id !== user.id && <li>Booked by {b.user.name}</li>}
          </ul>
        }
        aside={
          <span className="hidden bg-paper p-3 sm:block">
            <EquipmentIcon type={b.equipment.type} className="size-16 text-rgu-purple" />
          </span>
        }
      />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-2xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />
          {done ? (
            <p>This booking was checked in {fmtWhen(b.checkedInAt!, now)}.</p>
          ) : (
            <Form action={returning ? checkIn : checkOut} className="panel sm:p-6">
              <input type="hidden" name="bookingId" value={b.id} />
              <input type="hidden" name="returnTo" value={`/handover/${b.id}`} />
              {late && (
                <p className="mb-4 border-l-4 border-overdue bg-overdue-bg p-3 font-semibold text-overdue">
                  It was due back {fmtWhen(b.end, now)}. It will be recorded as a late return.
                </p>
              )}
              {returning && needsCharge(b.batteryOut) && (
                <p className="mb-4 text-sm">The battery was {b.batteryOut?.toLowerCase()} when you collected it.</p>
              )}
              <p className="text-lg">
                {returning ? "Quick check before you hand it back." : "Quick check before you take it."} This helps the next person.
              </p>

              <fieldset className="mt-5 grid gap-2">
                <legend className="mb-2 text-lg font-extrabold uppercase">Condition</legend>
                {CONDITIONS.map((c, i) => (
                  <label key={c} className="option">
                    <input type="radio" name="condition" value={c} defaultChecked={i === 0} required /> {c}
                  </label>
                ))}
              </fieldset>
              <fieldset className="mt-6">
                <legend className="mb-2 text-lg font-extrabold uppercase">Battery</legend>
                <div className="flex flex-wrap gap-2">
                  {BATTERY.map((v) => (
                    <label key={v} className="option">
                      <input type="radio" name="battery" value={v} required /> {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextArea
                className="mt-6"
                label="Notes (optional)"
                name="note"
                maxLength={500}
                hint={returning ? "Anything the next person or lab staff should know." : "Describe anything that isn't right."}
              />
              <p className="mt-4 text-sm text-muted">
                {returning
                  ? "Anything other than Good is passed to lab staff as a fault report. Low or flat batteries alert staff to charge it."
                  : "If it's damaged or not working, it won't be checked out: the fault is recorded and staff are told."}
              </p>
              <button className="btn mt-5">{returning ? "Check in" : "Check out"}</button>
            </Form>
          )}
        </div>
      </div>
    </>
  );
}
