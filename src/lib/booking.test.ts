import { describe, expect, it } from "vitest";
import { checkOutBlocker, findClash, isActive, statusOf, validateRange, type BookingLike } from "./booking";
import { londonToUtc, parseLondon, weekOffset, workWeek } from "./time";
import { safePath } from "./paths";

// Thu 15 Oct 2026, London is on BST (UTC+1)
const at = (time: string, date = "2026-10-15") => londonToUtc(date, time);
const booking = (start: string, end: string, extra: Partial<BookingLike> = {}): BookingLike => ({
  start: at(start),
  end: at(end),
  checkedOutAt: null,
  checkedInAt: null,
  cancelledAt: null,
  ...extra,
});
const ok = { outOfService: false, outOfServiceReason: null };

describe("clashes", () => {
  const existing = [booking("10:00", "11:00")];
  const now = at("08:00");

  it("rejects an overlapping booking", () => {
    expect(findClash(at("10:30"), at("11:30"), existing, now)).toBeDefined();
    expect(findClash(at("09:00"), at("12:00"), existing, now)).toBeDefined();
  });

  it("allows bookings that only touch end to end", () => {
    expect(findClash(at("09:00"), at("10:00"), existing, now)).toBeUndefined();
    expect(findClash(at("11:00"), at("12:00"), existing, now)).toBeUndefined();
  });

  it("ignores cancelled bookings", () => {
    expect(findClash(at("10:00"), at("11:00"), [booking("10:00", "11:00", { cancelledAt: now })], now)).toBeUndefined();
  });

  it("treats an overdue item as taken until now", () => {
    const overdue = [booking("10:00", "11:00", { checkedOutAt: at("10:00") })];
    expect(findClash(at("11:00"), at("12:00"), overdue, at("11:20"))).toBeDefined();
  });

  it("frees the rest of a booking returned early", () => {
    const returned = [booking("10:00", "12:00", { checkedOutAt: at("10:00"), checkedInAt: at("10:30") })];
    expect(findClash(at("11:00"), at("12:00"), returned, at("10:45"))).toBeUndefined();
  });
});

describe("status", () => {
  it("free, with the next booking", () => {
    const s = statusOf(ok, [booking("14:00", "15:00")], at("12:00"));
    expect(s).toMatchObject({ kind: "free", nextStart: at("14:00") });
  });

  it("booked while a reservation is running but not collected", () => {
    expect(statusOf(ok, [booking("12:00", "13:00")], at("12:10")).kind).toBe("booked");
  });

  it("in use once checked out", () => {
    const s = statusOf(ok, [booking("12:00", "13:00", { checkedOutAt: at("12:00") })], at("12:10"));
    expect(s).toMatchObject({ kind: "in-use", until: at("13:00") });
  });

  it("overdue when the end passes without a check-in", () => {
    const s = statusOf(ok, [booking("12:00", "13:00", { checkedOutAt: at("12:00") })], at("13:05"));
    expect(s).toMatchObject({ kind: "overdue", since: at("13:00") });
  });

  it("free again after check-in", () => {
    const b = booking("12:00", "13:00", { checkedOutAt: at("12:00"), checkedInAt: at("12:40") });
    expect(statusOf(ok, [b], at("12:45")).kind).toBe("free");
  });

  it("out of service wins over everything", () => {
    const s = statusOf({ outOfService: true, outOfServiceReason: "Servo" }, [booking("12:00", "13:00")], at("12:10"));
    expect(s).toEqual({ kind: "out", reason: "Servo" });
  });
});

describe("lab rules", () => {
  const now = at("08:00");
  it("accepts a normal booking", () => expect(validateRange(at("10:00"), at("11:30"), now)).toBeNull());
  it("rejects outside lab hours", () => expect(validateRange(at("16:30"), at("17:30"), now)).not.toBeNull());
  it("rejects weekends", () => expect(validateRange(at("10:00", "2026-10-17"), at("11:00", "2026-10-17"), now)).not.toBeNull());
  it("rejects off-step times", () => expect(validateRange(at("10:15"), at("11:00"), now)).not.toBeNull());
  it("lets a walk-up start right now", () => expect(validateRange(at("10:07"), at("11:00"), at("10:07"), { walkUp: true })).toBeNull());
});

describe("bugs found in QA", () => {
  it("an overdue booking still counts as active (so it can be checked in)", () => {
    const overdue = booking("10:00", "11:00", { checkedOutAt: at("10:00") });
    expect(isActive(overdue, at("12:00"))).toBe(true);
    expect(isActive(booking("10:00", "11:00"), at("12:00"))).toBe(false); // never collected
    expect(isActive({ ...overdue, checkedInAt: at("12:00") }, at("12:05"))).toBe(false);
  });

  it("can't check out while someone else still has the item", () => {
    const holder = { ...booking("10:00", "11:00", { checkedOutAt: at("10:00") }), user: { name: "Priya" } };
    expect(checkOutBlocker([holder])).toMatch(/Priya/);
    expect(checkOutBlocker([{ ...holder, checkedInAt: at("11:00") }])).toBeNull();
  });

  it("rejects bookings too far ahead", () => {
    expect(validateRange(at("10:00", "2027-01-14"), at("11:00", "2027-01-14"), at("08:00"))).toMatch(/weeks ahead/);
  });

  it("parses only real dates and times", () => {
    expect(parseLondon("2026-10-15", "10:00")).toEqual(at("10:00"));
    expect(parseLondon("2027-02-31", "10:00")).toBeNull();
    expect(parseLondon("", "10:00")).toBeNull();
    expect(parseLondon("2026-10-15", "25:00")).toBeNull();
  });

  it("weekends show the coming lab week", () => {
    expect(workWeek(at("12:00", "2026-10-17"))[0]).toBe("2026-10-19"); // Saturday
    expect(workWeek(at("12:00", "2026-10-18"))[0]).toBe("2026-10-19"); // Sunday
    expect(workWeek(at("12:00", "2026-10-16"))[0]).toBe("2026-10-12"); // Friday
    expect(weekOffset(at("12:00"), at("10:00", "2026-10-28"))).toBe(2); // across the clock change
  });

  it("only redirects within the site", () => {
    expect(safePath("/equipment/2?week=1").pathname).toBe("/equipment/2");
    for (const bad of ["/.//example.com/phish", "//example.com", "/\\example.com", "https://example.com"])
      expect(safePath(bad).pathname).toBe("/");
  });
});

describe("inventory units", () => {
  it("expands quantities into numbered units that share the asset ID", async () => {
    const { INVENTORY, toUnits } = await import("../../prisma/inventory");
    const units = toUnits(INVENTORY);
    expect(units).toHaveLength(9);
    expect(units.filter((u) => u.assetId === "ROB-001").map((u) => u.name)).toEqual(["Unitree Go2 #1", "Unitree Go2 #2"]);
    expect(units.find((u) => u.assetId === "ROB-003")?.name).toBe("dSPACE"); // model unknown: no number, no "Unknown"
    expect(new Set(units.map((u) => u.name)).size).toBe(9); // names unique, so bookings can tell twins apart
  });
});
