// The lab's real inventory, copied from Robotics_Lab_Inventory_v3.xlsx (James, Oct 2026).
// Edit this file when the sheet changes, then `npm run demo:reset`.
// Quantity > 1 becomes one bookable unit per robot ("Unitree Go2 #1", "#2") sharing the asset ID.

export type InventoryRow = {
  assetId: string;
  type: string;
  manufacturer: string;
  model: string;
  quantity: number;
  serialNumber?: string;
  location: string;
  condition: string;
  notes?: string;
};

export const INVENTORY: InventoryRow[] = [
  { assetId: "ROB-001", type: "Quadruped Robot", manufacturer: "Unitree", model: "Go2", quantity: 2, location: "Robotics Lab", condition: "Good", notes: "Serial numbers to be added" },
  { assetId: "ROB-002", type: "Quadruped Robot", manufacturer: "Unitree", model: "Go1", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Serial number to be added" },
  { assetId: "ROB-003", type: "Control System Rig", manufacturer: "dSPACE", model: "Unknown", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Serial number/model to be confirmed" },
  { assetId: "ROB-005", type: "Industrial Robot Arm", manufacturer: "Mitsubishi", model: "Movemaster EX", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Legacy teaching/research robot arm" },
  { assetId: "ROB-006", type: "Collaborative Robot Arm", manufacturer: "Universal Robots", model: "Model to confirm", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Includes multiple end-effectors and attachments" },
  { assetId: "ROB-007", type: "Humanoid Robot", manufacturer: "SoftBank Robotics", model: "Pepper", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Humanoid social robot with integrated tablet" },
  { assetId: "ROB-008", type: "Humanoid Robot", manufacturer: "SoftBank Robotics", model: "NAO", quantity: 2, location: "Robotics Lab", condition: "Good", notes: "Two NAO humanoid robots" },
];

export type Unit = Omit<InventoryRow, "quantity"> & { name: string };

/** The sheet writes "Unknown" or "Model to confirm" where it has no model; treat those as no model. */
export const isPlaceholder = (s: string) => /unknown|confirm/i.test(s);

/** One bookable unit per physical robot. Units with no real model get no number in the name. */
export function toUnits(rows: InventoryRow[]): Unit[] {
  return rows.flatMap(({ quantity, ...r }) => {
    const base = isPlaceholder(r.model) ? r.manufacturer : `${r.manufacturer} ${r.model}`;
    return Array.from({ length: quantity }, (_, i) => ({ ...r, name: quantity > 1 ? `${base} #${i + 1}` : base }));
  });
}
