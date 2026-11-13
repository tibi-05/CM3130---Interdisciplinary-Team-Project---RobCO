"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser, isRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { approvalReasons, checkOutBlocker, findClash, statusOf, validateRange } from "@/lib/booking";
import { LAB } from "@/lib/config";
import { fmtDay, fmtTime, fmtWhen, londonDate, parseLondon, weekOffset } from "@/lib/time";
import { safePath } from "@/lib/paths";
import { isBattery, isCondition, needsCharge } from "@/lib/handover";
import { notify, notifyAdmins, notifyWatchers } from "@/lib/notify";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

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
  const staffOnly = ["/admin", "/requests", "/reports"].some((p) => to.pathname.startsWith(p));
  const allowed = role === "ADMIN" || (role === "STAFF" && !to.pathname.startsWith("/admin"));
  redirect(staffOnly && !allowed ? "/" : to.pathname + to.search);
}

/** If the item is free right now, tell the people waiting for it. */
async function afterFreed(equipmentId: number) {
  const item = await prisma.equipment.findUnique({ where: { id: equipmentId }, include: { bookings: true } });
  if (item && statusOf(item, item.bookings, new Date()).kind === "free") await notifyWatchers(equipmentId);
}

// ---------- Booking ----------

type NewBooking = { start: Date; end: Date; walkUp?: boolean; extended?: boolean };

/** Validates, checks clashes and creates the booking in one transaction. Returns the new booking's approval. */
async function createBooking(f: FormData, b: NewBooking) {
  const user = await currentUser();
  const equipmentId = id(f, "equipmentId");
  const now = new Date();
  const purpose = opt(f, "purpose");
  const useLocation = opt(f, "useLocation");
  const justification = opt(f, "justification");

  const invalid = validateRange(b.start, b.end, now, { walkUp: b.walkUp, extended: b.extended });
  if (invalid) done(f, "error", invalid);
  if (b.extended && !justification) done(f, "error", "Please explain why you need it for this long.");
  if (b.walkUp && useLocation) done(f, "error", "Taking an item out of the lab needs a booking that staff approve.");

  const kind = b.extended ? "EXTENDED" : "STANDARD";
  const reasons = approvalReasons({ start: b.start, end: b.end, useLocation, kind });
  const approval = reasons.length ? "PENDING" : "APPROVED";

  const result = await prisma.$transaction(async (tx) => {
    const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) return "That equipment no longer exists.";
    if (equipment.outOfService) return `${equipment.name} is out of service.`;
    const existing = await tx.booking.findMany({ where: { equipmentId, cancelledAt: null }, include: { user: true } });
    const clash = findClash(b.start, b.end, existing, now);
    if (clash) return `Clashes with ${clash.user.name}'s booking, ${fmtWhen(clash.start, now)}–${fmtWhen(clash.end, now)}.`;
    await tx.booking.create({
      data: {
        equipmentId,
        userId: user.id,
        start: b.start,
        end: b.end,
        purpose,
        useLocation,
        kind,
        justification,
        approval,
        checkedOutAt: b.walkUp ? now : null,
        conditionOut: b.walkUp ? opt(f, "conditionOut") : null,
        batteryOut: b.walkUp ? opt(f, "batteryOut") : null,
      },
    });
    return null;
  });
  if (result) done(f, "error", result);
  return { approval, reasons };
}

export async function book(f: FormData) {
  const date = str(f, "date");
  const start = parseLondon(date, str(f, "start"));
  const end = parseLondon(date, str(f, "end"));
  if (!start || !end) done(f, "error", "Please choose a valid date and times.");
  const { approval, reasons } = await createBooking(f, { start, end });
  const week = String(weekOffset(new Date(), start));
  const when = `${fmtDay(start)}, ${fmtTime(start)}–${fmtTime(end)}`;
  if (approval === "PENDING")
    done(f, "ok", `Request sent for ${when}. Staff will review it (${reasons.join("; ").toLowerCase()}).`, { week });
  done(f, "ok", `Booked ${when}.`, { week });
}

