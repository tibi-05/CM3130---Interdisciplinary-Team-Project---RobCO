// Who can do what, in one place.
type U = { id: number; role: string };

export const can = {
  manageEquipment: (u: U) => u.role === "ADMIN",
  manageAnyBooking: (u: U) => u.role === "STAFF" || u.role === "ADMIN",
  actOnBooking: (u: U, b: { userId: number }) => b.userId === u.id || can.manageAnyBooking(u),
};
