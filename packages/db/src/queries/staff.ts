import { asc, eq } from "drizzle-orm";
import { db } from "../client";
import { staff } from "../schema";

export async function findStaffById(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({ id: staff.id, name: staff.name, email: staff.email })
    .from(staff)
    .where(eq(staff.id, trimmed))
    .limit(1);
  return row ?? null;
}

export async function listStaff() {
  return db
    .select({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      createdAt: staff.createdAt,
    })
    .from(staff)
    .orderBy(asc(staff.createdAt));
}

export async function listStaffEmails() {
  const rows = await db.select({ email: staff.email }).from(staff);
  return rows.map((row) => row.email);
}
