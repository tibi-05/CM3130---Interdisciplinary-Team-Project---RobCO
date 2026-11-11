"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, isRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { checkOutBlocker, findClash, validateRange } from "@/lib/booking";
import { LAB } from "@/lib/config";
import { fmtDay, fmtTime, londonDate, parseLondon, weekOffset } from "@/lib/time";
import { safePath } from "@/lib/paths";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** A record id from the form; anything that isn't a whole number goes back as an error. */
function id(f: FormData, k: string): number {
  const n = Number(f.get(k));
  if (!Number.isInteger(n) || n <= 0) done(f, "error", "Something went wrong with that form. Please try again.");
  return n;
}

/** Back to where the form was (never off-site), with a message the page shows. */
function done(f: FormData, key: "ok" | "error", message: string, set: Record<string, string> = {}): never {
  const to = safePath(str(f, "returnTo"));
  to.searchParams.delete("ok");
  to.searchParams.delete("error");
  for (const [k, v] of Object.entries(set)) to.searchParams.set(k, v);
  to.searchParams.set(key, message);
  revalidatePath("/", "layout");
  redirect(to.pathname + to.search);
}

export async function setRole(f: FormData) {
  const role = str(f, "role");
  if (isRole(role)) (await cookies()).set("role", role, { sameSite: "lax", path: "/" });
  // Stay on the same page, filters and week included, minus any old message.
  let path = "/";
  try {
    const ref = new URL((await headers()).get("referer") ?? "");
    path = ref.pathname + ref.search;
  } catch {}
  const to = safePath(path);
  to.searchParams.delete("ok");
  to.searchParams.delete("error");
  redirect(to.pathname.startsWith("/admin") && role !== "ADMIN" ? "/" : to.pathname + to.search);
}

async function bookRange(f: FormData, start: Date, end: Date, walkUp: boolean) {
  const user = await currentUser();
  const equipmentId = id(f, "equipmentId");
  const now = new Date();

  const invalid = validateRange(start, end, now, { walkUp });
  if (invalid) done(f, "error", invalid);

  // Check and insert together so two people can't take the same slot at once.
  const result = await prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) return "That equipment no longer exists.";
    if (equipment.outOfService) return `${equipment.name} is out of service.`;
    const existing = await tx.booking.findMany({ where: { equipmentId, cancelledAt: null }, include: { user: true } });
    const clash = findClash(start, end, existing, now);
    if (clash) return `Clashes with ${clash.user.name}'s booking, ${fmtTime(clash.start)}–${fmtTime(clash.end)}.`;
    await tx.booking.create({
      data: { equipmentId, userId: user.id, start, end, checkedOutAt: walkUp ? now : null },
    });
    return null;
  });
  if (result) done(f, "error", result);
}

export async function book(f: FormData) {
  const date = str(f, "date");
  const start = parseLondon(date, str(f, "start"));
  const end = parseLondon(date, str(f, "end"));
  if (!start || !end) done(f, "error", "Please choose a valid date and times.");
  await bookRange(f, start, end, false);
  // Open the calendar on the booked week so the person sees it there.
  const week = weekOffset(new Date(), start);
  done(f, "ok", `Booked ${fmtDay(start)}, ${fmtTime(start)}–${fmtTime(end)}.`, { week: String(week) });
}

export async function walkUp(f: FormData) {
  const now = new Date();
  const end = parseLondon(londonDate(now), str(f, "backBy"));
  if (!end) done(f, "error", "Please choose a valid return time.");
  await bookRange(f, now, end, true);
  done(f, "ok", `Checked out. Please return it by ${fmtTime(end)}.`);
}

async function ownBooking(f: FormData) {
  const user = await currentUser();
  const booking = await prisma.booking.findUnique({ where: { id: id(f, "bookingId") }, include: { equipment: true } });
  if (!booking || booking.cancelledAt) done(f, "error", "That booking no longer exists.");
  if (!can.actOnBooking(user, booking)) done(f, "error", "You can only change your own bookings.");
  return booking;
}

export async function checkOut(f: FormData) {
  const b = await ownBooking(f);
  const now = new Date();
  if (b.checkedOutAt) done(f, "error", "Already checked out.");
  if (b.equipment.outOfService) done(f, "error", `${b.equipment.name} is out of service.`);
  if (now.getTime() < b.start.getTime() - LAB.checkOutEarlyMinutes * 60_000)
    done(f, "error", `You can collect it from ${LAB.checkOutEarlyMinutes} minutes before the booking starts.`);
  if (now >= b.end) done(f, "error", "This booking has already ended.");
  // Nobody else may still have it (e.g. the previous person is overdue).
  const blocked = await prisma.$transaction(async (tx) => {
    const others = await tx.booking.findMany({ where: { equipmentId: b.equipmentId, id: { not: b.id } }, include: { user: true } });
    const reason = checkOutBlocker(others);
    if (!reason) await tx.booking.update({ where: { id: b.id }, data: { checkedOutAt: now } });
    return reason;
  });
  if (blocked) done(f, "error", blocked);
  done(f, "ok", `${b.equipment.name} checked out until ${fmtTime(b.end)}.`);
}

export async function checkIn(f: FormData) {
  const b = await ownBooking(f);
  if (!b.checkedOutAt || b.checkedInAt) done(f, "error", "This item isn't checked out.");
  await prisma.booking.update({ where: { id: b.id }, data: { checkedInAt: new Date() } });
  done(f, "ok", `${b.equipment.name} checked in. Thanks!`);
}

export async function cancel(f: FormData) {
  const b = await ownBooking(f);
  if (b.checkedOutAt) done(f, "error", "This item is already checked out. Check it in instead.");
  await prisma.booking.update({ where: { id: b.id }, data: { cancelledAt: new Date() } });
  done(f, "ok", "Booking cancelled.");
}

async function adminOnly(f: FormData) {
  if (!can.manageEquipment(await currentUser())) done(f, "error", "Only admins can change equipment.");
}

export async function setOutOfService(f: FormData) {
  await adminOnly(f);
  const out = str(f, "out") === "1";
  await prisma.equipment.update({
    where: { id: id(f, "equipmentId") },
    data: { outOfService: out, outOfServiceReason: out ? str(f, "reason") || null : null },
  });
  done(f, "ok", out ? "Marked out of service." : "Back in service.");
}

export async function addEquipment(f: FormData) {
  await adminOnly(f);
  const name = str(f, "name");
  const type = str(f, "type");
  if (!name || !type) done(f, "error", "Name and type are required.");
  const opt = (k: string) => str(f, k) || null;
  await prisma.equipment.create({
    data: {
      name,
      type,
      location: str(f, "location") || LAB.location,
      assetId: opt("assetId"),
      manufacturer: opt("manufacturer"),
      model: opt("model"),
      serialNumber: opt("serialNumber"),
      condition: opt("condition"),
      notes: opt("notes"),
    },
  });
  done(f, "ok", `${name} added.`);
}
