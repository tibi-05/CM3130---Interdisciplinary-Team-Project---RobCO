// Lab rules in one place. Hours and max length are placeholders until James answers "Booking rules".
export const LAB = {
  name: "RGU Robotics Lab",
  location: "Lab 4-2-4",
  timeZone: "Europe/London",
  openMinutes: 9 * 60,
  closeMinutes: 17 * 60,
  slotMinutes: 30,
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
  maxBookingMinutes: 4 * 60,
  maxWeeksAhead: 8, // matches how far the week calendar goes
  checkOutEarlyMinutes: 15, // can collect this long before a booking starts
} as const;
