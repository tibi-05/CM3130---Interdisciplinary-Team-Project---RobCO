import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDay } from "@/lib/time";
import { addEquipment, resolveFault, setOutOfService } from "@/app/actions";
import { Notice, one } from "@/components/Notice";
import { EquipmentForm } from "@/components/EquipmentForm";
import { TextField } from "@/components/Field";
import { Denied, PageHead } from "@/components/PageHead";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!can.manageEquipment(user)) {
    return <Denied title="Admin">Switch to Admin in the header to manage equipment.</Denied>;
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
    <>
      <PageHead title="Admin" />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-4xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />

          <section aria-labelledby="faults-h" id="faults">
            <h2 id="faults-h" className="section-title">
              Open faults
            </h2>
            {openFaults.length === 0 ? (
              <p className="mt-3">No open faults.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {openFaults.map((f) => (
                  <li key={f.id} className={`border-l-4 px-5 py-4 ${f.severity === "UNUSABLE" ? "border-overdue bg-overdue-bg" : "border-inuse bg-inuse-bg"}`}>
                    <p>
                      <Link href={`/equipment/${f.equipmentId}`} className="text-lg font-extrabold underline-offset-4 hover:underline">
                        {f.equipment.name}
                      </Link>
                    </p>
                    <p className={`text-sm font-semibold ${f.severity === "UNUSABLE" ? "text-overdue" : "text-inuse"}`}>
                      {f.severity === "UNUSABLE" ? "Out of service" : "Still usable"}
                    </p>
                    <p className="mt-1">{f.description}</p>
                    <p className="text-sm">
                      Reported {fmtDay(f.createdAt)} by {f.reporter.name}
                    </p>
                    <form action={resolveFault} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="faultId" value={f.id} />
                      <input type="hidden" name="returnTo" value="/admin#faults" />
                      <TextField label="What was done" name="resolution" maxLength={300} className="min-w-64 flex-1" />
                      {f.equipment.outOfService && f.severity === "UNUSABLE" && (f.equipment.outOfServiceReason ?? "").startsWith("Fault reported: ") && (
                        <label className="option font-semibold">
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

          <section className="mt-12 border-t border-rule pt-8" aria-labelledby="equipment-h">
            <h2 id="equipment-h" className="section-title">
              Equipment
            </h2>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {equipment.map((e) => (
                <li key={e.id} className="py-3">
                  <form action={setOutOfService} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <input type="hidden" name="equipmentId" value={e.id} />
                    <input type="hidden" name="returnTo" value="/admin" />
                    <div className="min-w-48 flex-1 basis-56">
                      <p className="flex flex-wrap items-baseline gap-x-3">
                        <Link href={`/equipment/${e.id}`} className="link py-1">
                          {e.name}
                        </Link>
                        {e.assetId && <span className="text-sm font-mono text-muted">{e.assetId}</span>}
                        <Link href={`/admin/equipment/${e.id}`} className="link py-1 text-sm">
                          Edit<span className="sr-only"> {e.name}</span>
                        </Link>
                      </p>
                      {e._count.bookings > 0 && (
                        <p className="text-sm">
                          {e._count.bookings} upcoming booking{e._count.bookings > 1 ? "s" : ""}
                          {e.outOfService ? " affected" : ""}
                        </p>
                      )}
                      {e.outOfService && <p className="text-sm font-semibold text-out">Out of service: {e.outOfServiceReason ?? "no reason given"}</p>}
                    </div>
                    {e.outOfService ? (
                      <button className="btn btn-light" name="out" value="0">
                        Back in service
                      </button>
                    ) : (
                      <div className="flex flex-1 basis-72 flex-wrap items-center gap-2">
                        <input name="reason" placeholder="Reason (optional)" aria-label={`Reason ${e.name} is out of service`} className="field min-w-40 flex-1" />
                        <button className="btn btn-danger" name="out" value="1">
                          Out of service
                        </button>
                      </div>
                    )}
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 border-t border-rule pt-8" aria-labelledby="add-h">
            <h2 id="add-h" className="section-title">
              Add equipment
            </h2>
            <div className="panel mt-4 sm:p-6">
              <EquipmentForm action={addEquipment} types={types} returnTo="/admin" submit="Add" />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
