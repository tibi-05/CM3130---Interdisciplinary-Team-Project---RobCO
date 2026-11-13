import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { syncNotifications } from "@/lib/notify";
import { currentUser, requestNow } from "@/lib/session";

// The header lives in the root layout, which Next.js doesn't re-render on client navigation.
// LiveCount calls this on every page change so the badges and time-based reminders stay current.
export async function GET() {
  const user = await currentUser();
  await syncNotifications(await requestNow());
  const [unread, pending] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    can.approveBookings(user) ? prisma.booking.count({ where: { approval: "PENDING", cancelledAt: null } }) : 0,
  ]);
  return Response.json({ unread, pending }, { headers: { "Cache-Control": "no-store" } });
}
