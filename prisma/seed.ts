import { PrismaClient } from "@prisma/client";

// Demo data relative to "now", so every status shows on screen. Re-run `npm run db:reset` before a demo.
const prisma = new PrismaClient();
const SLOT = 30 * 60_000;
const t0 = Math.floor(Date.now() / SLOT) * SLOT;
const at = (mins: number) => new Date(t0 + mins * 60_000);
const EXAMPLE = "Example item: replace with the lab's real inventory.";

async function main() {
  await prisma.booking.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.user.deleteMany();

  const [alex, priya, sam] = await Promise.all([
    prisma.user.create({ data: { name: "Alex Morgan", email: "a.morgan@rgu.ac.uk", role: "STUDENT" } }),
    prisma.user.create({ data: { name: "Priya Shah", email: "p.shah@rgu.ac.uk", role: "STUDENT" } }),
    prisma.user.create({ data: { name: "Sam Reid", email: "s.reid@rgu.ac.uk", role: "STAFF" } }),
    prisma.user.create({ data: { name: "Jordan Kerr", email: "j.kerr@rgu.ac.uk", role: "ADMIN" } }),
  ]);

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
  await b(armB.id, priya.id, 120, 240); // free, booked later
  await b(dog1.id, priya.id, -180, -30, { checkedOutAt: at(-175) }); // overdue
  await b(dog2.id, sam.id, -15, 75); // booked, not collected yet
  await b(printer.id, alex.id, 60, 180); // free, next booking soon
  await b(pi.id, alex.id, -30, 60, { checkedOutAt: at(-30) }); // walk-up, in use
  await b(armA.id, alex.id, -24 * 60, -22 * 60, { checkedOutAt: at(-24 * 60), checkedInAt: at(-22 * 60 - 10) }); // history
  await b(dog2.id, alex.id, 24 * 60, 24 * 60 + 120); // tomorrow
}

main().finally(() => prisma.$disconnect());
