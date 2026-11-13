import Link from "next/link";
import { setRole } from "@/app/actions";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { syncNotifications } from "@/lib/notify";
import { currentUser, requestNow, ROLES } from "@/lib/session";
import { LiveCount } from "./LiveCount";
import { NavLink } from "./NavLink";

const LABEL = { STUDENT: "Student", STAFF: "Staff", ADMIN: "Admin" } as const;

export async function Header() {
  const user = await currentUser();
  await syncNotifications(await requestNow()); // reminders are time-based; LiveCount repeats this on client navigation
  const [unread, pending] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    can.approveBookings(user) ? prisma.booking.count({ where: { approval: "PENDING", cancelledAt: null } }) : 0,
  ]);

  const nav = [
    { href: "/", label: "Equipment" },
    { href: "/bookings", label: "My bookings" },
    { href: "/inbox", label: "Inbox", which: "unread" as const, count: unread, countLabel: "unread" },
    ...(can.approveBookings(user) ? [{ href: "/requests", label: "Requests", which: "pending" as const, count: pending, countLabel: "waiting" }] : []),
    ...(can.viewReports(user) ? [{ href: "/reports", label: "Reports" }] : []),
    ...(can.manageEquipment(user) ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="bg-rgu-purple text-on-brand">
      <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link href="/" className="wordmark flex min-h-11 flex-col justify-center py-1 leading-none">
          <span className="wordmark block text-[0.7rem] font-extrabold tracking-[0.2em]">RGU</span>
          <span className="wordmark block text-xl font-extrabold uppercase">Robotics Lab</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-5 font-semibold">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
              {"which" in n && n.which && <LiveCount key={n.count} which={n.which} initial={n.count ?? 0} label={n.countLabel ?? ""} />}
            </NavLink>
          ))}
        </nav>
        <form action={setRole} className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm">
          <span>Viewing as {user.name}</span>
          <div role="group" aria-label="Switch role (prototype)" className="flex border border-on-brand/70">
            {ROLES.map((r) => (
              <button
                key={r}
                name="role"
                value={r}
                aria-pressed={user.role === r}
                className={`min-h-10 px-3 font-semibold cursor-pointer ${
                  user.role === r ? "bg-on-brand text-rgu-purple" : "hover:bg-rgu-purple-dark"
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
