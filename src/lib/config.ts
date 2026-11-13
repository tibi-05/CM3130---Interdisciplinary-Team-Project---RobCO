// Lab rules in one place. Lab hours are a placeholder until James confirms them.
export const LAB = {
  name: "RGU Robotics Lab",
  location: "Lab 4-2-4",
  timeZone: "Europe/London",
  openMinutes: 9 * 60,
  closeMinutes: 17 * 60,
  slotMinutes: 30,
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
  // Longest booking that is confirmed instantly. Longer or multi-day bookings are allowed (client:
  // no inflexible maximum) but go through an extended request that staff approve.
  maxBookingMinutes: 4 * 60,
  // Fair use (client: flag repeated bookings by one person, never block them)
  repeatFlagCount: 4, // this many bookings of one item by one person...
  repeatWindowDays: 14, // ...within this many days, either side of today, gets flagged for staff
  reminderHoursBefore: 24, // upcoming-booking reminder
  maxWeeksAhead: 8, // matches how far the week calendar goes
  checkOutEarlyMinutes: 15, // can collect this long before a booking starts
} as const;
