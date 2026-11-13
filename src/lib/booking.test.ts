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

describe("inventory placeholders", () => {
  it("treats the sheet's 'Unknown' and 'Model to confirm' as no model", async () => {
    const { isPlaceholder } = await import("../../prisma/inventory");
    expect(isPlaceholder("Unknown")).toBe(true);
    expect(isPlaceholder("Model to confirm")).toBe(true);
    expect(isPlaceholder("Go2")).toBe(false);
  });
});

describe("client requirements (16 Oct meeting)", () => {
  const now = at("08:00");

  it("rejected requests don't block the slot; pending ones do", async () => {
    const { findClash } = await import("./booking");
    expect(findClash(at("10:00"), at("11:00"), [booking("10:00", "11:00", { approval: "REJECTED" })], now)).toBeUndefined();
    expect(findClash(at("10:00"), at("11:00"), [booking("10:00", "11:00", { approval: "PENDING" })], now)).toBeDefined();
  });

  it("extended bookings may span days with no maximum, but must start and end in lab hours", () => {
    expect(validateRange(at("09:00"), at("17:00", "2026-10-21"), now, { extended: true })).toBeNull();
    expect(validateRange(at("09:00"), at("17:00", "2026-10-21"), now)).toMatch(/extended/);
    expect(validateRange(at("09:00"), at("18:00", "2026-10-21"), now, { extended: true })).toMatch(/lab hours/);
    expect(validateRange(at("09:00"), at("12:00", "2026-10-17"), now, { extended: true })).toMatch(/weekday/);
  });

  it("asks for approval when kit leaves the lab or runs long", async () => {
    const { approvalReasons } = await import("./booking");
    expect(approvalReasons({ start: at("10:00"), end: at("11:00") })).toEqual([]);
    expect(approvalReasons({ start: at("10:00"), end: at("11:00"), useLocation: "Room 2249" })).toEqual(["Leaves the lab: Room 2249"]);
    expect(approvalReasons({ start: at("09:00"), end: at("17:00", "2026-10-20"), kind: "EXTENDED" })).toEqual(["Runs over several days"]);
  });

  it("flags repeated bookings of one item by one person, without blocking", async () => {
    const { repeatedBookings } = await import("./booking");
    const mk = (day: string, userId: number) => ({ ...booking("10:00", "11:00"), start: at("10:00", day), end: at("11:00", day), userId, equipmentId: 7 });
    const four = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-16"].map((d) => mk(d, 1));
    expect(repeatedBookings([...four, mk("2026-10-15", 2)], now)).toEqual([{ userId: 1, equipmentId: 7, count: 4 }]);
    expect(repeatedBookings(four.slice(0, 3), now)).toEqual([]);
  });
});

describe("usage history", () => {
  const now = at("18:00");
  const used = (from: string, to: string, back: string, extra: Partial<BookingLike> = {}) => ({
    ...booking(from, to, { checkedOutAt: at(from), checkedInAt: at(back), ...extra }),
    equipmentId: 1,
    userId: 1,
  });

  it("counts hours actually out, late returns and missed bookings", async () => {
    const { usageByItem, problemsByUser } = await import("./usage");
    const rows = [used("10:00", "11:00", "11:00"), used("12:00", "13:00", "13:30"), { ...booking("14:00", "15:00"), equipmentId: 1, userId: 1 }];
    const u = usageByItem(rows, now).get(1)!;
    expect(u.uses).toBe(2);
    expect(u.minutes).toBe(150);
    expect(u.late).toBe(1);
    expect(u.noShows).toBe(1);
    expect(problemsByUser(rows, now)).toEqual([{ userId: 1, late: 1, noShows: 1 }]);
  });

  it("suggests the least-used of identical robots that is in service", async () => {
    const { twinBalance } = await import("./usage");
    const eq = [
      { id: 1, name: "Go2 #1", assetId: "ROB-001", outOfService: false },
      { id: 2, name: "Go2 #2", assetId: "ROB-001", outOfService: false },
      { id: 3, name: "Go1", assetId: "ROB-002", outOfService: false },
    ];
    const usage = new Map([[1, { equipmentId: 1, uses: 5, minutes: 600, late: 0, noShows: 0, lastUsed: null }]]);
    const [g] = twinBalance(eq, usage);
    expect(g.suggest?.name).toBe("Go2 #2");
    expect(twinBalance([eq[0], { ...eq[1], outOfService: true }], usage)[0].suggest?.name).toBe("Go2 #1");
  });

  it("quotes CSV cells that need it", async () => {
    const { csv } = await import("./usage");
    expect(csv('Arm, "big"')).toBe('"Arm, ""big"""');
    expect(csv(null)).toBe("");
  });
});

describe("hand-over", () => {
  it("warns about low and flat batteries only", async () => {
    const { needsCharge } = await import("./handover");
    expect(["Full", "Half", "Low", "Flat", "No battery"].map(needsCharge)).toEqual([false, false, true, true, false]);
  });
});
