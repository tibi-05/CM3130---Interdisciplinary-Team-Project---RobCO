import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { LAB } from "@/lib/config";
import { effectiveEnd, overlaps, statusOf } from "@/lib/booking";
import { fmtDay, fmtTime, fmtWhen, londonDate, londonParts, londonToUtc, minutesOfDay, slotTimes, toHHMM, workWeek } from "@/lib/time";
import { book, walkUp } from "@/app/actions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingActions } from "@/components/BookingActions";
import { Notice, one } from "@/components/Notice";

const isLabDay = (d: Date) => (LAB.workDays as readonly number[]).includes(londonParts(d).weekday);

/** Today if the lab still has time left, else the next working day. */
function defaultBookingDate(now: Date) {
  let d = now;
  if (minutesOfDay(d) >= LAB.closeMinutes - LAB.slotMinutes) d = new Date(d.getTime() + 86_400_000);
  while (!isLabDay(d)) d = new Date(d.getTime() + 86_400_000);
  return londonDate(d);
}

export default async function EquipmentPage({ params, searchParams }: PageProps<"/equipment/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const week = Math.max(-4, Math.min(8, Number(one(sp.week)) || 0));
  const now = await requestNow();
  const user = await currentUser();

  const e = await prisma.equipment.findUnique({
    where: { id: Number(id) },
    include: { bookings: { where: { cancelledAt: null }, include: { user: true }, orderBy: { start: "asc" } } },
  });
  if (!e) notFound();

  const status = statusOf(e, e.bookings, now);
  const returnTo = `/equipment/${e.id}${week ? `?week=${week}` : ""}`;
  const slots = slotTimes();
  const days = workWeek(now, week);
  const upcoming = e.bookings.filter((b) => !b.checkedInAt && effectiveEnd(b, now) > now);

  // Walk-up: free now, lab open, "back by" choices run up to the next booking or closing time.
  const nowMin = minutesOfDay(now);
  const nextStart = status.kind === "free" && status.nextStart && londonDate(status.nextStart) === londonDate(now) ? minutesOfDay(status.nextStart) : LAB.closeMinutes;
  const backBy = slots.filter((t) => {
    const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return m > nowMin && m <= nextStart && m - nowMin <= LAB.maxBookingMinutes;
  });
  const canWalkUp = status.kind === "free" && isLabDay(now) && nowMin >= LAB.openMinutes && backBy.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-rgu-blue underline font-semibold">
        ← All equipment
      </Link>
      <div className="mt-4">
        <Notice ok={one(sp.ok)} error={one(sp.error)} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <EquipmentIcon type={e.type} className="size-24 text-rgu-purple" />
        <div className="flex-1 min-w-60">
          <h1 className="text-3xl font-extrabold">{e.name}</h1>
          <p className="text-neutral-700">
            {e.type} · {e.location}
          </p>
          <div className="mt-3">
            <StatusBadge status={status} now={now} />
          </div>
          {status.kind === "out" && status.reason && <p className="mt-2">{status.reason}</p>}
          {(status.kind === "in-use" || status.kind === "overdue" || status.kind === "booked") && (
            <p className="mt-2">
              {status.kind === "booked" ? "Reserved for" : "With"} {status.booking.user.name}
            </p>
          )}
          {e.notes && <p className="mt-2 text-sm text-neutral-700 italic">{e.notes}</p>}
        </div>
      </div>

      {e.outOfService ? null : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <form action={book} className="border border-neutral-300 p-5">
            <h2 className="text-xl font-extrabold uppercase">Book a time</h2>
            <input type="hidden" name="equipmentId" value={e.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="mt-4 flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 font-semibold">
                Date
                <input type="date" name="date" required defaultValue={defaultBookingDate(now)} min={londonDate(now)} className="field" />
              </label>
              <label className="flex flex-col gap-1 font-semibold">
                From
                <select name="start" className="field" defaultValue="10:00">
                  {slots.slice(0, -1).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-semibold">
                Until
                <select name="end" className="field" defaultValue="11:00">
                  {slots.slice(1).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-sm text-neutral-700">
              Lab hours {toHHMM(LAB.openMinutes)}–{toHHMM(LAB.closeMinutes)}, Monday to Friday, up to {LAB.maxBookingMinutes / 60} hours.
            </p>
            <button className="btn mt-4">Book</button>
          </form>

          <form action={walkUp} className="border border-neutral-300 p-5 bg-rgu-panel/40">
            <h2 className="text-xl font-extrabold uppercase">Take it now</h2>
            <input type="hidden" name="equipmentId" value={e.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            {canWalkUp ? (
              <>
                <label className="mt-4 flex flex-col gap-1 font-semibold w-fit">
                  Back by
                  <select name="backBy" className="field">
                    {backBy.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <button className="btn mt-4">Check out now</button>
              </>
            ) : (
              <p className="mt-4">
                {status.kind !== "free" ? "Not free right now." : "Walk-up checkout is only available during lab hours."}
              </p>
            )}
          </form>
        </div>
      )}

      <section className="mt-10" aria-labelledby="week">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="week" className="text-xl font-extrabold uppercase">
            Week of {fmtDay(londonToUtc(days[0], "12:00"))}
          </h2>
          <div className="flex gap-2">
            <Link className="btn btn-light" href={`/equipment/${e.id}?week=${week - 1}`}>
              ← Previous
            </Link>
            {week !== 0 && (
              <Link className="btn btn-light" href={`/equipment/${e.id}`}>
                This week
              </Link>
            )}
            <Link className="btn btn-light" href={`/equipment/${e.id}?week=${week + 1}`}>
              Next →
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Legend className="bg-booked-bg border-booked" label="Booked" />
          <Legend className="bg-inuse-bg border-inuse" label="Checked out" />
          <Legend className="bg-overdue-bg border-overdue" label="Overdue" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm table-fixed">
            <thead>
              <tr>
                <th className="w-16" />
                {days.map((d) => (
                  <th key={d} scope="col" className={`p-2 text-left font-extrabold ${d === londonDate(now) ? "text-rgu-purple" : ""}`}>
                    {fmtDay(londonToUtc(d, "12:00"))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.slice(0, -1).map((t) => (
                <tr key={t}>
                  <th scope="row" className="pr-2 text-right font-semibold text-neutral-700 align-top">
                    {t.endsWith(":00") ? t : ""}
                  </th>
                  {days.map((d) => {
                    const start = londonToUtc(d, t);
                    const end = new Date(start.getTime() + LAB.slotMinutes * 60_000);
                    const b = e.bookings.find((x) => overlaps(start, end, x.start, effectiveEnd(x, now)));
                    const past = end <= now;
                    const tone = !b
                      ? "border-neutral-200"
                      : b.checkedOutAt && !b.checkedInAt && now > b.end
                        ? "bg-overdue-bg border-overdue"
                        : b.checkedOutAt
                          ? "bg-inuse-bg border-inuse"
                          : "bg-booked-bg border-booked";
                    const first = b && start <= b.start ? true : b && t === slots[0];
                    return (
                      <td
                        key={d}
                        className={`h-7 border-l-4 border-b border-b-white px-1 ${tone} ${past ? "opacity-50" : ""}`}
                        title={b ? `${b.user.name}, ${fmtTime(b.start)}–${fmtTime(b.end)}` : `${t} free`}
                      >
                        {b && first && <span className="font-semibold truncate block">{b.user.name.split(" ")[0]}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="upcoming">
        <h2 id="upcoming" className="text-xl font-extrabold uppercase">
          Current and upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3">No bookings yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-semibold">
                    {fmtWhen(b.start, now)}–{fmtTime(b.end)}
                  </span>{" "}
                  · {b.user.name}
                  {b.checkedOutAt && <span className="text-inuse font-semibold"> · checked out</span>}
                </span>
                <BookingActions booking={b} user={user} now={now} returnTo={returnTo} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block size-4 border-l-4 ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
