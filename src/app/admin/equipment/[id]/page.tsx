import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateEquipment } from "@/app/actions";
import { Notice, one } from "@/components/Notice";
import { EquipmentForm } from "@/components/EquipmentForm";
import { BackLink, Denied, PageHead } from "@/components/PageHead";

// Edit an item: fix typos, add serial numbers, safety information, manuals and photos after the lab visit.
export default async function EditEquipmentPage({ params, searchParams }: PageProps<"/admin/equipment/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!can.manageEquipment(user)) return <Denied title="Edit equipment">Switch to Admin in the header to edit equipment.</Denied>;
  if (!/^\d+$/.test(id)) notFound();
  const [e, all] = await Promise.all([prisma.equipment.findUnique({ where: { id: Number(id) } }), prisma.equipment.findMany({ select: { type: true } })]);
  if (!e) notFound();

  return (
    <>
      <PageHead
        back={<BackLink href="/admin">Admin</BackLink>}
        title={`Edit ${e.name}`}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-4xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />
          <p className="mb-4">
            <Link href={`/equipment/${e.id}`} className="link inline-flex min-h-11 items-center">
              View its page
            </Link>
          </p>
          <div className="panel sm:p-6">
            <EquipmentForm
              action={updateEquipment}
              values={e}
              types={[...new Set(all.map((x) => x.type))].sort()}
              returnTo={`/admin/equipment/${e.id}`}
              submit="Save changes"
            />
          </div>
        </div>
      </div>
    </>
  );
}
