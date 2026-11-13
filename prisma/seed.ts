import { PrismaClient } from "@prisma/client";
import { londonDate, londonParts, londonToUtc } from "../src/lib/time";
import { INVENTORY, isPlaceholder, toUnits } from "./inventory";

// Demo data. Live statuses are set relative to "now" so every badge shows; upcoming bookings go on the
// coming lab days; eight weeks of past use feed the Reports page. Re-run `npm run demo:reset` before a demo.
const prisma = new PrismaClient();
const SLOT = 30 * 60_000;
const t0 = Math.floor(Date.now() / SLOT) * SLOT;
const at = (mins: number) => new Date(t0 + mins * 60_000);
const MIN = 60_000;

/** Lab days from today onwards (today counts if there's still time to book). */
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

/** The `n` lab days before today, most recent first. */
function pastLabDays(n: number): string[] {
  const out: string[] = [];
  let d = new Date(Date.now() - 86_400_000);
  while (out.length < n) {
    if (londonParts(d).weekday <= 5) out.push(londonDate(d));
    d = new Date(d.getTime() - 86_400_000);
  }
  return out;
}

// General precautions per type so the Safety section has content in the demo.
// They are NOT the lab's official guidance: replace them via Admin → Edit once James provides it.
const EXAMPLE = "Example text: replace with the lab's official safety guidance.";
const SAFETY: Record<string, string> = {
  "Quadruped Robot":
    "Clear at least 2 m around the robot before it stands up. Keep hands and feet away from the legs while it is powered. Keep the remote in hand with the emergency stop ready. Do not lift it while the motors are on.",
  "Industrial Robot Arm":
    "Only use after a staff induction. Stay outside the arm's reach while it moves and keep the emergency stop within reach. Power down before changing tools.",
  "Collaborative Robot Arm":
    "Check the safety settings before each session. Keep the emergency stop within reach. Clamp the base and check end-effectors are secure before running a program.",
  "Humanoid Robot":
    "Place on a flat, clear surface away from table edges. Keep fingers clear of the joints. Put it in its safe resting position before switching off.",
  "Control System Rig": "Ask lab staff before connecting anything. Check the power supply and cabling are intact before switching on.",
};

