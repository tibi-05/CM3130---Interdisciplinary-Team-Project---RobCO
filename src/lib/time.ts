import { LAB } from "./config";

// Stored in UTC, shown in Europe/London. Plain Intl, no date library.
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAB.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86_400_000;

export function londonParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday) + 1, // 1 = Monday
  };
}

/** "2026-10-16" + "10:30" in London → UTC Date */
export function londonToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = londonParts(new Date(guess));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}

export function londonDate(d: Date): string {
  const p = londonParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export const minutesOfDay = (d: Date) => {
  const p = londonParts(d);
  return p.hour * 60 + p.minute;
};

export const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Every slot boundary in the lab day: 09:00, 09:30 … 17:00 */
export const slotTimes = () => {
  const out: string[] = [];
  for (let m = LAB.openMinutes; m <= LAB.closeMinutes; m += LAB.slotMinutes) out.push(toHHMM(m));
  return out;
};

/** Monday–Friday date strings of the week containing `d`, shifted by `offsetWeeks` */
export function workWeek(d: Date, offsetWeeks = 0): string[] {
  const p = londonParts(d);
  const monday = Date.UTC(p.year, p.month - 1, p.day) - (p.weekday - 1) * DAY_MS + offsetWeeks * 7 * DAY_MS;
  return [0, 1, 2, 3, 4].map((i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LAB.timeZone, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LAB.timeZone, weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (d: Date) => timeFmt.format(d);
export const fmtDay = (d: Date) => dayFmt.format(d);
export const isSameLondonDay = (a: Date, b: Date) => londonDate(a) === londonDate(b);

/** "15:30" today, "Thu 15 Oct 15:30" otherwise */
export const fmtWhen = (d: Date, now = new Date()) =>
  isSameLondonDay(d, now) ? fmtTime(d) : `${fmtDay(d)} ${fmtTime(d)}`;
