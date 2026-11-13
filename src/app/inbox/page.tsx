import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { fmtWhen } from "@/lib/time";
import { markAllRead } from "@/app/actions";
import { Notice, one } from "@/components/Notice";

const KIND_LABEL: Record<string, string> = {
  REMINDER: "Reminder",
  OVERDUE: "Overdue",
  OVERDUE_ADMIN: "Overdue",
  MISSED: "Missed booking",
  APPROVAL_NEEDED: "Needs approval",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  AVAILABLE: "Available",
  FAULT: "Fault",
  BATTERY: "Needs charging",
  LATE: "Late return",
};

// Every reminder and alert the system sends. In the prototype these are what would be emailed.
export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const user = await currentUser();
  const now = await requestNow();
  const notes = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Notice ok={one(sp.ok)} error={one(sp.error)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold uppercase">Inbox</h1>
          <p className="text-neutral-700">
            Reminders and alerts for {user.name} ({user.email}). In the live system these are also emailed.
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <input type="hidden" name="returnTo" value="/inbox" />
            <button className="btn btn-light">Mark all as read</button>
          </form>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="mt-6">Nothing yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
          {notes.map((n) => (
            <li key={n.id} className={`py-4 ${n.readAt ? "" : "border-l-4 border-rgu-purple pl-3"}`}>
              <p className="text-sm text-neutral-700">
                <span className="font-semibold text-black">{KIND_LABEL[n.kind] ?? n.kind}</span> · {fmtWhen(n.createdAt, now)}
                {!n.readAt && <span className="sr-only"> (unread)</span>}
              </p>
              <h2 className={n.readAt ? "font-semibold" : "font-extrabold"}>{n.subject}</h2>
              <p className="mt-1">{n.body}</p>
              {n.link && (
                <Link href={n.link} className="mt-1 inline-block text-rgu-blue underline font-semibold">
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
