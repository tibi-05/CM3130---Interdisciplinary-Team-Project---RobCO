import { LAB } from "@/lib/config";
import { TextArea, TextField } from "./Field";

type Values = Partial<{
  id: number;
  name: string;
  type: string;
  location: string;
  assetId: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  condition: string | null;
  notes: string | null;
  safetyInfo: string | null;
  manualUrl: string | null;
  photoUrl: string | null;
}>;

/** Add and edit share one form, so both always offer the same fields. */
export function EquipmentForm({
  action,
  values = {},
  types,
  returnTo,
  submit,
}: {
  action: (f: FormData) => Promise<void>;
  values?: Values;
  types: string[];
  returnTo: string;
  submit: string;
}) {
  const v = (k: keyof Values) => (values[k] == null ? undefined : String(values[k]));
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      {values.id && <input type="hidden" name="equipmentId" value={values.id} />}
      <TextField label="Name" name="name" required defaultValue={v("name")} hint="Number identical units, e.g. Unitree Go2 #3" />
      <TextField label="Type" name="type" required list="equipment-types" defaultValue={v("type")} />
      <datalist id="equipment-types">
        {types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <TextField label="Asset ID" name="assetId" placeholder="e.g. ROB-009" defaultValue={v("assetId")} />
      <TextField label="Kept in" name="location" defaultValue={v("location") ?? LAB.location} />
      <TextField label="Manufacturer" name="manufacturer" defaultValue={v("manufacturer")} />
      <TextField label="Model" name="model" defaultValue={v("model")} />
      <TextField label="Serial number" name="serialNumber" defaultValue={v("serialNumber")} />
      <TextField label="Condition" name="condition" placeholder="e.g. Good" defaultValue={v("condition")} />
      <TextField label="Manual link" name="manualUrl" inputMode="url" placeholder="https://… or /manuals/go2.pdf" defaultValue={v("manualUrl")} />
      <TextField label="Photo link" name="photoUrl" placeholder="https://… or /photos/go2.jpg" defaultValue={v("photoUrl")} />
      <TextArea
        className="sm:col-span-2"
        label="Safety information"
        name="safetyInfo"
        rows={5}
        defaultValue={v("safetyInfo")}
        hint="Shown at the top of the item's page, before anyone books it."
      />
      <TextField className="sm:col-span-2" label="Notes" name="notes" defaultValue={v("notes")} />
      <div>
        <button className="btn">{submit}</button>
      </div>
    </form>
  );
}
