import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateEquipment } from "@/app/actions";
import { Notice, one } from "@/components/Notice";
import { EquipmentForm } from "@/components/EquipmentForm";

// Edit an item: fix typos, add serial numbers, safety information, manuals and photos after the lab visit.
export default async function EditEquipmentPage({ params, searchParams }: PageProps<"/admin/equipment/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!can.manageEquipment(user)) return <p className="mx-auto max-w-4xl px-4 py-8">Switch to Admin in the header to edit equipment.</p>;
  if (!/^\d+$/.test(id)) notFound();
  const [e, all] = await Promise.all([prisma.equipment.findUnique({ where: { id: Number(id) } }), prisma.equipment.findMany({ select: { type: true } })]);
  if (!e) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin" className="text-rgu-blue underline font-semibold">
        ← Admin
      </Link>
      <div className="mt-4">
        <Notice ok={one(sp.ok)} error={one(sp.error)} />
      </div>
      <h1 className="text-3xl font-extrabold uppercase">Edit {e.name}</h1>
      <p className="mt-1">
        <Link href={`/equipment/${e.id}`} className="text-rgu-blue underline">
          View its page
        </Link>
      </p>
      <div className="mt-6">
        <EquipmentForm
          action={updateEquipment}
          values={e}
          types={[...new Set(all.map((x) => x.type))].sort()}
          returnTo={`/admin/equipment/${e.id}`}
          submit="Save changes"
        />
      </div>
    </div>
  );
}
