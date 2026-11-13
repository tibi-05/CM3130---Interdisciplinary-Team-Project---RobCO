import Link from "next/link";
import { setRole } from "@/app/actions";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { syncNotifications } from "@/lib/notify";
import { currentUser, requestNow, ROLES } from "@/lib/session";

const LABEL = { STUDENT: "Student", STAFF: "Staff", ADMIN: "Admin" } as const;

function Count({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-block min-w-5 bg-white px-1.5 text-center text-xs font-extrabold leading-5 text-rgu-purple">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export async function Header() {
  const user = await currentUser();
  await syncNotifications(await requestNow()); // reminders are time-based; no background job in the prototype
  const [unread, pending] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    can.approveBookings(user) ? prisma.booking.count({ where: { approval: "PENDING", cancelledAt: null } }) : 0,
  ]);

  const nav = [
    { href: "/", label: "Equipment" },
    { href: "/bookings", label: "My bookings" },
    { href: "/inbox", label: "Inbox", count: unread, countLabel: "unread" },
    ...(can.approveBookings(user) ? [{ href: "/requests", label: "Requests", count: pending, countLabel: "waiting" }] : []),
    ...(can.viewReports(user) ? [{ href: "/reports", label: "Reports" }] : []),
    ...(can.manageEquipment(user) ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="bg-rgu-purple text-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link href="/" className="leading-none">
          <span className="block text-[0.7rem] font-extrabold tracking-[0.2em]">RGU</span>
          <span className="block text-xl font-extrabold uppercase">Robotics Lab</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-6 gap-y-2 font-semibold">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hover:underline underline-offset-4">
              {n.label}
              {"count" in n && <Count n={n.count ?? 0} label={n.countLabel ?? ""} />}
            </Link>
          ))}
        </nav>
        <form action={setRole} className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-90">Viewing as {user.name}</span>
          <div role="group" aria-label="Switch role (prototype)" className="flex border border-white/60">
            {ROLES.map((r) => (
              <button
                key={r}
                name="role"
                value={r}
                aria-pressed={user.role === r}
                className={`px-3 py-1.5 font-semibold cursor-pointer ${
                  user.role === r ? "bg-white text-rgu-purple" : "hover:bg-rgu-purple-dark"
                }`}
              >
                {LABEL[r]}
              </button>
            ))}
          </div>
        </form>
      </div>
    </header>
  );
}
