// The lab's real inventory, copied from Robotics_Lab_Inventory_v3.xlsx (James, Oct 2026).
// Photos come from the same spreadsheet; they live in public/equipment/ (resized, metadata removed).
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
  photo?: string; // path under /public, shared by identical units
};

export const INVENTORY: InventoryRow[] = [
  { assetId: "ROB-001", type: "Quadruped Robot", manufacturer: "Unitree", model: "Go2", quantity: 2, location: "Robotics Lab", condition: "Good", notes: "Serial numbers to be added", photo: "/equipment/rob-001-unitree-go2.jpg" },
  { assetId: "ROB-002", type: "Quadruped Robot", manufacturer: "Unitree", model: "Go1", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Serial number to be added", photo: "/equipment/rob-002-unitree-go1.jpg" },
  { assetId: "ROB-003", type: "Control System Rig", manufacturer: "dSPACE", model: "Unknown", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Serial number/model to be confirmed", photo: "/equipment/rob-003-dspace.jpg" },
  { assetId: "ROB-005", type: "Industrial Robot Arm", manufacturer: "Mitsubishi", model: "Movemaster EX", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Legacy teaching/research robot arm", photo: "/equipment/rob-005-mitsubishi-movemaster-ex.jpg" },
  { assetId: "ROB-006", type: "Collaborative Robot Arm", manufacturer: "Universal Robots", model: "Model to confirm", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Includes multiple end-effectors and attachments", photo: "/equipment/rob-006-universal-robots.jpg" },
  { assetId: "ROB-007", type: "Humanoid Robot", manufacturer: "SoftBank Robotics", model: "Pepper", quantity: 1, location: "Robotics Lab", condition: "Good", notes: "Humanoid social robot with integrated tablet", photo: "/equipment/rob-007-pepper.jpg" },
  { assetId: "ROB-008", type: "Humanoid Robot", manufacturer: "SoftBank Robotics", model: "NAO", quantity: 2, location: "Robotics Lab", condition: "Good", notes: "Two NAO humanoid robots", photo: "/equipment/rob-008-nao.jpg" },
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
