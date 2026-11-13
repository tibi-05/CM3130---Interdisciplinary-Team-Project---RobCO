import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDay } from "@/lib/time";
import { addEquipment, resolveFault, setOutOfService } from "@/app/actions";
import { Notice, one } from "@/components/Notice";
import { EquipmentForm } from "@/components/EquipmentForm";
import { TextField } from "@/components/Field";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!can.manageEquipment(user)) {
    return <p className="mx-auto max-w-4xl px-4 py-8">Switch to Admin in the header to manage equipment.</p>;
  }
  const now = await requestNow();
  const [equipment, openFaults] = await Promise.all([
    prisma.equipment.findMany({
      include: { _count: { select: { bookings: { where: { cancelledAt: null, checkedOutAt: null, end: { gt: now }, approval: { not: "REJECTED" } } } } } },
    }),
    prisma.fault.findMany({ where: { resolvedAt: null }, include: { equipment: true, reporter: true }, orderBy: { createdAt: "desc" } }),
  ]);
  equipment.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const types = [...new Set(equipment.map((e) => e.type))].sort();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Notice ok={one(sp.ok)} error={one(sp.error)} />
      <h1 className="text-3xl font-extrabold uppercase">Admin</h1>

      <section className="mt-8" aria-labelledby="faults-h" id="faults">
        <h2 id="faults-h" className="text-xl font-extrabold uppercase">
          Open faults
        </h2>
        {openFaults.length === 0 ? (
          <p className="mt-3">No open faults.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {openFaults.map((f) => (
              <li key={f.id} className={`border-l-4 p-4 ${f.severity === "UNUSABLE" ? "border-overdue bg-overdue-bg" : "border-inuse bg-inuse-bg"}`}>
                <p>
                  <Link href={`/equipment/${f.equipmentId}`} className="font-extrabold hover:underline">
                    {f.equipment.name}
                  </Link>{" "}
                  · {f.severity === "UNUSABLE" ? "out of service" : "still usable"}
                </p>
                <p>{f.description}</p>
                <p className="text-sm">
                  Reported {fmtDay(f.createdAt)} by {f.reporter.name}
                </p>
                <form action={resolveFault} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="faultId" value={f.id} />
                  <input type="hidden" name="returnTo" value="/admin#faults" />
                  <TextField label="What was done" name="resolution" maxLength={300} className="min-w-64 flex-1" />
                  {f.equipment.outOfService && f.severity === "UNUSABLE" && (f.equipment.outOfServiceReason ?? "").startsWith("Fault reported: ") && (
                    <label className="flex items-center gap-2 font-semibold">
                      <input type="checkbox" name="backInService" value="1" defaultChecked /> Back in service
                    </label>
                  )}
                  <button className="btn">Mark resolved</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mt-10 text-xl font-extrabold uppercase">Equipment</h2>
      <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
        {equipment.map((e) => (
          <li key={e.id} className="py-3">
            <form action={setOutOfService} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="equipmentId" value={e.id} />
              <input type="hidden" name="returnTo" value="/admin" />
              <Link href={`/equipment/${e.id}`} className="font-semibold min-w-44 text-rgu-blue underline">
                {e.name}
              </Link>
              {e.assetId && <span className="text-sm font-mono text-neutral-700">{e.assetId}</span>}
              <Link href={`/admin/equipment/${e.id}`} className="text-sm text-rgu-blue underline">
                Edit<span className="sr-only"> {e.name}</span>
              </Link>
              {e._count.bookings > 0 && (
                <span className="text-sm">
                  {e._count.bookings} upcoming booking{e._count.bookings > 1 ? "s" : ""}
                  {e.outOfService ? " affected" : ""}
                </span>
              )}
              {e.outOfService ? (
                <>
                  <span className="text-out">Out of service: {e.outOfServiceReason ?? "no reason given"}</span>
                  <button className="btn btn-light ml-auto" name="out" value="0">
                    Back in service
                  </button>
                </>
              ) : (
                <>
                  <input name="reason" placeholder="Reason (optional)" aria-label={`Reason ${e.name} is out of service`} className="field flex-1 min-w-40" />
                  <button className="btn btn-danger" name="out" value="1">
                    Out of service
                  </button>
                </>
              )}
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-extrabold uppercase">Add equipment</h2>
      <div className="mt-3">
        <EquipmentForm action={addEquipment} types={types} returnTo="/admin" submit="Add" />
      </div>
    </div>
  );
}
