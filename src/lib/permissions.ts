// Who can do what, in one place.
type U = { id: number; role: string };

const isStaff = (u: U) => u.role === "STAFF" || u.role === "ADMIN";

export const can = {
  manageEquipment: (u: U) => u.role === "ADMIN",
  manageAnyBooking: isStaff,
  actOnBooking: (u: U, b: { userId: number }) => b.userId === u.id || isStaff(u),
  approveBookings: isStaff,
  viewReports: isStaff,
  resolveFaults: isStaff,
};
