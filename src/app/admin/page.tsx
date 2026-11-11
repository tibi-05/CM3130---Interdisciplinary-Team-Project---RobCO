import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUser, requestNow } from "@/lib/session";
import { can } from "@/lib/permissions";
import { addEquipment, setOutOfService } from "@/app/actions";
import { LAB } from "@/lib/config";
import { Notice, one } from "@/components/Notice";

// Deliberately rough: exists so the rules are real, not shown on Friday.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!can.manageEquipment(user)) {
    return <p className="mx-auto max-w-4xl px-4 py-8">Switch to Admin in the header to manage equipment.</p>;
  }
  const now = await requestNow();
  const equipment = await prisma.equipment.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { bookings: { where: { cancelledAt: null, checkedOutAt: null, end: { gt: now } } } } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Notice ok={one(sp.ok)} error={one(sp.error)} />
      <h1 className="text-3xl font-extrabold uppercase">Admin</h1>

      <h2 className="mt-8 text-xl font-extrabold uppercase">Equipment</h2>
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
      <form action={addEquipment} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="returnTo" value="/admin" />
        <label className="flex flex-col gap-1 font-semibold">
          Name
          <input name="name" required className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Type
          <input name="type" required list="types" className="field" />
          <datalist id="types">
            {[...new Set(equipment.map((e) => e.type))].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Location
          <input name="location" defaultValue={LAB.location} className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Asset ID
          <input name="assetId" placeholder="e.g. ROB-009" className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Manufacturer
          <input name="manufacturer" className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Model
          <input name="model" className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Serial number
          <input name="serialNumber" className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Condition
          <input name="condition" defaultValue="Good" className="field" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Notes
          <input name="notes" className="field" />
        </label>
        <div>
          <button className="btn">Add</button>
        </div>
      </form>
    </div>
  );
}
