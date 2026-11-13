import Link from "next/link";
import { requestNow } from "@/lib/session";
import { prisma } from "@/lib/db";
import { statusOf, type BookingLike, type Status, type StatusKind } from "@/lib/booking";
import { fmtWhen } from "@/lib/time";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { one } from "@/components/Notice";
import { PageHead } from "@/components/PageHead";

const KINDS: StatusKind[] = ["free", "booked", "in-use", "overdue", "out"];

// Status edge on each tally tile: the word is always beside the colour.
const TALLY: Record<StatusKind, string> = {
  free: "border-free",
  booked: "border-booked",
  "in-use": "border-inuse",
  overdue: "border-overdue",
  out: "border-out",
};

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

  return (
    <>
      <PageHead title="Equipment" sub="What's free in the lab right now">
        <ul aria-label="Equipment by status" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {KINDS.map((k) => (
            <li key={k} className={k === "out" ? "col-span-2 sm:col-span-1" : undefined}>
              <Link
                href={href({ status: k })}
                className={`group flex h-full min-h-11 items-center justify-between gap-3 border-t-4 bg-paper px-3 py-2 hover:shadow-lift sm:flex-col sm:items-start sm:justify-start sm:gap-0 ${TALLY[k]}`}
              >
                <span className="font-semibold group-hover:underline underline-offset-4">{STATUS_LABEL[k]}</span>
                <span className="text-2xl font-extrabold tabular-nums leading-none sm:mt-1 sm:text-4xl">{count(k)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageHead>

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="grid gap-3 border-b border-rule pb-6">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            <Link href={href({ status: undefined })} className="chip" aria-current={!kind ? "page" : undefined}>
              Any status
            </Link>
            {KINDS.map((k) => (
              <Link key={k} href={href({ status: k })} className="chip" aria-current={kind === k ? "page" : undefined}>
                {STATUS_LABEL[k]}
              </Link>
            ))}
          </nav>
          <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
            <Link href={href({ type: undefined })} className="chip" aria-current={!type ? "page" : undefined}>
              All types
            </Link>
            {types.map((t) => (
              <Link key={t} href={href({ type: t })} className="chip" aria-current={type === t ? "page" : undefined}>
                {t}
              </Link>
            ))}
          </nav>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ e, s }) => (
            <li key={e.id}>
              <Link
                href={`/equipment/${e.id}`}
                className="group flex h-full flex-col border border-rule bg-paper hover:border-rgu-purple hover:shadow-lift"
              >
                <div className="flex gap-4 p-4">
                  <EquipmentIcon type={e.type} className="size-14 shrink-0 text-rgu-purple" />
                  <div className="min-w-0">
                    <h2 className="text-lg leading-tight font-extrabold group-hover:underline underline-offset-4">{e.name}</h2>
                    <p className="mt-1 text-sm text-muted">{e.type}</p>
                    <ul className="meta text-sm text-muted">
                      <li>{e.location}</li>
                      {e.assetId && <li className="font-mono">{e.assetId}</li>}
                    </ul>
                  </div>
                </div>
                <div className="mt-auto border-t border-rule px-4 py-3">
                  <StatusBadge status={s} now={now} />
                  <p className="mt-1.5 text-sm">{detail(s, now)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="mt-6 border-l-4 border-rule bg-paper-3 px-4 py-3">
            Nothing matches these filters.
          </p>
        )}
      </div>
    </>
  );
}
