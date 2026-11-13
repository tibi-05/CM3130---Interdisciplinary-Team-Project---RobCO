import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requestNow } from "@/lib/session";
import { LAB } from "@/lib/config";
import { londonDate, slotTimes } from "@/lib/time";
import { requestExtended } from "@/app/actions";
import { EquipmentIcon } from "@/components/EquipmentIcon";
import { Notice, one } from "@/components/Notice";
import { SelectField, TextArea, TextField } from "@/components/Field";
import { BackLink, PageHead } from "@/components/PageHead";
import { Form } from "@/components/Form";

// Extended bookings (client: no inflexible maximum, research and honours projects need longer;
// long bookings go through a request that explains why, and staff approve it).
export default async function RequestPage({ params, searchParams }: PageProps<"/equipment/[id]/request">) {
  const { id } = await params;
  const sp = await searchParams;
  const now = await requestNow();
  if (!/^\d+$/.test(id)) notFound();
  const e = await prisma.equipment.findUnique({ where: { id: Number(id) } });
  if (!e) notFound();
  const slots = slotTimes();
  const today = londonDate(now);
  const latest = londonDate(new Date(now.getTime() + LAB.maxWeeksAhead * 7 * 86_400_000));

  return (
    <>
      <PageHead back={<BackLink href={`/equipment/${e.id}`}>Back to {e.name}</BackLink>} title="Request an extended booking" sub={e.name} />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <div className="max-w-3xl">
          <Notice ok={one(sp.ok)} error={one(sp.error)} />
          <div className="flex items-start gap-4">
            <EquipmentIcon type={e.type} className="size-12 shrink-0 text-rgu-purple" />
            <p>
              For anything longer than {LAB.maxBookingMinutes / 60} hours, or over several days, for example a research or honours project. Lab staff
              review each request and you&apos;ll get the decision in your inbox. The item is held for you while the request is reviewed.
            </p>
          </div>

          {e.outOfService ? (
            <p className="mt-6 border-l-4 border-out bg-out-bg p-4 font-semibold">This item is out of service and can&apos;t be requested right now.</p>
          ) : (
            <Form action={requestExtended} className="panel mt-6 sm:p-6">
              <input type="hidden" name="equipmentId" value={e.id} />
              <input type="hidden" name="returnTo" value={`/equipment/${e.id}/request`} />
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="section-title mb-3">When</legend>
                <TextField label="Collect on" type="date" name="startDate" required min={today} max={latest} />
                <SelectField label="At" name="startTime" options={slots.slice(0, -1)} defaultValue="09:00" />
                <TextField label="Return on" type="date" name="endDate" required min={today} max={latest} />
                <SelectField label="By" name="endTime" options={slots.slice(1)} defaultValue="17:00" />
              </fieldset>
              <p className="mt-3 text-sm text-muted">Collection and return must be on weekdays during lab hours.</p>
              <div className="mt-6 grid gap-4 border-t border-rule pt-6">
                <TextField label="What is it for?" name="purpose" required maxLength={120} placeholder="e.g. Honours project: terrain mapping" />
                <TextArea
                  label="Why do you need it for this long?"
                  name="justification"
                  required
                  maxLength={600}
                  hint="This helps staff share equipment fairly. Mention your supervisor if you have one."
                />
                <TextField
                  label="Where will you use it? (optional)"
                  name="useLocation"
                  maxLength={120}
                  placeholder="Leave empty if staying in the lab"
                />
              </div>
              <button className="btn mt-6">Send request</button>
            </Form>
          )}
        </div>
      </div>
    </>
  );
}
