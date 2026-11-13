import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { approvalReasons, findClash, repeatedBookings } from "@/lib/booking";
import { LAB } from "@/lib/config";
import { fmtWhen } from "@/lib/time";
import { review } from "@/app/actions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";
import { TextField } from "@/components/Field";
import { Denied, PageHead } from "@/components/PageHead";

// Staff: approve or decline requests (client: approval for kit leaving the lab and for long bookings),
// and see fair-use flags (repeated bookings by one person), which never block anyone.
export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const user = await currentUser();
  const now = await requestNow();
  if (!can.approveBookings(user)) return <Denied title="Requests">Switch to Staff or Admin in the header to review requests.</Denied>;

  const window = LAB.repeatWindowDays * 86_400_000;
  const [pending, recent, items, users] = await Promise.all([
    prisma.booking.findMany({ where: { approval: "PENDING", cancelledAt: null }, include: { equipment: true, user: true }, orderBy: { start: "asc" } }),
    prisma.booking.findMany({ where: { cancelledAt: null, start: { gte: new Date(now.getTime() - window), lte: new Date(now.getTime() + window) } } }),
    prisma.equipment.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true, studentId: true, category: true } }),
  ]);
  const others = await prisma.booking.findMany({
    where: { cancelledAt: null, approval: "APPROVED", equipmentId: { in: pending.map((p) => p.equipmentId) } },
    include: { user: true },
  });
  const flags = repeatedBookings(recent, now);
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const person = new Map(users.map((u) => [u.id, u]));
  const flagged = new Set(flags.map((f) => `${f.userId}:${f.equipmentId}`));

  return (
    <>
      <PageHead
        title="Requests"
        sub={`Bookings that leave the lab or run longer than ${LAB.maxBookingMinutes / 60} hours wait here for approval. The item is held while you decide.`}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-5xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />

          {pending.length === 0 ? (
            <p>Nothing waiting for approval.</p>
          ) : (
            <ul className="space-y-4">
              {pending.map((b) => {
                const clash = findClash(b.start, b.end, others.filter((o) => o.id !== b.id), now);
                const who = person.get(b.userId);
                return (
                  <li key={b.id} className="panel sm:p-6">
                    <div className="flex flex-wrap items-start gap-4">
                      <EquipmentIcon type={b.equipment.type} className="size-12 shrink-0 text-rgu-purple" />
                      <div className="min-w-0 flex-1 basis-60">
                        <h2 className="text-xl font-extrabold">
                          <Link href={`/equipment/${b.equipmentId}`} className="underline-offset-4 hover:underline">
                            {b.equipment.name}
                          </Link>
                        </h2>
                        <p className="tabular-nums">
                          <span className="font-semibold">{fmtWhen(b.start, now)}</span> to <span className="font-semibold">{fmtWhen(b.end, b.start)}</span>
                        </p>
                        <ul className="meta">
                          <li>{b.user.name}</li>
                          {who?.category && <li>{who.category}</li>}
                          {who?.studentId && <li>ID {who.studentId}</li>}
                        </ul>
                        {b.purpose && <p className="mt-2">For: {b.purpose}</p>}
                        {b.justification && <p className="mt-2 border-l-4 border-rgu-panel pl-3">“{b.justification}”</p>}
                        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                          {approvalReasons(b).map((r) => (
                            <li key={r} className="border-l-4 border-booked bg-booked-bg px-2 py-1 font-semibold text-booked">
                              {r}
                            </li>
                          ))}
                          {flagged.has(`${b.userId}:${b.equipmentId}`) && (
                            <li className="border-l-4 border-inuse bg-inuse-bg px-2 py-1 font-semibold text-inuse">Books this item often</li>
                          )}
                          {clash && (
                            <li className="border-l-4 border-overdue bg-overdue-bg px-2 py-1 font-semibold text-overdue">
                              Overlaps {clash.user.name}&apos;s booking
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                    <form action={review} className="mt-5 flex flex-wrap items-end gap-3 border-t border-rule pt-5">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <input type="hidden" name="returnTo" value="/requests" />
                      <TextField label="Note to the student (optional)" name="note" maxLength={300} className="min-w-64 flex-1" />
                      <div className="flex flex-wrap gap-2">
                        <button className="btn" name="decision" value="approve">
                          Approve
                        </button>
                        <button className="btn btn-light" name="decision" value="reject">
                          Decline
                        </button>
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="mt-12 border-t border-rule pt-8" aria-labelledby="fair-use">
            <h2 id="fair-use" className="section-title">
              Fair use
            </h2>
            <p className="mt-1 text-sm text-muted">
              People with {LAB.repeatFlagCount} or more bookings of the same item within {LAB.repeatWindowDays} days either side of today. A prompt to
              check in with them, not a restriction: honours and research projects often need repeated access.
            </p>
            {flags.length === 0 ? (
              <p className="mt-3">No one is above the threshold.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th scope="col" className="py-2 pr-3">Person</th>
                    <th scope="col" className="py-2 pr-3">Item</th>
                    <th scope="col" className="py-2 text-right">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={`${f.userId}:${f.equipmentId}`} className="border-b border-rule">
                      <td className="py-2 pr-3">
                        {person.get(f.userId)?.name}
                        {person.get(f.userId)?.studentId && <span className="block text-muted">ID {person.get(f.userId)?.studentId}</span>}
                      </td>
                      <td className="py-2 pr-3">{itemName.get(f.equipmentId)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{f.count}</td>
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
