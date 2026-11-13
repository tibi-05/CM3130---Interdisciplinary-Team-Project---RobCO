import type { Status, StatusKind } from "@/lib/booking";
import { fmtWhen } from "@/lib/time";

export const STATUS_LABEL: Record<StatusKind, string> = {
  free: "Free",
  booked: "Booked",
  "in-use": "In use",
  overdue: "Overdue",
  out: "Out of service",
};

const STYLE: Record<StatusKind, string> = {
  free: "bg-free-bg text-free border-free",
  booked: "bg-booked-bg text-booked border-booked",
  "in-use": "bg-inuse-bg text-inuse border-inuse",
  overdue: "bg-overdue-bg text-overdue border-overdue",
  out: "bg-out-bg text-out border-out",
};

/** Always a word as well as a colour. */
export function statusText(s: Status, now: Date) {
  switch (s.kind) {
    case "in-use":
      return `In use until ${fmtWhen(s.until, now)}`;
    case "booked":
      return `Booked until ${fmtWhen(s.until, now)}`;
    case "overdue":
      return `Overdue since ${fmtWhen(s.since, now)}`;
    default:
      return STATUS_LABEL[s.kind];
  }
}

export function StatusBadge({ status, now, size = "md" }: { status: Status; now: Date; size?: "md" | "lg" }) {
  const box = size === "lg" ? "border-l-[6px] px-3 py-1.5 text-lg" : "border-l-4 px-2 py-1 text-sm";
  return (
    <span className={`inline-flex items-center gap-1.5 leading-tight font-semibold ${box} ${STYLE[status.kind]}`}>
      {statusText(status, now)}
    </span>
  );
}
