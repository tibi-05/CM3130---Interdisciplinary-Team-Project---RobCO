import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDay, fmtWhen, londonToUtc } from "@/lib/time";
import { hours, problemsByUser, twinBalance, usageByItem, usesPerWeek } from "@/lib/usage";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Denied, PageHead } from "@/components/PageHead";

// Usage history (client: evidence for replacement funding, spreading wear across identical robots,
// knowing about late returns and missed bookings without a punitive process).
export default async function ReportsPage() {
  const user = await currentUser();
  const now = await requestNow();
  if (!can.viewReports(user)) return <Denied title="Reports">Switch to Staff or Admin in the header to see reports.</Denied>;

  const [equipment, bookings, users, faults] = await Promise.all([
    prisma.equipment.findMany(),
    prisma.booking.findMany({ where: { cancelledAt: null } }),
    prisma.user.findMany(),
    prisma.fault.findMany(),
  ]);
  const usage = usageByItem(bookings, now);
  const rows = equipment
    .map((e) => {
      const u = usage.get(e.id);
      const f = faults.filter((x) => x.equipmentId === e.id);
      return { e, uses: u?.uses ?? 0, minutes: u?.minutes ?? 0, late: u?.late ?? 0, lastUsed: u?.lastUsed ?? null, openFaults: f.filter((x) => !x.resolvedAt).length, faults: f.length };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const maxMinutes = Math.max(1, ...rows.map((r) => r.minutes));
  const weeks = usesPerWeek(bookings, now);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.uses));
  const twins = twinBalance(equipment, usage);
  const problems = problemsByUser(bookings, now);
  const name = new Map(users.map((u) => [u.id, u]));
  const totalHours = hours(rows.reduce((s, r) => s + r.minutes, 0));
  const totalUses = rows.reduce((s, r) => s + r.uses, 0);

  return (
    <>
      <PageHead
        title="Reports"
        sub={`How the lab's equipment is used. All recorded history, as of ${fmtWhen(now, now)}.`}
        aside={
          <a href="/reports/usage.csv" className="btn" download>
            Download usage (CSV)
          </a>
        }
      >
        <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Uses recorded", String(totalUses)],
            ["Hours in use", String(totalHours)],
            ["Open faults", String(faults.filter((f) => !f.resolvedAt).length)],
            ["Late returns", String(rows.reduce((s, r) => s + r.late, 0))],
          ].map(([k, v]) => (
            <div key={k} className="border-t-4 border-rgu-purple bg-paper px-4 py-3">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-4xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </PageHead>

      <div className="mx-auto max-w-6xl px-4">
        {/* ---- Uses per week ---- */}
        <section className="pt-8" aria-labelledby="weekly">
          <h2 id="weekly" className="section-title">
            Uses per week
          </h2>
          <p className="mt-1 text-sm text-muted">Each time an item was collected, all equipment, last {weeks.length} weeks.</p>
          <div
            className="mt-6 flex h-52 items-end gap-2 border-b-2 border-ink"
            role="img"
            aria-label="Bar chart of uses per week; the same numbers are in the table below."
          >
            {weeks.map((w) => (
              <div key={w.monday} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                <span className="mb-1 text-center text-sm font-semibold tabular-nums">{w.uses || ""}</span>
                <div
                  className="w-full max-w-12 bg-rgu-purple transition-colors group-hover:bg-rgu-purple-dark"
                  style={{ height: `${(w.uses / maxWeek) * 85}%`, minHeight: w.uses ? 4 : 0 }}
                />
                <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap bg-ink px-2 py-1 text-xs text-on-brand group-hover:block">
                  Week of {fmtDay(londonToUtc(w.monday, "12:00"))}: {w.uses} uses
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2 text-xs text-muted" aria-hidden="true">
            {weeks.map((w) => (
              <span key={w.monday} className="flex-1 text-center">
                {fmtDay(londonToUtc(w.monday, "12:00")).replace(/^\w+ /, "")}
              </span>
            ))}
          </div>
          <details className="mt-4 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-rgu-blue underline underline-offset-4">Show as a table</summary>
            <table className="mt-2 text-sm tabular-nums">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th scope="col" className="py-1 pr-6">Week of</th>
                  <th scope="col" className="py-1 text-right">Uses</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.monday} className="border-b border-rule">
                    <td className="py-1 pr-6">{fmtDay(londonToUtc(w.monday, "12:00"))}</td>
                    <td className="py-1 text-right">{w.uses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        {/* ---- Per item ---- */}
        <section className="mt-12 border-t border-rule pt-8" aria-labelledby="per-item">
          <h2 id="per-item" className="section-title">
            By item, most used first
          </h2>
          <p className="mt-1 text-sm text-muted">Evidence for replacement requests: how much each robot is relied on.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm tabular-nums">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th scope="col" className="py-2 pr-3">Item</th>
                  <th scope="col" className="py-2 pr-3">Asset</th>
                  <th scope="col" className="py-2 pr-3 w-1/3">Hours in use</th>
                  <th scope="col" className="py-2 pr-3 text-right">Uses</th>
                  <th scope="col" className="py-2 pr-3 text-right">Late</th>
                  <th scope="col" className="py-2 pr-3">Faults (open)</th>
                  <th scope="col" className="py-2">Last used</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.e.id} className="border-b border-rule">
                    <td className="py-2 pr-3">
                      <Link href={`/equipment/${r.e.id}`} className="flex items-center gap-2 font-semibold underline-offset-4 hover:underline">
                        <EquipmentIcon type={r.e.type} className="size-6 shrink-0 text-rgu-purple" />
                        {r.e.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-mono">{r.e.assetId ?? "–"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 bg-rgu-purple" style={{ width: `${(r.minutes / maxMinutes) * 100}%`, minWidth: r.minutes ? 2 : 0 }} aria-hidden="true" />
                        <span className="whitespace-nowrap font-semibold">{hours(r.minutes)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">{r.uses}</td>
                    <td className="py-2 pr-3 text-right">{r.late}</td>
                    <td className="py-2 pr-3">
                      {r.faults} {r.openFaults > 0 && <span className="font-semibold text-overdue">({r.openFaults} open)</span>}
                    </td>
                    <td className="py-2">{r.lastUsed ? fmtWhen(r.lastUsed, now) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-12 grid gap-10 border-t border-rule pt-8 md:grid-cols-2">
          {/* ---- Identical robots ---- */}
          <section aria-labelledby="twins">
            <h2 id="twins" className="section-title">
              Identical robots
            </h2>
            <p className="mt-1 text-sm text-muted">Spread the wear: suggest the least-used unit next.</p>
            {twins.length === 0 ? (
              <p className="mt-3">No items share an asset ID.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {twins.map((g) => (
                  <li key={g.assetId} className="panel">
                    <p className="font-mono text-sm text-muted">{g.assetId}</p>
                    <ul className="mt-1 divide-y divide-rule">
                      {g.units.map((u) => (
                        <li key={u.item.id} className="flex justify-between gap-3 py-1">
                          <span>{u.item.name}</span>
                          <span className="font-semibold tabular-nums">{hours(u.minutes)} h</span>
                        </li>
                      ))}
                    </ul>
                    {g.suggest && (
                      <p className="mt-2 border-l-4 border-free bg-free-bg px-2 py-1 font-semibold text-free">Suggest next: {g.suggest.name}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- People ---- */}
          <section aria-labelledby="problems">
            <h2 id="problems" className="section-title">
              Late returns and missed bookings
            </h2>
            <p className="mt-1 text-sm text-muted">For spotting repeated problems early. Nothing here is a penalty.</p>
            {problems.length === 0 ? (
              <p className="mt-3">None recorded.</p>
            ) : (
              <table className="mt-4 w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th scope="col" className="py-2 pr-3">Person</th>
                    <th scope="col" className="py-2 pr-3 text-right">Late returns</th>
                    <th scope="col" className="py-2 text-right">Missed bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.userId} className="border-b border-rule">
                      <td className="py-2 pr-3">
                        {name.get(p.userId)?.name}
                        {name.get(p.userId)?.studentId && <span className="block text-muted">ID {name.get(p.userId)?.studentId}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{p.late}</td>
                      <td className="py-2 text-right">{p.noShows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
