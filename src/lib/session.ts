import { cookies } from "next/headers";
import { connection } from "next/server";
import { prisma } from "./db";

// Prototype "login": a role switcher picks a pretend user. Real sign-in replaces only this file.
export const ROLES = ["STUDENT", "STAFF", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);

export async function currentUser() {
  const role = (await cookies()).get("role")?.value;
  return prisma.user.findFirstOrThrow({ where: { role: isRole(role) ? role : "STUDENT" }, orderBy: { id: "asc" } });
}

export type CurrentUser = Awaited<ReturnType<typeof currentUser>>;

/** The clock, read at request time (never baked into a prerender). */
export async function requestNow() {
  await connection();
  return new Date();
}
