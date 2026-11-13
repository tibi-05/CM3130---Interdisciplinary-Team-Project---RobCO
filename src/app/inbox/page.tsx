import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { fmtWhen } from "@/lib/time";
import { markAllRead } from "@/app/actions";
import { Notice, one } from "@/components/Notice";
import { PageHead } from "@/components/PageHead";

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
    <>
      <PageHead
        title="Inbox"
        sub={`Reminders and alerts for ${user.name} (${user.email}). In the live system these are also emailed.`}
        aside={
          unread > 0 && (
            <form action={markAllRead}>
              <input type="hidden" name="returnTo" value="/inbox" />
              <button className="btn">Mark all as read</button>
            </form>
          )
        }
      />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-3xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />
          {notes.length === 0 ? (
            <p>Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {notes.map((n) => (
                <li key={n.id} className={`py-4 pr-2 ${n.readAt ? "pl-4" : "border-l-4 border-l-rgu-purple pl-3"}`}>
                  <h2 className={`text-lg leading-snug ${n.readAt ? "font-semibold" : "font-extrabold"}`}>{n.subject}</h2>
                  <ul className="meta mt-0.5 text-sm">
                    <li className={n.readAt ? "text-muted" : "font-semibold"}>{KIND_LABEL[n.kind] ?? n.kind}</li>
                    <li className="text-muted tabular-nums">
                      <time dateTime={n.createdAt.toISOString()}>{fmtWhen(n.createdAt, now)}</time>
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </li>
                  </ul>
                  <p className="mt-1">{n.body}</p>
                  {n.link && (
                    <Link href={n.link} className="link mt-1 inline-flex min-h-11 items-center">
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
