import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { LAB } from "@/lib/config";
import { effectiveEnd, holdsSlot, isActive, overlaps, statusOf } from "@/lib/booking";
import { fmtDay, fmtWhen, londonDate, londonParts, londonToUtc, minutesOfDay, slotTimes, toHHMM, workWeek } from "@/lib/time";
import { BATTERY, CONDITIONS, needsCharge } from "@/lib/handover";
import { isLate } from "@/lib/usage";
import { book, reportFault, resolveFault, toggleWatch, walkUp } from "@/app/actions";
import { can } from "@/lib/permissions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingActions } from "@/components/BookingActions";
import { Notice, one } from "@/components/Notice";
import { SelectField, TextArea, TextField } from "@/components/Field";
import { BackLink, Chevron, PageHead } from "@/components/PageHead";
import { Form } from "@/components/Form";

const isLabDay = (d: Date) => (LAB.workDays as readonly number[]).includes(londonParts(d).weekday);

/** Today if the lab still has time left, else the next working day. */
function defaultBookingDate(now: Date) {
  let d = now;
  if (minutesOfDay(d) >= LAB.closeMinutes - LAB.slotMinutes) d = new Date(d.getTime() + 86_400_000);
  while (!isLabDay(d)) d = new Date(d.getTime() + 86_400_000);
  return londonDate(d);
}

const PENDING_STRIPES = { backgroundImage: "repeating-linear-gradient(135deg, var(--color-booked-bg) 0 6px, var(--color-paper) 6px 12px)" };

