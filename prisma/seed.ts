import { PrismaClient } from "@prisma/client";
import { londonDate, londonParts, londonToUtc } from "../src/lib/time";
import { INVENTORY, isPlaceholder, toUnits } from "./inventory";

// Statuses are set relative to "now" so every badge shows; calendar bookings go on the coming lab days.
// Re-run `npm run demo:reset` shortly before a demo.
const prisma = new PrismaClient();
const SLOT = 30 * 60_000;
const t0 = Math.floor(Date.now() / SLOT) * SLOT;
const at = (mins: number) => new Date(t0 + mins * 60_000);

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

  // Real inventory (prisma/inventory.ts). The scorpion James mentioned isn't on the sheet yet,
  // so the out-of-service example is the dSPACE rig until the sheet is confirmed.
  const units: Awaited<ReturnType<typeof prisma.equipment.create>>[] = [];
  for (const u of toUnits(INVENTORY)) {
    units.push(
      await prisma.equipment.create({
        data: {
          name: u.name,
          type: u.type,
          location: u.location,
          assetId: u.assetId,
          manufacturer: u.manufacturer,
          model: isPlaceholder(u.model) ? null : u.model,
          serialNumber: u.serialNumber ?? null,
          condition: u.condition,
          notes: u.notes ?? null,
          ...(u.assetId === "ROB-003" ? { outOfService: true, outOfServiceReason: "Model and serial number still to be confirmed with James." } : {}),
        },
      }),
    );
  }
  const by = (name: string) => {
    const e = units.find((u) => u.name === name);
    if (!e) throw new Error(`seed: no unit named ${name}`);
    return e;
  };
  const go2a = by("Unitree Go2 #1");
  const go2b = by("Unitree Go2 #2");
  const go1 = by("Unitree Go1");
  const arm = by("Mitsubishi Movemaster EX");
  const cobot = by("Universal Robots");
  const pepper = by("SoftBank Robotics Pepper");
  const nao1 = by("SoftBank Robotics NAO #1");

  const b = (equipmentId: number, userId: number, start: number, end: number, extra: object = {}) =>
    prisma.booking.create({ data: { equipmentId, userId, start: at(start), end: at(end), ...extra } });

  await b(arm.id, alex.id, -60, 90, { checkedOutAt: at(-55) }); // in use
  await b(go2a.id, priya.id, -180, -30, { checkedOutAt: at(-175) }); // overdue
  await b(go2b.id, sam.id, -15, 75); // booked, not collected yet
  await b(nao1.id, alex.id, -30, 60, { checkedOutAt: at(-30) }); // walk-up, in use
  await b(arm.id, alex.id, -24 * 60, -22 * 60, { checkedOutAt: at(-24 * 60), checkedInAt: at(-22 * 60 - 10) }); // history

  // Upcoming bookings in lab hours, so the week calendar and "Next booking" have something to show.
  const [d1, d2, d3] = labDays(3);
  const lab = (equipmentId: number, userId: number, day: string, from: string, to: string) =>
    prisma.booking.create({ data: { equipmentId, userId, start: londonToUtc(day, from), end: londonToUtc(day, to) } });
  await lab(cobot.id, priya.id, d1, "15:00", "17:00");
  await lab(pepper.id, alex.id, d1, "13:00", "15:00");
  await lab(go2b.id, alex.id, d2, "10:00", "12:00");
  await lab(arm.id, sam.id, d2, "14:00", "16:00");
  await lab(go1.id, alex.id, d3, "09:30", "11:00");
}

main().finally(() => prisma.$disconnect());