export async function requestExtended(f: FormData) {
  const start = parseLondon(str(f, "startDate"), str(f, "startTime"));
  const end = parseLondon(str(f, "endDate"), str(f, "endTime"));
  if (!start || !end) done(f, "error", "Please choose valid dates and times.");
  await createBooking(f, { start, end, extended: true });
  f.set("returnTo", `/equipment/${id(f, "equipmentId")}?week=${weekOffset(new Date(), start)}`);
  done(f, "ok", `Request sent: ${fmtDay(start)} ${fmtTime(start)} to ${fmtDay(end)} ${fmtTime(end)}. Staff will review it and you'll see the decision in your inbox.`);
}

export async function walkUp(f: FormData) {
  const now = new Date();
  const end = parseLondon(londonDate(now), str(f, "backBy"));
  if (!end) done(f, "error", "Please choose a valid return time.");
  const condition = str(f, "conditionOut");
  if (!isBattery(str(f, "batteryOut")) || (condition !== "Good" && condition !== "Minor issue"))
    done(f, "error", "Please record the condition and battery level. If it's damaged, report a fault instead.");
  await createBooking(f, { start: now, end, walkUp: true });
  done(f, "ok", `Checked out. Please return it by ${fmtTime(end)}.`);
}

async function ownBooking(f: FormData) {
  const user = await currentUser();
  const booking = await prisma.booking.findUnique({ where: { id: id(f, "bookingId") }, include: { equipment: true, user: true } });
  if (!booking || booking.cancelledAt) done(f, "error", "That booking no longer exists.");
  if (!can.actOnBooking(user, booking)) done(f, "error", "You can only change your own bookings.");
  return { user, booking };
}

export async function cancel(f: FormData) {
  const { booking: b } = await ownBooking(f);
  if (b.checkedOutAt) done(f, "error", "This item is already checked out. Check it in instead.");
  await prisma.booking.update({ where: { id: b.id }, data: { cancelledAt: new Date() } });
  await afterFreed(b.equipmentId);
  done(f, "ok", "Booking cancelled.");
}

export async function review(f: FormData) {
  const user = await currentUser();
  if (!can.approveBookings(user)) done(f, "error", "Only lab staff can approve requests.");
  const b = await prisma.booking.findUnique({ where: { id: id(f, "bookingId") }, include: { equipment: true } });
  if (!b || b.cancelledAt || b.approval !== "PENDING") done(f, "error", "That request has already been dealt with.");
  const approve = str(f, "decision") === "approve";
  const note = opt(f, "note");
  await prisma.booking.update({
    where: { id: b.id },
    data: { approval: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note },
  });
  await notify({
    userId: b.userId,
    kind: approve ? "APPROVED" : "REJECTED",
    subject: `${approve ? "Approved" : "Not approved"}: ${b.equipment.name}`,
    body: `Your request for ${b.equipment.name}, ${fmtDay(b.start)} ${fmtTime(b.start)} to ${fmtDay(b.end)} ${fmtTime(b.end)}, was ${approve ? "approved" : "not approved"} by ${user.name}.${note ? ` Note: ${note}` : ""}`,
    link: `/equipment/${b.equipmentId}`,
    key: `review:${b.id}`,
  });
  if (!approve) await afterFreed(b.equipmentId);
  done(f, "ok", `${approve ? "Approved" : "Declined"} ${b.equipment.name} for ${fmtDay(b.start)}.`);
}

// ---------- Hand-over: collection and return ----------

export async function checkOut(f: FormData) {
  const { user, booking: b } = await ownBooking(f);
  const now = new Date();
  const condition = str(f, "condition");
  const battery = str(f, "battery");
  if (!isCondition(condition) || !isBattery(battery)) done(f, "error", "Please record the condition and battery level.");
  if (b.approval !== "APPROVED") done(f, "error", "This booking is still waiting for staff approval.");
  if (b.checkedOutAt) done(f, "error", "Already checked out.");
  if (b.equipment.outOfService) done(f, "error", `${b.equipment.name} is out of service.`);
  if (now.getTime() < b.start.getTime() - LAB.checkOutEarlyMinutes * 60_000)
    done(f, "error", `You can collect it from ${LAB.checkOutEarlyMinutes} minutes before the booking starts.`);
  if (now >= b.end) done(f, "error", "This booking has already ended.");

  // Found broken at collection: record the fault instead of handing it over.
  if (condition === "Damaged or not working") {
    await reportFaultFor(user.id, b.equipmentId, opt(f, "note") ?? "Found damaged or not working at collection.", "UNUSABLE", b.id);
    f.set("returnTo", `/equipment/${b.equipmentId}`);
    done(f, "error", "Thanks for checking. The fault is recorded and the item is now out of service, so it wasn't checked out.");
  }

  const blocked = await prisma.$transaction(async (tx) => {
    const others = await tx.booking.findMany({ where: { equipmentId: b.equipmentId, id: { not: b.id } }, include: { user: true } });
    const reason = checkOutBlocker(others);
    if (!reason)
      await tx.booking.update({
        where: { id: b.id },
        data: { checkedOutAt: now, conditionOut: condition, batteryOut: battery, returnNote: opt(f, "note") },
      });
    return reason;
  });
  if (blocked) done(f, "error", blocked);
  if (condition === "Minor issue") await reportFaultFor(user.id, b.equipmentId, opt(f, "note") ?? "Minor issue noticed at collection.", "MINOR", b.id);
  f.set("returnTo", "/bookings");
  done(f, "ok", `${b.equipment.name} checked out until ${fmtWhen(b.end, now)}.`);
}