export default async function EquipmentPage({ params, searchParams }: PageProps<"/equipment/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const week = Math.max(-4, Math.min(LAB.maxWeeksAhead, Math.trunc(Number(one(sp.week))) || 0));
  const now = await requestNow();
  const user = await currentUser();

  if (!/^\d+$/.test(id)) notFound();
  const e = await prisma.equipment.findUnique({
    where: { id: Number(id) },
    include: {
      bookings: { where: { cancelledAt: null }, include: { user: true }, orderBy: { start: "asc" } },
      faults: { include: { reporter: true }, orderBy: { createdAt: "desc" } },
      watches: { where: { userId: user.id } },
    },
  });
  if (!e) notFound();

  const live = e.bookings.filter(holdsSlot);
  const status = statusOf(e, live, now);
  const returnTo = `/equipment/${e.id}${week ? `?week=${week}` : ""}`;
  const slots = slotTimes();
  const days = workWeek(now, week);
  const upcoming = live.filter((b) => isActive(b, now));
  const openFaults = e.faults.filter((f) => !f.resolvedAt);
  const returned = e.bookings.filter((b) => b.checkedInAt).sort((a, b) => +b.checkedInAt! - +a.checkedInAt!);
  const lastReturn = returned[0];
  const watching = e.watches.length > 0;

  // Booking form defaults: the next free slot today (not one already past), else 10:00.
  const bookDate = defaultBookingDate(now);
  const nextSlot = Math.ceil((minutesOfDay(now) + 1) / LAB.slotMinutes) * LAB.slotMinutes;
  const defStart = bookDate === londonDate(now) && nextSlot > 10 * 60 ? Math.min(nextSlot, LAB.closeMinutes - LAB.slotMinutes) : 10 * 60;
  const defEnd = Math.min(defStart + 60, LAB.closeMinutes);

  // Walk-up: free now, lab open, "back by" choices run up to the next booking or closing time.
  const nowMin = minutesOfDay(now);
  const nextStart = status.kind === "free" && status.nextStart && londonDate(status.nextStart) === londonDate(now) ? minutesOfDay(status.nextStart) : LAB.closeMinutes;
  const backBy = slots.filter((t) => {
    const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return m > nowMin && m <= nextStart && m - nowMin <= LAB.maxBookingMinutes;
  });
  const canWalkUp = status.kind === "free" && isLabDay(now) && nowMin >= LAB.openMinutes && backBy.length > 0;
  const holder = status.kind === "in-use" || status.kind === "overdue" || status.kind === "booked" ? status.booking : null;

  return (
    <>
      <PageHead
        back={<BackLink href="/">All equipment</BackLink>}
        title={e.name}
        sub={
          <ul className="meta text-base">
            <li>{e.type}</li>
            <li>Kept in {e.location}</li>
          </ul>
        }
        aside={
          e.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-entered URL, any host
            <img src={e.photoUrl} alt={`Photo of ${e.name}`} className="size-28 object-cover border border-rule bg-paper" />
          ) : (
            <span className="hidden bg-paper p-3 sm:block">
              <EquipmentIcon type={e.type} className="size-20 text-rgu-purple" />
            </span>
          )
        }
      />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Notice ok={one(sp.ok)} error={one(sp.error)} />

        {/* ---- Status, then what the next person must know, then safety: all before booking ---- */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-6">
            <div>
              <StatusBadge status={status} now={now} size="lg" />
              {status.kind === "out" && status.reason && <p className="mt-2">{status.reason}</p>}
              {holder && (
                <ul className="meta mt-2">
                  <li>
                    {status.kind === "booked" ? "Reserved for" : "With"} {holder.user.name}
                  </li>
                  {holder.useLocation && <li>Taken to {holder.useLocation}</li>}
                </ul>
              )}
              {e.notes && <p className="mt-2 text-sm text-muted">{e.notes}</p>}
              {status.kind !== "free" && status.kind !== "out" && holder?.userId !== user.id && (
                <form action={toggleWatch} className="mt-3">
                  <input type="hidden" name="equipmentId" value={e.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button className="btn btn-light">{watching ? "Stop notifying me" : "Notify me when it's free"}</button>
                </form>
              )}
            </div>

            {(openFaults.length > 0 || (lastReturn && (needsCharge(lastReturn.batteryIn) || lastReturn.conditionIn !== "Good"))) && (
              <section aria-labelledby="heads-up" className="border-l-4 border-inuse bg-inuse-bg px-5 py-4">
                <h2 id="heads-up" className="text-lg font-extrabold uppercase">
                  Before you use it
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {lastReturn && needsCharge(lastReturn.batteryIn) && (
                    <li>
                      Battery was <strong>{lastReturn.batteryIn?.toLowerCase()}</strong> when last returned ({fmtWhen(lastReturn.checkedInAt!, now)}). Check it
                      is charged before your session.
                    </li>
                  )}
                  {lastReturn && lastReturn.conditionIn && lastReturn.conditionIn !== "Good" && !openFaults.some((f) => f.bookingId === lastReturn.id) && (
                    <li>Last returned as: {lastReturn.conditionIn.toLowerCase()}.</li>
                  )}
                  {openFaults.map((f) => (
                    <li key={f.id}>
                      Open fault{f.severity === "UNUSABLE" ? " (out of service)" : ""}: {f.description}{" "}
                      <span className="text-sm">({fmtDay(f.createdAt)})</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ---- Safety (client: "particularly important") ---- */}
            <section aria-labelledby="safety" className="border-2 border-rgu-purple bg-paper-2">
              <h2 id="safety" className="angled inline-block bg-rgu-purple py-2 pl-5 pr-12 text-lg font-extrabold uppercase text-on-brand">
                Safety
              </h2>
              {e.safetyInfo ? (
                <div className="space-y-2 whitespace-pre-line px-5 pt-3 pb-5">{e.safetyInfo}</div>
              ) : (
                <p className="px-5 pt-3 pb-5">No safety information has been added yet. Ask lab staff before using this item.</p>
              )}
            </section>
          </div>

          <dl className="grid content-start grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 self-start border border-rule border-t-4 border-t-rgu-purple p-5 text-sm">
            <dt className="font-semibold">Asset ID</dt>
            <dd className="font-mono">{e.assetId ?? "Not recorded"}</dd>
            <dt className="font-semibold">Manufacturer</dt>
            <dd>{e.manufacturer ?? "Not recorded"}</dd>
            <dt className="font-semibold">Model</dt>
            <dd>{e.model ?? "Not recorded"}</dd>
            <dt className="font-semibold">Serial no.</dt>
            <dd>{e.serialNumber ?? "Not recorded"}</dd>
            <dt className="font-semibold">Condition</dt>
            <dd>{e.condition ?? "Not recorded"}</dd>
            <dt className="font-semibold">Manual</dt>
            <dd>
              {e.manualUrl ? (
                <a href={e.manualUrl} className="link" target="_blank" rel="noopener noreferrer">
                  Open manual<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                "Not added yet"
              )}
            </dd>
          </dl>
        </div>

        {/* ---- Booking ---- */}
        {e.outOfService ? null : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Form action={book} className="panel">
              <h2 className="section-title">Book a time</h2>
              <input type="hidden" name="equipmentId" value={e.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="mt-4 flex flex-wrap gap-4">
                <TextField label="Date" type="date" name="date" required defaultValue={bookDate} min={londonDate(now)} />
                <SelectField label="From" name="start" options={slots.slice(0, -1)} defaultValue={toHHMM(defStart)} />
                <SelectField label="Until" name="end" options={slots.slice(1)} defaultValue={toHHMM(defEnd)} />
              </div>
              <div className="mt-4 grid gap-4">
                <TextField label="What is it for?" name="purpose" required maxLength={120} placeholder="e.g. CM2100 coursework practical" />
                <TextField
                  label="Where will you use it? (optional)"
                  name="useLocation"
                  maxLength={120}
                  placeholder="Leave empty if staying in the lab"
                  hint="Taking it out of the lab, e.g. to room 2249 or around campus, needs staff approval."
                />
              </div>
              <p className="mt-4 text-sm text-muted">
                Lab hours {toHHMM(LAB.openMinutes)} to {toHHMM(LAB.closeMinutes)}, Monday to Friday. Bookings up to {LAB.maxBookingMinutes / 60} hours in
                the lab are confirmed straight away.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <button className="btn">Book</button>
                <Link href={`/equipment/${e.id}/request`} className="link inline-flex min-h-11 items-center">
                  Need it for longer or several days?
                </Link>
              </div>
            </Form>

            <Form action={walkUp} className="panel bg-rgu-panel/40">
              <h2 className="section-title">Take it now</h2>
              <input type="hidden" name="equipmentId" value={e.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              {canWalkUp ? (
                <>
                  <p className="mt-2 text-sm">For use in the lab only. Record the condition as you pick it up.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <SelectField label="Back by" name="backBy" options={backBy} />
                    <TextField label="What is it for?" name="purpose" required maxLength={120} />
                    <SelectField label="Condition now" name="conditionOut" options={CONDITIONS.slice(0, 2)} />
                    <SelectField label="Battery now" name="batteryOut" options={BATTERY} />
                    <TextField className="sm:col-span-2" label="Anything not right? (optional)" name="note" maxLength={300} />
                  </div>
                  <button className="btn mt-4">Check out now</button>
                </>
              ) : (
                <p className="mt-4">{status.kind !== "free" ? "Not free right now." : "Walk-up checkout is only available during lab hours."}</p>
              )}
            </Form>
          </div>
        )}

        {/* ---- Week calendar ---- */}
        <section className="mt-12 border-t border-rule pt-8" aria-labelledby="week">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="week" className="section-title">
              Week of {fmtDay(londonToUtc(days[0], "12:00"))}
            </h2>
            <div className="flex flex-wrap gap-2">
              <WeekLink id={e.id} week={week - 1} disabled={week <= -4} dir="left">
                Previous<span className="sr-only"> week</span>
              </WeekLink>
              {week !== 0 && (
                <Link className="btn btn-light" href={`/equipment/${e.id}`}>
                  This week
                </Link>
              )}
              <WeekLink id={e.id} week={week + 1} disabled={week >= LAB.maxWeeksAhead} dir="right">
                Next<span className="sr-only"> week</span>
              </WeekLink>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Legend className="bg-booked-bg border-booked" label="Booked" />
            <Legend className="border-booked" style={PENDING_STRIPES} label="Awaiting approval" />
            <Legend className="bg-inuse-bg border-inuse" label="Checked out" />
            <Legend className="bg-overdue-bg border-overdue" label="Overdue" />
          </div>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm table-fixed tabular-nums">
              <thead>
                <tr>
                  <th className="w-16" />
                  {days.map((d) => {
                    const today = d === londonDate(now);
                    return (
                      <th
                        key={d}
                        scope="col"
                        className={`border-b-4 p-2 text-left font-extrabold ${today ? "border-rgu-purple text-rgu-purple" : "border-transparent"}`}
                      >
                        {fmtDay(londonToUtc(d, "12:00"))}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {slots.slice(0, -1).map((t) => (
                  <tr key={t} className={t.endsWith(":00") ? "border-t border-rule" : undefined}>
                    <th scope="row" className="pr-2 text-right font-semibold text-muted align-top">
                      {t.endsWith(":00") ? t : ""}
                    </th>
                    {days.map((d) => {
                      const start = londonToUtc(d, t);
                      const end = new Date(start.getTime() + LAB.slotMinutes * 60_000);
                      const b = live.find((x) => overlaps(start, end, x.start, effectiveEnd(x, now)));
                      const past = end <= now;
                      const pending = b?.approval === "PENDING";
                      const tone = !b
                        ? "border-rule"
                        : b.checkedOutAt && !b.checkedInAt && now > b.end
                          ? "bg-overdue-bg border-overdue"
                          : b.checkedOutAt
                            ? "bg-inuse-bg border-inuse"
                            : pending
                              ? "border-booked"
                              : "bg-booked-bg border-booked";
                      const first = b && (start <= b.start || t === slots[0]);
                      const word = !b ? "free" : pending ? "awaiting approval for" : b.checkedOutAt ? "checked out by" : "booked by";
                      return (
                        <td
                          key={d}
                          className={`h-7 border-l-4 border-b border-b-paper px-1 ${tone} ${past ? "opacity-50" : ""}`}
                          style={pending ? PENDING_STRIPES : undefined}
                          title={b ? `${b.user.name}, ${fmtWhen(b.start, now)} to ${fmtWhen(b.end, b.start)}${pending ? " (awaiting approval)" : ""}` : `${t} free`}
                        >
                          {b && first && (
                            <span className="font-semibold truncate block" aria-hidden="true">
                              {b.user.name.split(" ")[0]}
                            </span>
                          )}
                          {/* Words, not just colour, for screen readers in every cell */}
                          <span className="sr-only">{b ? `${t} ${word} ${b.user.name}` : `${t} free`}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Current and upcoming bookings ---- */}
        <section className="mt-12 border-t border-rule pt-8" aria-labelledby="upcoming">
          <h2 id="upcoming" className="section-title">
            Current and upcoming
          </h2>
          {upcoming.length === 0 ? (
            <p className="mt-3">No bookings yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {upcoming.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">
                      {fmtWhen(b.start, now)} to {fmtWhen(b.end, b.start)}
                    </p>
                    <ul className="meta text-sm">
                      <li>{b.user.name}</li>
                      {b.purpose && <li>{b.purpose}</li>}
                      {b.useLocation && <li>At {b.useLocation}</li>}
                    </ul>
                    {b.approval === "PENDING" && <p className="text-sm font-semibold text-booked">Awaiting approval</p>}
                    {b.checkedOutAt && now > b.end && <p className="text-sm font-semibold text-overdue">Overdue</p>}
                    {b.checkedOutAt && now <= b.end && <p className="text-sm font-semibold text-inuse">Checked out</p>}
                    {e.outOfService && !b.checkedOutAt && <p className="text-sm font-semibold text-overdue">Affected: item out of service</p>}
                  </div>
                  <BookingActions booking={b} user={user} now={now} returnTo={returnTo} itemOutOfService={e.outOfService} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Faults ---- */}
        <section className="mt-12 grid gap-6 border-t border-rule pt-8 md:grid-cols-2" aria-labelledby="faults">
          <div>
            <h2 id="faults" className="section-title">
              Faults and maintenance
            </h2>
            {e.faults.length === 0 ? (
              <p className="mt-3">No faults reported.</p>
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {e.faults.slice(0, 8).map((f) => (
                  <li key={f.id} className="py-3">
                    <p className={`text-sm font-semibold ${f.resolvedAt ? "text-free" : f.severity === "UNUSABLE" ? "text-overdue" : "text-inuse"}`}>
                      {f.resolvedAt ? "Resolved" : f.severity === "UNUSABLE" ? "Open, out of service" : "Open"}
                    </p>
                    <p>{f.description}</p>
                    <p className="text-sm text-muted">
                      Reported {fmtDay(f.createdAt)} by {f.reporter.name}
                      {f.resolvedAt && (
                        <>
                          . Fixed {fmtDay(f.resolvedAt)}
                          {f.resolution ? `: ${f.resolution}` : ""}
                        </>
                      )}
                    </p>
                    {!f.resolvedAt && can.resolveFaults(user) && (
                      <Form action={resolveFault} className="mt-3 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="faultId" value={f.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <TextField label="What was done" name="resolution" maxLength={300} className="min-w-48 flex-1 text-sm" />
                        {e.outOfService && f.severity === "UNUSABLE" && (e.outOfServiceReason ?? "").startsWith("Fault reported: ") && (
                          <label className="option text-sm">
                            <input type="checkbox" name="backInService" value="1" defaultChecked /> Back in service
                          </label>
                        )}
                        <button className="btn">Resolve</button>
                      </Form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Form action={reportFault} className="panel self-start">
            <h3 className="text-lg font-extrabold uppercase">Report a fault</h3>
            <input type="hidden" name="equipmentId" value={e.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="mt-3 grid gap-4">
              <TextArea label="What's wrong?" name="description" required minLength={5} maxLength={500} />
              <fieldset className="grid gap-2">
                <legend className="mb-1 font-semibold">Can it still be used?</legend>
                <label className="option">
                  <input type="radio" name="severity" value="MINOR" defaultChecked /> Yes, with care
                </label>
                <label className="option">
                  <input type="radio" name="severity" value="UNUSABLE" /> No, take it out of service
                </label>
              </fieldset>
            </div>
            <button className="btn mt-4">Report fault</button>
          </Form>
        </section>

        {/* ---- Usage history (client: condition before and after use) ---- */}
        <section className="mt-12 border-t border-rule pt-8" aria-labelledby="history">
          <h2 id="history" className="section-title">
            Recent use
          </h2>
          {returned.length === 0 ? (
            <p className="mt-3">Not used yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th scope="col" className="py-2 pr-3">Returned</th>
                    <th scope="col" className="py-2 pr-3">By</th>
                    <th scope="col" className="py-2 pr-3">Condition out → in</th>
                    <th scope="col" className="py-2 pr-3">Battery out → in</th>
                    <th scope="col" className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {returned.slice(0, 8).map((b) => (
                    <tr key={b.id} className="border-b border-rule align-top">
                      <td className="py-2 pr-3">
                        {fmtWhen(b.checkedInAt!, now)}
                        {isLate(b, now) && <span className="block font-semibold text-overdue">Late</span>}
                      </td>
                      <td className="py-2 pr-3">{b.user.name}</td>
                      <td className="py-2 pr-3">
                        {b.conditionOut ?? "–"} → {b.conditionIn ?? "–"}
                      </td>
                      <td className={`py-2 pr-3 ${needsCharge(b.batteryIn) ? "font-semibold text-overdue" : ""}`}>
                        {b.batteryOut ?? "–"} → {b.batteryIn ?? "–"}
                      </td>
                      <td className="py-2">{b.returnNote ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function WeekLink({ id, week, disabled, dir, children }: { id: number; week: number; disabled: boolean; dir: "left" | "right"; children: React.ReactNode }) {
  const body = (
    <>
      {dir === "left" && <Chevron dir="left" />}
      {children}
      {dir === "right" && <Chevron dir="right" />}
    </>
  );
  return disabled ? (
    <span className="btn btn-light" aria-disabled="true">
      {body}
    </span>
  ) : (
    <Link className="btn btn-light" href={week ? `/equipment/${id}?week=${week}` : `/equipment/${id}`}>
      {body}
    </Link>
  );
}

function Legend({ className, label, style }: { className: string; label: string; style?: React.CSSProperties }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block size-4 border-l-4 ${className}`} style={style} aria-hidden="true" />
      {label}
    </span>
  );
}
