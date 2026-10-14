import { PrismaClient } from "@prisma/client";
import { londonDate, londonParts, londonToUtc } from "../src/lib/time";

// Statuses are set relative to "now" so every badge shows; calendar bookings go on the coming lab days.
// Re-run `npm run demo:reset` shortly before a demo.
const prisma = new PrismaClient();
const SLOT = 30 * 60_000;
const t0 = Math.floor(Date.now() / SLOT) * SLOT;
const at = (mins: number) => new Date(t0 + mins * 60_000);
const EXAMPLE = "Example item: replace with the lab's real inventory.";

/** The next `n` lab days (today counts if there's still time to book). */
function labDays(n: number): string[] {
  const out: string[] = [];
  let d = new Date();
  if (londonParts(d).hour >= 12) d = new Date(d.getTime() + 86_400_000);
  while (out.length < n) {
    if (londonParts(d).weekday <= 5) out.push(londonDate(d));
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

async function main() {
  await prisma.booking.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.user.deleteMany();

  // One at a time so ids (and who each role switches to) stay predictable: Alex = Student.
  const alex = await prisma.user.create({ data: { name: "Alex Morgan", email: "a.morgan@rgu.ac.uk", role: "STUDENT" } });
  const priya = await prisma.user.create({ data: { name: "Priya Shah", email: "p.shah@rgu.ac.uk", role: "STUDENT" } });
  const sam = await prisma.user.create({ data: { name: "Sam Reid", email: "s.reid@rgu.ac.uk", role: "STAFF" } });
  await prisma.user.create({ data: { name: "Jordan Kerr", email: "j.kerr@rgu.ac.uk", role: "ADMIN" } });

  const loc = "Lab 4-2-4";
  const eq = (name: string, type: string, extra: object = {}) =>
    prisma.equipment.create({ data: { name, type, location: loc, ...extra } });

  const armA = await eq("Robot arm A", "Robot arm");
  const armB = await eq("Robot arm B", "Robot arm");
  const dog1 = await eq("Robot dog 1", "Robot dog");
  const dog2 = await eq("Robot dog 2", "Robot dog");
  await eq("Robot scorpion", "Robot scorpion", {
    outOfService: true,
    outOfServiceReason: "Recently uncovered, being checked over before use.",
  });
  const printer = await eq("3D printer", "3D printer", { notes: EXAMPLE });
  await eq("LiDAR sensor", "LiDAR sensor", { notes: EXAMPLE });
  const pi = await eq("Raspberry Pi kit", "Microcontroller kit", { notes: EXAMPLE });
  await eq("Camera drone", "Drone", { notes: EXAMPLE });

  const b = (equipmentId: number, userId: number, start: number, end: number, extra: object = {}) =>
    prisma.booking.create({ data: { equipmentId, userId, start: at(start), end: at(end), ...extra } });

  await b(armA.id, alex.id, -60, 90, { checkedOutAt: at(-55) }); // in use
  await b(dog1.id, priya.id, -180, -30, { checkedOutAt: at(-175) }); // overdue
  await b(dog2.id, sam.id, -15, 75); // booked, not collected yet
  await b(pi.id, alex.id, -30, 60, { checkedOutAt: at(-30) }); // walk-up, in use
  await b(armA.id, alex.id, -24 * 60, -22 * 60, { checkedOutAt: at(-24 * 60), checkedInAt: at(-22 * 60 - 10) }); // history

  // Upcoming bookings in lab hours, so the week calendar and "Next booking" have something to show.
  const [d1, d2, d3] = labDays(3);
  const lab = (equipmentId: number, userId: number, day: string, from: string, to: string) =>
    prisma.booking.create({ data: { equipmentId, userId, start: londonToUtc(day, from), end: londonToUtc(day, to) } });
  await lab(armB.id, priya.id, d1, "15:00", "17:00");
  await lab(printer.id, alex.id, d1, "13:00", "15:00");
  await lab(dog2.id, alex.id, d2, "10:00", "12:00");
  await lab(armA.id, sam.id, d2, "14:00", "16:00");
  await lab(dog1.id, alex.id, d3, "09:30", "11:00");
}

main().finally(() => prisma.$disconnect());