export async function checkIn(f: FormData) {
  const { user, booking: b } = await ownBooking(f);
  const now = new Date();
  const condition = str(f, "condition");
  const battery = str(f, "battery");
  const note = opt(f, "note");
  if (!isCondition(condition) || !isBattery(battery)) done(f, "error", "Please record the condition and battery level.");
  if (!b.checkedOutAt || b.checkedInAt) done(f, "error", "This item isn't checked out.");

  await prisma.booking.update({
    where: { id: b.id },
    data: { checkedInAt: now, conditionIn: condition, batteryIn: battery, returnNote: note ?? b.returnNote },
  });
  await prisma.equipment.update({ where: { id: b.equipmentId }, data: { condition } });

  if (condition !== "Good")
    await reportFaultFor(user.id, b.equipmentId, note ?? `Returned with: ${condition.toLowerCase()}.`, condition === "Minor issue" ? "MINOR" : "UNUSABLE", b.id);
  if (needsCharge(battery))
    await notifyAdmins({
      kind: "BATTERY",
      subject: `Needs charging: ${b.equipment.name}`,
      body: `${b.equipment.name} was returned by ${b.user.name} with its battery ${battery.toLowerCase()}.`,
      link: `/equipment/${b.equipmentId}`,
      key: `battery:${b.id}`,
    });
  if (now > b.end)
    await notifyAdmins({
      kind: "LATE",
      subject: `Returned late: ${b.equipment.name}`,
      body: `${b.user.name} returned ${b.equipment.name} at ${fmtWhen(now, now)}; it was due ${fmtWhen(b.end, now)}.`,
      link: "/reports",
      key: `late:${b.id}`,
    });
  await afterFreed(b.equipmentId);
  f.set("returnTo", "/bookings");
  done(f, "ok", `${b.equipment.name} checked in. Thanks!${needsCharge(battery) ? " Please put it on charge if you can." : ""}`);
}

// ---------- Faults ----------

async function reportFaultFor(reporterId: number, equipmentId: number, description: string, severity: "MINOR" | "UNUSABLE", bookingId?: number) {
  const item = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  const fault = await prisma.fault.create({ data: { equipmentId, reporterId, description, severity, bookingId: bookingId ?? null } });
  if (severity === "UNUSABLE")
    await prisma.equipment.update({
      where: { id: equipmentId },
      data: { outOfService: true, outOfServiceReason: `Fault reported: ${description}`, condition: "Damaged or not working" },
    });
  await notifyAdmins({
    kind: "FAULT",
    subject: `${severity === "UNUSABLE" ? "Out of service" : "Fault reported"}: ${item.name}`,
    body: `${description}${severity === "UNUSABLE" ? " The item has been taken out of service until the fault is resolved." : ""}`,
    link: "/admin#faults",
    key: `fault:${fault.id}`,
  });
}

export async function reportFault(f: FormData) {
  const user = await currentUser();
  const equipmentId = id(f, "equipmentId");
  const description = str(f, "description");
  const severity = str(f, "severity") === "UNUSABLE" ? "UNUSABLE" : "MINOR";
  if (description.length < 5) done(f, "error", "Please describe the fault in a few words.");
  await reportFaultFor(user.id, equipmentId, description.slice(0, 500), severity);
  done(f, "ok", severity === "UNUSABLE" ? "Fault reported. The item is now out of service and lab staff have been alerted." : "Fault reported. Lab staff have been alerted.");
}

