// One drawn icon per equipment type until we have photos of the real kit.
const PATHS: Record<string, React.ReactNode> = {
  "Robot arm": (
    <>
      <path d="M10 42h20M14 42v-5h12v5" />
      <path d="M20 37V27l10-12" />
      <circle cx="20" cy="27" r="2.5" />
      <circle cx="30" cy="15" r="2.5" />
      <path d="M30 15l8 2M38 17l3-4M38 17l2 5" />
    </>
  ),
  "Robot dog": (
    <>
      <rect x="10" y="18" width="22" height="10" />
      <path d="M32 20l6-6h4v7h-6" />
      <path d="M13 28l-2 12M18 28l2 12M26 28l-2 12M30 28l3 12" />
      <path d="M10 20l-4-3" />
    </>
  ),
  "Robot scorpion": (
    <>
      <ellipse cx="22" cy="30" rx="9" ry="5" />
      <path d="M30 28c6-2 9-8 7-14s-6-6-8-3" />
      <path d="M29 11l-2 4 4 0" />
      <path d="M14 28l-6-4-3 2M14 32l-6 4-3-1M17 34l-3 6M22 35l0 6M27 34l3 6" />
      <path d="M13 29l-4-9 3-3M9 20l-3 0" />
    </>
  ),
  "3D printer": (
    <>
      <rect x="8" y="8" width="32" height="32" />
      <path d="M8 16h32M22 16v8M19 24h6l-3 4z" />
      <path d="M14 36h20v-4H14z" />
    </>
  ),
  "LiDAR sensor": (
    <>
      <rect x="16" y="22" width="16" height="16" />
      <path d="M16 28h16" />
      <path d="M24 22V12M24 12l-12-4M24 12l12-4M24 12l-14 3M24 12l14 3" strokeDasharray="2 3" />
    </>
  ),
  "Microcontroller kit": (
    <>
      <rect x="8" y="12" width="32" height="24" />
      <rect x="18" y="19" width="10" height="10" />
      <path d="M12 12v-4M16 12v-4M20 12v-4M24 12v-4M28 12v-4M32 12v-4M36 12v-4" />
      <path d="M40 18h4M40 24h4M40 30h4" />
    </>
  ),
  Drone: (
    <>
      <rect x="19" y="19" width="10" height="10" />
      <path d="M19 19l-7-7M29 19l7-7M19 29l-7 7M29 29l7 7" />
      <circle cx="11" cy="11" r="5" />
      <circle cx="37" cy="11" r="5" />
      <circle cx="11" cy="37" r="5" />
      <circle cx="37" cy="37" r="5" />
    </>
  ),
};

// Types used by the real inventory (prisma/inventory.ts)
PATHS["Quadruped Robot"] = PATHS["Robot dog"];
PATHS["Industrial Robot Arm"] = PATHS["Robot arm"];
PATHS["Collaborative Robot Arm"] = PATHS["Robot arm"];
PATHS["Humanoid Robot"] = (
  <>
    <circle cx="24" cy="11" r="6" />
    <path d="M18 11h-3M30 11h3" />
    <rect x="16" y="19" width="16" height="14" />
    <path d="M16 22l-6 8M32 22l6 8" />
    <path d="M20 33v9M28 33v9M17 42h6M25 42h6" />
  </>
);
PATHS["Control System Rig"] = (
  <>
    <rect x="8" y="10" width="32" height="26" />
    <path d="M8 18h32M14 14h4M22 14h4" />
    <path d="M14 24h6v6h-6zM24 24h10M24 30h10" />
    <path d="M18 36v6M30 36v6M14 42h20" />
  </>
);

const FALLBACK = (
  <>
    <rect x="10" y="10" width="28" height="28" />
    <path d="M18 24h12M24 18v12" />
  </>
);

export function EquipmentIcon({ type, className = "size-12" }: { type: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[type] ?? FALLBACK}
    </svg>
  );
}
