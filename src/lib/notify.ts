// Reminders and alerts (client: reminders for upcoming bookings and overdue returns, alerts to James,
// and "tell me when it's free"). Each one is stored once (unique key) and shown in the person's inbox.
import { prisma } from "./db";
import { LAB } from "./config";
import { fmtWhen } from "./time";

type Note = { userId: number; kind: string; subject: string; body: string; link?: string; key: string };

/**
 * Hook for real email. The prototype has no university mail server, so messages only appear in the
 * in-app inbox. To send them: look up the user's email and call the mail service here.
 */
async function deliver(note: Note) {
  void note; // e.g. await mailer.send({ to: user.email, subject: note.subject, text: note.body })
}

/** Store (and deliver) a notification unless one with the same key already exists. */
export async function notify(n: Note) {
  const exists = await prisma.notification.findUnique({ where: { key: n.key }, select: { id: true } });
  if (exists) return;
  try {
    await prisma.notification.create({ data: { ...n, link: n.link ?? null } });
  } catch {
    return; // created by a parallel request in the meantime
  }
  await deliver(n);
}

const staffIds = async (roles: string[] = ["ADMIN"]) =>
  (await prisma.user.findMany({ where: { role: { in: roles } }, select: { id: true } })).map((u) => u.id);

/** Alert the lab admins (James's role in the system). */
export async function notifyAdmins(n: Omit<Note, "userId" | "key"> & { key: string }) {
  for (const id of await staffIds()) await notify({ ...n, userId: id, key: `${n.key}:${id}` });
}

/** Tell everyone waiting for this item that it is free again, then stop watching. */
export async function notifyWatchers(equipmentId: number) {
  const item = await prisma.equipment.findUnique({ where: { id: equipmentId }, include: { watches: true } });
  if (!item || item.outOfService) return;
  for (const w of item.watches) {
    await notify({
      userId: w.userId,
      kind: "AVAILABLE",
      subject: `${item.name} is available again`,
      body: `You asked to be told when ${item.name} became free. It can be booked now.`,
      link: `/equipment/${item.id}`,
      key: `available:${w.id}:${Date.now()}`,
    });
  }
  await prisma.watch.deleteMany({ where: { equipmentId } });
}

/**
 * Time-based reminders. There is no background job in the prototype, so this runs on page loads;
 * the unique keys make it safe to run as often as needed.
 */
export async function syncNotifications(now: Date) {
  const soon = new Date(now.getTime() + LAB.reminderHoursBefore * 3_600_000);
  const bookings = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      checkedInAt: null,
      OR: [
        { approval: "APPROVED", checkedOutAt: null, start: { gt: now, lte: soon } }, // upcoming
        { checkedOutAt: { not: null }, end: { lt: now } }, // overdue
        { approval: "APPROVED", checkedOutAt: null, end: { lt: now, gt: new Date(now.getTime() - 7 * 86_400_000) } }, // missed
        { approval: "PENDING" },
      ],
    },
    include: { equipment: true, user: true },
  });
  const staff = await staffIds(["STAFF", "ADMIN"]);

  for (const b of bookings) {
    const link = `/equipment/${b.equipmentId}`;
    if (b.approval === "PENDING") {
      for (const id of staff)
        await notify({
          userId: id,
          kind: "APPROVAL_NEEDED",
          subject: `Request to approve: ${b.equipment.name}`,
          body: `${b.user.name} asked for ${b.equipment.name}, ${fmtWhen(b.start, now)} to ${fmtWhen(b.end, now)}.`,
          link: "/requests",
          key: `pending:${b.id}:${id}`,
        });
    } else if (b.checkedOutAt && b.end < now) {
      await notify({
        userId: b.userId,
        kind: "OVERDUE",
        subject: `Please return ${b.equipment.name}`,
        body: `${b.equipment.name} was due back at ${fmtWhen(b.end, now)}. Please return it to the lab and check it in.`,
        link: "/bookings",
        key: `overdue:${b.id}`,
      });
      await notifyAdmins({
        kind: "OVERDUE_ADMIN",
        subject: `Overdue: ${b.equipment.name}`,
        body: `${b.user.name}${b.user.studentId ? ` (ID ${b.user.studentId})` : ""} has not returned ${b.equipment.name}, due ${fmtWhen(b.end, now)}${b.useLocation ? `. It was taken to ${b.useLocation}` : ""}.`,
        link: "/bookings",
        key: `overdue-admin:${b.id}`,
      });
    } else if (!b.checkedOutAt && b.end < now) {
      await notifyAdmins({
        kind: "MISSED",
        subject: `Missed booking: ${b.equipment.name}`,
        body: `${b.user.name} did not collect ${b.equipment.name} for their booking ending ${fmtWhen(b.end, now)}.`,
        link: "/reports",
        key: `missed:${b.id}`,
      });
    } else if (!b.checkedOutAt) {
      await notify({
        userId: b.userId,
        kind: "REMINDER",
        subject: `Reminder: ${b.equipment.name} ${fmtWhen(b.start, now)}`,
        body: `Your booking of ${b.equipment.name} starts ${fmtWhen(b.start, now)}. Collect it from ${b.equipment.location} and check it out in the app.`,
        link,
        key: `upcoming:${b.id}`,
      });
    }
  }
}
