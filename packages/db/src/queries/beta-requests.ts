import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { betaAccessRequest, user } from "../schema";

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export async function findAccountByEmail(email: string) {
  const normalized = normalizedEmail(email);
  if (!normalized) return null;
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalized}`)
    .limit(1);
  return row ?? null;
}

export async function findPendingBetaAccessRequestByEmail(email: string) {
  const normalized = normalizedEmail(email);
  if (!normalized) return null;
  const [row] = await db
    .select({ id: betaAccessRequest.id, email: betaAccessRequest.email })
    .from(betaAccessRequest)
    .where(
      and(
        sql`lower(${betaAccessRequest.email}) = ${normalized}`,
        eq(betaAccessRequest.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findBetaAccessRequestById(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select()
    .from(betaAccessRequest)
    .where(eq(betaAccessRequest.id, trimmed))
    .limit(1);
  return row ?? null;
}

export async function listBetaAccessRequests(limit = 50) {
  return db
    .select({
      id: betaAccessRequest.id,
      name: betaAccessRequest.name,
      email: betaAccessRequest.email,
      team: betaAccessRequest.team,
      reason: betaAccessRequest.reason,
      status: betaAccessRequest.status,
      createdAt: betaAccessRequest.createdAt,
      reviewedAt: betaAccessRequest.reviewedAt,
    })
    .from(betaAccessRequest)
    .orderBy(
      sql`case when ${betaAccessRequest.status} = 'pending' then 0 else 1 end`,
      desc(betaAccessRequest.createdAt),
    )
    .limit(limit);
}

export async function createBetaAccessRequest(input: {
  name: string;
  email: string;
  team: string;
  reason: string;
  now?: Date;
}): Promise<
  { outcome: "created"; id: string; email: string } | { outcome: "pending" }
> {
  const email = normalizedEmail(input.email);
  const existing = await findPendingBetaAccessRequestByEmail(email);
  if (existing) return { outcome: "pending" };

  const id = randomUUID();
  const now = input.now ?? new Date();
  try {
    await db.insert(betaAccessRequest).values({
      id,
      name: input.name.trim(),
      email,
      team: input.team.trim(),
      reason: input.reason.trim(),
      status: "pending",
      createdAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "pending" };
    throw error;
  }
  return { outcome: "created", id, email };
}

export async function reviewBetaAccessRequest(input: {
  id: string;
  status: "approved" | "denied";
  reviewedByUserId?: string | null;
  reviewedByStaffId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(betaAccessRequest)
    .set({
      status: input.status,
      reviewedAt: now,
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedByStaffId: input.reviewedByStaffId ?? null,
    })
    .where(
      and(
        eq(betaAccessRequest.id, input.id),
        eq(betaAccessRequest.status, "pending"),
      ),
    )
    .returning({
      id: betaAccessRequest.id,
      email: betaAccessRequest.email,
      status: betaAccessRequest.status,
    });
  return row ?? null;
}
