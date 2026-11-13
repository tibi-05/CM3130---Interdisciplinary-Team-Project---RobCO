import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { csv, hours, usageByItem } from "@/lib/usage";

// Usage per item as a spreadsheet, e.g. to attach to a replacement-funding request.
export async function GET() {
  const user = await currentUser();
  if (!can.viewReports(user)) return new Response("Staff only", { status: 403 });
  const now = await requestNow();
  const [equipment, bookings, faults] = await Promise.all([
    prisma.equipment.findMany({ orderBy: { assetId: "asc" } }),
    prisma.booking.findMany({ where: { cancelledAt: null } }),
    prisma.fault.findMany(),
  ]);
  const usage = usageByItem(bookings, now);
  const header = ["Asset ID", "Item", "Type", "Manufacturer", "Model", "Serial number", "Uses", "Hours in use", "Late returns", "Missed bookings", "Faults", "Open faults", "Last used", "Condition", "Out of service"];
  const lines = equipment.map((e) => {
    const u = usage.get(e.id);
    const f = faults.filter((x) => x.equipmentId === e.id);
    return [e.assetId, e.name, e.type, e.manufacturer, e.model, e.serialNumber, u?.uses ?? 0, hours(u?.minutes ?? 0), u?.late ?? 0, u?.noShows ?? 0, f.length, f.filter((x) => !x.resolvedAt).length, u?.lastUsed ?? "", e.condition, e.outOfService ? "Yes" : "No"]
      .map(csv)
      .join(",");
  });
  return new Response([header.map(csv).join(","), ...lines].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="robotics-lab-usage-${now.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
