// The short check list at collection and return (client: record condition before and after use;
// a robot returned with flat batteries left the next user waiting for hours).

export const CONDITIONS = ["Good", "Minor issue", "Damaged or not working"] as const;
export const BATTERY = ["Full", "Half", "Low", "Flat", "No battery"] as const;

export type Condition = (typeof CONDITIONS)[number];
export type Battery = (typeof BATTERY)[number];

export const isCondition = (v: string): v is Condition => (CONDITIONS as readonly string[]).includes(v);
export const isBattery = (v: string): v is Battery => (BATTERY as readonly string[]).includes(v);

/** Battery levels the next person should be warned about. */
export const needsCharge = (b: string | null | undefined) => b === "Low" || b === "Flat";
