import Link from "next/link";
import { requestNow } from "@/lib/session";
import { prisma } from "@/lib/db";
import { statusOf, type BookingLike, type Status, type StatusKind } from "@/lib/booking";
import { fmtWhen } from "@/lib/time";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { one } from "@/components/Notice";

const KINDS: StatusKind[] = ["free", "booked", "in-use", "overdue", "out"];

function detail(s: Status<BookingLike & { user: { name: string }; useLocation: string | null }>, now: Date) {
  switch (s.kind) {
    case "free":
      if (!s.next) return "No upcoming bookings";
      return `Next booking ${fmtWhen(s.next.start, now)}${s.next.approval === "PENDING" ? " (awaiting approval)" : ""}`;
    case "booked":
      return s.booking.approval === "PENDING"
        ? `Requested by ${s.booking.user.name}, awaiting approval`
        : `Reserved for ${s.booking.user.name}, not collected yet`;
    case "in-use":
      return `With ${s.booking.user.name}${s.booking.useLocation ? ` at ${s.booking.useLocation}` : ""}`;
    case "overdue":
      return `With ${s.booking.user.name}, not returned${s.booking.useLocation ? ` (taken to ${s.booking.useLocation})` : ""}`;
    case "out":
      return s.reason ?? "Not available";
  }
}

export default async function Board({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const type = one(sp.type);
  const kind = one(sp.status) as StatusKind | undefined;
  const now = await requestNow();

  const equipment = await prisma.equipment.findMany({
    include: { bookings: { where: { cancelledAt: null }, include: { user: true } } },
  });
  const all = equipment.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })).map((e) => ({ e, s: statusOf(e, e.bookings, now) }));
  const types = [...new Set(equipment.map((e) => e.type))].sort();
  const shown = all.filter((x) => (!type || x.e.type === type) && (!kind || x.s.kind === kind));
  const count = (k: StatusKind) => all.filter((x) => x.s.kind === k).length;

  const href = (next: { type?: string; status?: string }) => {
    const q = new URLSearchParams();
    const t = "type" in next ? next.type : type;
    const s = "status" in next ? next.status : kind;
    if (t) q.set("type", t);
    if (s) q.set("status", s);
    return q.size ? `/?${q}` : "/";
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 text-sm font-semibold border ${
      active ? "bg-rgu-purple text-white border-rgu-purple" : "border-neutral-400 hover:border-rgu-purple"
    }`;

  return (
    <>
      <section className="bg-rgu-panel">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-8">
          <div className="angled bg-rgu-purple-dark text-white inline-block pr-20 pl-6 py-5">
            <h1 className="text-3xl sm:text-4xl font-extrabold uppercase">Equipment</h1>
            <p className="mt-1 text-lg">What&apos;s free in the lab right now</p>
          </div>
          <ul aria-label="Equipment by status" className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-lg">
            {KINDS.map((k) => (
              <li key={k}>
                <Link href={href({ status: k })} className="flex gap-2 hover:underline underline-offset-4">
                  <span className="font-semibold">{STATUS_LABEL[k]}</span>
                  <span className="font-extrabold">{count(k)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          <Link href={href({ status: undefined })} className={chip(!kind)} aria-current={!kind ? "page" : undefined}>
            Any status
          </Link>
          {KINDS.map((k) => (
            <Link key={k} href={href({ status: k })} className={chip(kind === k)} aria-current={kind === k ? "page" : undefined}>
              {STATUS_LABEL[k]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter by type" className="mt-3 flex flex-wrap gap-2">
          <Link href={href({ type: undefined })} className={chip(!type)} aria-current={!type ? "page" : undefined}>
            All types
          </Link>
          {types.map((t) => (
            <Link key={t} href={href({ type: t })} className={chip(type === t)} aria-current={type === t ? "page" : undefined}>
              {t}
            </Link>
          ))}
        </nav>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ e, s }) => (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className="group flex h-full gap-4 border border-neutral-300 p-4 hover:border-rgu-purple hover:shadow-[4px_4px_0_var(--color-rgu-purple)] transition-shadow"
              >
                <EquipmentIcon type={e.type} className="size-14 shrink-0 text-rgu-purple" />
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold group-hover:underline">{e.name}</h2>
                  <p className="text-sm text-neutral-700">
                    {e.type} · {e.location}
                    {e.assetId && <span className="font-mono"> · {e.assetId}</span>}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={s} now={now} />
                  </div>
                  <p className="mt-1 text-sm">{detail(s, now)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="mt-8">Nothing matches these filters.</p>}
      </div>
    </>
  );
}