async function main() {
  await prisma.notification.deleteMany();
  await prisma.watch.deleteMany();
  await prisma.fault.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.user.deleteMany();

  // One at a time so ids (and who each role switches to) stay predictable: Alex = Student.
  const user = (name: string, email: string, role: string, studentId: string, category: string) =>
    prisma.user.create({ data: { name, email, role, studentId, category } });
  const alex = await user("Alex Morgan", "a.morgan@rgu.ac.uk", "STUDENT", "2012345", "Undergraduate");
  const priya = await user("Priya Shah", "p.shah@rgu.ac.uk", "STUDENT", "1904567", "PhD");
  const sam = await user("Sam Reid", "s.reid@rgu.ac.uk", "STAFF", "S10221", "Technical staff");
  await user("Jordan Kerr", "j.kerr@rgu.ac.uk", "ADMIN", "S10007", "Academic staff");

  // Real inventory (prisma/inventory.ts). The dSPACE rig is the out-of-service example until its model is confirmed.
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
          safetyInfo: SAFETY[u.type] ? `${SAFETY[u.type]}\n\n${EXAMPLE}` : null,
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
  const nao2 = by("SoftBank Robotics NAO #2");

  // ---- Eight weeks of past use (Reports page). Go2 #1 and NAO #1 are used far more than their twins.
  const past = pastLabDays(38);
  const rota = [go2a, arm, pepper, go2a, nao1, cobot, go2a, nao1, arm, go1, go2a, pepper, nao1, arm, nao2, go2b];
  const people = [alex, priya, sam, priya, alex];
  for (let i = 4; i < past.length; i++) {
    for (const [slot, from, to] of [[0, "10:00", "12:00"], [1, "14:00", "16:30"]] as const) {
      if ((i + slot) % 3 === 2) continue; // not every slot is used
      const item = rota[(i * 2 + slot) % rota.length];
      const start = londonToUtc(past[i], from);
      const end = londonToUtc(past[i], to);
      await prisma.booking.create({
        data: {
          equipmentId: item.id,
          userId: people[(i + slot) % people.length].id,
          start,
          end,
          purpose: "Coursework practical",
          checkedOutAt: new Date(start.getTime() + 5 * MIN),
          checkedInAt: new Date(end.getTime() - 10 * MIN),
          conditionOut: "Good",
          batteryOut: "Full",
          conditionIn: "Good",
          batteryIn: i % 4 ? "Half" : "Low",
        },
      });
    }
  }
  // A late return and a missed booking, for the "repeated problems" review.
  const late = londonToUtc(past[2], "10:00");
  await prisma.booking.create({
    data: {
      equipmentId: go1.id, userId: priya.id, start: late, end: new Date(late.getTime() + 120 * MIN), purpose: "Honours project testing",
      useLocation: "Sir Ian Wood Building, room N520", approval: "APPROVED", reviewedById: sam.id, reviewedAt: late,
      checkedOutAt: new Date(late.getTime() + 5 * MIN), checkedInAt: new Date(late.getTime() + 170 * MIN),
      conditionOut: "Good", batteryOut: "Full", conditionIn: "Good", batteryIn: "Low",
    },
  });
  const missed = londonToUtc(past[3], "14:00");
  await prisma.booking.create({ data: { equipmentId: pepper.id, userId: alex.id, start: missed, end: new Date(missed.getTime() + 120 * MIN), purpose: "Demo practice" } });

  // Alex has booked Go2 #2 repeatedly over the last fortnight (fair-use flag on the Requests page).
  for (const k of [1, 3, 5]) {
    const s = londonToUtc(past[k], "13:00");
    await prisma.booking.create({
      data: {
        equipmentId: go2b.id, userId: alex.id, start: s, end: new Date(s.getTime() + 90 * MIN), purpose: "Gait experiments",
        checkedOutAt: s, checkedInAt: new Date(s.getTime() + 85 * MIN), conditionOut: "Good", batteryOut: "Full", conditionIn: "Good", batteryIn: "Half",
      },
    });
  }
  // NAO #2's last return: battery flat (the "dead batteries" problem James described).
  const flat = londonToUtc(past[0], "11:00");
  await prisma.booking.create({
    data: {
      equipmentId: nao2.id, userId: alex.id, start: flat, end: new Date(flat.getTime() + 60 * MIN), purpose: "Speech demo",
      checkedOutAt: flat, checkedInAt: new Date(flat.getTime() + 55 * MIN), conditionOut: "Good", batteryOut: "Half", conditionIn: "Good", batteryIn: "Flat",
      returnNote: "Battery ran out near the end of the session.",
    },
  });

  // ---- Faults: one open on Go2 #1, one resolved last month on Pepper.
  await prisma.fault.create({
    data: { equipmentId: go2a.id, reporterId: priya.id, description: "Rear left leg makes a grinding noise when walking on carpet.", severity: "MINOR", createdAt: londonToUtc(past[1], "15:30") },
  });
  await prisma.fault.create({
    data: {
      equipmentId: pepper.id, reporterId: alex.id, description: "Tablet screen does not respond to touch.", severity: "UNUSABLE",
      createdAt: londonToUtc(past[20], "11:00"), resolvedAt: londonToUtc(past[18], "16:00"), resolvedById: sam.id, resolution: "Restarted the tablet and updated its software.",
    },
  });

  // ---- Live statuses relative to now.
  const b = (equipmentId: number, userId: number, start: number, end: number, extra: object = {}) =>
    prisma.booking.create({ data: { equipmentId, userId, start: at(start), end: at(end), purpose: "Lab session", ...extra } });
  await b(arm.id, alex.id, -60, 90, { checkedOutAt: at(-55), conditionOut: "Good", batteryOut: "No battery" }); // in use
  await b(go2a.id, priya.id, -180, -30, { checkedOutAt: at(-175), conditionOut: "Good", batteryOut: "Full", useLocation: "Garthdee campus grounds (demo filming)", reviewedById: sam.id, reviewedAt: at(-1440) }); // overdue, outside the lab
  await b(go2b.id, sam.id, -15, 75); // booked, not collected yet
  await b(nao1.id, alex.id, -30, 60, { checkedOutAt: at(-30), conditionOut: "Good", batteryOut: "Full" }); // walk-up, in use

  // ---- Upcoming bookings in lab hours (week calendar, "Next booking", reminders).
  const days = labDays(12);
  const [d1, d2, d3] = days;
  const lab = (equipmentId: number, userId: number, day: string, from: string, to: string, extra: object = {}) =>
    prisma.booking.create({ data: { equipmentId, userId, start: londonToUtc(day, from), end: londonToUtc(day, to), purpose: "Lab session", ...extra } });
  await lab(cobot.id, priya.id, d1, "15:00", "17:00");
  await lab(pepper.id, alex.id, d1, "13:00", "15:00");
  await lab(go2b.id, alex.id, d2, "10:00", "12:00", { purpose: "Gait experiments" });
  await lab(arm.id, sam.id, d2, "14:00", "16:00");
  await lab(go1.id, alex.id, d3, "09:30", "11:00");

  // ---- Waiting for staff approval: one taken out of the lab, one extended (multi-day) request.
  await lab(go1.id, alex.id, d2, "13:00", "15:00", {
    purpose: "Open day demonstration", useLocation: "Sir Ian Wood Building atrium", approval: "PENDING",
  });
  await prisma.booking.create({
    data: {
      equipmentId: go2b.id, userId: priya.id, start: londonToUtc(days[6], "09:00"), end: londonToUtc(days[10], "17:00"),
      purpose: "Honours project: terrain mapping", kind: "EXTENDED", approval: "PENDING",
      justification: "I need the same robot for five days to run my terrain-mapping trials without recalibrating between sessions.",
    },
  });

  // Priya is waiting for the Movemaster arm (notified when it's returned).
  await prisma.watch.create({ data: { equipmentId: arm.id, userId: priya.id } });
}

main().finally(() => prisma.$disconnect());
