import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isActive } from "@/lib/booking";
import { fmtWhen } from "@/lib/time";
import { BookingActions } from "@/components/BookingActions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";
import { PageHead } from "@/components/PageHead";

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (where: object) =>
  prisma.booking.findMany({ where: { cancelledAt: null, ...where }, include: { equipment: true, user: true }, orderBy: { start: "asc" } });

function state(b: Row, now: Date) {
  if (b.approval === "REJECTED") return { text: `Not approved${b.reviewNote ? `: ${b.reviewNote}` : ""}`, cls: "text-overdue" };
  if (b.checkedInAt) return { text: `Returned ${fmtWhen(b.checkedInAt, now)}`, cls: "text-muted" };
  if (b.equipment.outOfService && !b.checkedOutAt && now < b.end)
    return { text: "Affected: this item is out of service. Please contact lab staff.", cls: "text-overdue" };
  if (b.checkedOutAt && now > b.end) return { text: `Overdue since ${fmtWhen(b.end, now)}`, cls: "text-overdue" };
  if (b.checkedOutAt) return { text: `Checked out, due back ${fmtWhen(b.end, now)}`, cls: "text-inuse" };
  if (now >= b.end) return { text: "Not collected", cls: "text-muted" };
  if (b.approval === "PENDING") return { text: "Waiting for staff approval", cls: "text-booked" };
  return { text: b.useLocation || b.kind === "EXTENDED" ? "Booked (approved)" : "Booked", cls: "text-booked" };
}

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const sp = await searchParams;
  const user = await currentUser();
  const now = await requestNow();
  const mine = await load({ userId: user.id });
  const active = (b: Row) => isActive(b, now);
  const current = mine.filter(active);
  const past = mine.filter((b) => !active(b)).reverse().slice(0, 5);

  // Staff: what's out of the lab right now (overdue first), then everyone else's upcoming bookings.
  const staff = can.manageAnyBooking(user);
  const others = staff ? (await load({ checkedInAt: null })).filter(active) : [];
  const outNow = others.filter((b) => b.checkedOutAt).sort((a, b) => +a.end - +b.end);
  const upcomingOthers = others.filter((b) => !b.checkedOutAt && b.userId !== user.id);

  const list = (rows: Row[], showWho = false) => (
    <ul className="mt-4 divide-y divide-rule border-y border-rule">
      {rows.map((b) => {
        const s = state(b, now);
        return (
          <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
            <EquipmentIcon type={b.equipment.type} className="size-10 text-rgu-purple shrink-0" />
            <div className="flex-1 min-w-52">
              <p>
                <Link href={`/equipment/${b.equipmentId}`} className="font-extrabold underline-offset-4 hover:underline">
                  {b.equipment.name}
                </Link>
                {b.equipment.assetId && <span className="ml-2 font-mono text-sm text-muted">{b.equipment.assetId}</span>}
              </p>
              <ul className="meta">
                <li className="tabular-nums">
                  {fmtWhen(b.start, now)} to {fmtWhen(b.end, b.start)}
                </li>
                {showWho && (
                  <li>
                    {b.user.name}
                    {b.user.studentId && <span className="text-muted"> (ID {b.user.studentId})</span>}
                  </li>
                )}
                {b.useLocation && <li>At {b.useLocation}</li>}
              </ul>
              <p className={`text-sm font-semibold ${s.cls}`}>{s.text}</p>
            </div>
            <BookingActions booking={b} user={user} now={now} returnTo="/bookings" itemOutOfService={b.equipment.outOfService} />
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHead title="My bookings" />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-4xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />
          {current.length ? (
            list(current)
          ) : (
            <p className="mt-3">
              Nothing booked.{" "}
              <Link href="/" className="link">
                Find equipment
              </Link>
            </p>
          )}

          {staff && (
            <section className="mt-12 border-t border-rule pt-8">
              <h2 className="section-title">Out now</h2>
              <p className="mt-1 text-sm text-muted">Everything checked out of the lab, overdue first. Staff can check items in for anyone.</p>
              {outNow.length ? list(outNow, true) : <p className="mt-3">Nothing is out right now.</p>}
            </section>
          )}

          {upcomingOthers.length > 0 && (
            <section className="mt-12 border-t border-rule pt-8">
              <h2 className="section-title">Everyone else&apos;s bookings</h2>
              {list(upcomingOthers, true)}
            </section>
          )}

          {past.length > 0 && (
            <section className="mt-12 border-t border-rule pt-8">
              <h2 className="section-title">Recent</h2>
              {list(past)}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
