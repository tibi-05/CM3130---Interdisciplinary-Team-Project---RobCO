import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { effectiveEnd } from "@/lib/booking";
import { fmtTime, fmtWhen } from "@/lib/time";
import { BookingActions } from "@/components/BookingActions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (where: object) =>
  prisma.booking.findMany({ where: { cancelledAt: null, ...where }, include: { equipment: true, user: true }, orderBy: { start: "asc" } });

function state(b: Row, now: Date) {
  if (b.checkedInAt) return { text: `Returned ${fmtWhen(b.checkedInAt, now)}`, cls: "text-neutral-700" };
  if (b.checkedOutAt && now > b.end) return { text: `Overdue since ${fmtWhen(b.end, now)}`, cls: "text-overdue" };
  if (b.checkedOutAt) return { text: `Checked out, due back ${fmtWhen(b.end, now)}`, cls: "text-inuse" };
  if (now >= b.end) return { text: "Not collected", cls: "text-neutral-700" };
  return { text: "Booked", cls: "text-booked" };
}

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const sp = await searchParams;
  const user = await currentUser();
  const now = await requestNow();
  const mine = await load({ userId: user.id });
  const active = (b: Row) => !b.checkedInAt && effectiveEnd(b, now) > now;
  const current = mine.filter(active);
  const past = mine.filter((b) => !active(b)).reverse().slice(0, 5);
  const everyone = can.manageAnyBooking(user) ? (await load({ checkedInAt: null })).filter((b) => active(b) && b.userId !== user.id) : [];

  const list = (rows: Row[], showWho = false) => (
    <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
      {rows.map((b) => {
        const s = state(b, now);
        return (
          <li key={b.id} className="flex flex-wrap items-center gap-4 py-4">
            <EquipmentIcon type={b.equipment.type} className="size-10 text-rgu-purple shrink-0" />
            <div className="flex-1 min-w-52">
              <Link href={`/equipment/${b.equipmentId}`} className="font-extrabold hover:underline">
                {b.equipment.name}
              </Link>
              <p>
                {fmtWhen(b.start, now)}–{fmtTime(b.end)}
                {showWho && <> · {b.user.name}</>}
              </p>
              <p className={`text-sm font-semibold ${s.cls}`}>{s.text}</p>
            </div>
            <BookingActions booking={b} user={user} now={now} returnTo="/bookings" />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Notice ok={one(sp.ok)} error={one(sp.error)} />
      <h1 className="text-3xl font-extrabold uppercase">My bookings</h1>
      {current.length ? (
        list(current)
      ) : (
        <p className="mt-3">
          Nothing booked. <Link href="/" className="text-rgu-blue underline font-semibold">Find equipment</Link>
        </p>
      )}

      {everyone.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-extrabold uppercase">Everyone&apos;s active bookings</h2>
          <p className="text-sm text-neutral-700">Staff can check items in and cancel bookings for anyone.</p>
          {list(everyone, true)}
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-extrabold uppercase">Recent</h2>
          {list(past)}
        </section>
      )}
    </div>
  );
}