export async function resolveFault(f: FormData) {
  const user = await currentUser();
  if (!can.resolveFaults(user)) done(f, "error", "Only lab staff can resolve faults.");
  const fault = await prisma.fault.findUnique({ where: { id: id(f, "faultId") } });
  if (!fault || fault.resolvedAt) done(f, "error", "That fault has already been resolved.");
  await prisma.fault.update({ where: { id: fault.id }, data: { resolvedAt: new Date(), resolvedById: user.id, resolution: opt(f, "resolution") } });
  const stillBroken = await prisma.fault.count({ where: { equipmentId: fault.equipmentId, severity: "UNUSABLE", resolvedAt: null } });
  if (!stillBroken && str(f, "backInService") === "1") {
    await prisma.equipment.update({ where: { id: fault.equipmentId }, data: { outOfService: false, outOfServiceReason: null, condition: "Good" } });
    await afterFreed(fault.equipmentId);
  }
  done(f, "ok", stillBroken ? "Fault resolved. Other faults still keep the item out of service." : "Fault resolved.");
}

// ---------- "Notify me when it's free" ----------

export async function toggleWatch(f: FormData) {
  const user = await currentUser();
  const equipmentId = id(f, "equipmentId");
  const existing = await prisma.watch.findUnique({ where: { equipmentId_userId: { equipmentId, userId: user.id } } });
  if (existing) {
    await prisma.watch.delete({ where: { id: existing.id } });
    done(f, "ok", "You won't be notified about this item.");
  }
  await prisma.watch.create({ data: { equipmentId, userId: user.id } });
  done(f, "ok", "We'll let you know as soon as it's free.");
}

export async function markAllRead(f: FormData) {
  const user = await currentUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  done(f, "ok", "All marked as read.");
}

// ---------- Equipment (admin) ----------

async function adminOnly(f: FormData) {
  if (!can.manageEquipment(await currentUser())) done(f, "error", "Only admins can change equipment.");
}

export async function setOutOfService(f: FormData) {
  await adminOnly(f);
  const out = str(f, "out") === "1";
  const equipmentId = id(f, "equipmentId");
  await prisma.equipment.update({
    where: { id: equipmentId },
    data: { outOfService: out, outOfServiceReason: out ? opt(f, "reason") : null },
  });
  if (!out) await afterFreed(equipmentId);
  done(f, "ok", out ? "Marked out of service." : "Back in service.");
}

const equipmentFields = (f: FormData) => ({
  name: str(f, "name"),
  type: str(f, "type"),
  location: str(f, "location") || LAB.location,
  assetId: opt(f, "assetId"),
  manufacturer: opt(f, "manufacturer"),
  model: opt(f, "model"),
  serialNumber: opt(f, "serialNumber"),
  condition: opt(f, "condition"),
  notes: opt(f, "notes"),
  safetyInfo: opt(f, "safetyInfo"),
  manualUrl: opt(f, "manualUrl"),
  photoUrl: opt(f, "photoUrl"),
});

/** Only web links for manuals and photos, so a stored value can never run script in the page. */
function checkLinks(f: FormData, data: { manualUrl: string | null; photoUrl: string | null }) {
  for (const [label, v] of [["Manual", data.manualUrl], ["Photo", data.photoUrl]] as const)
    if (v && !/^https?:\/\/|^\/[^/]/.test(v)) done(f, "error", `${label} must be a web address starting with https:// or a site path starting with /.`);
}

export async function addEquipment(f: FormData) {
  await adminOnly(f);
  const data = equipmentFields(f);
  if (!data.name || !data.type) done(f, "error", "Name and type are required.");
  checkLinks(f, data);
  await prisma.equipment.create({ data });
  done(f, "ok", `${data.name} added.`);
}

export async function updateEquipment(f: FormData) {
  await adminOnly(f);
  const equipmentId = id(f, "equipmentId");
  const data = equipmentFields(f);
  if (!data.name || !data.type) done(f, "error", "Name and type are required.");
  checkLinks(f, data);
  await prisma.equipment.update({ where: { id: equipmentId }, data });
  done(f, "ok", `${data.name} saved.`);
}
