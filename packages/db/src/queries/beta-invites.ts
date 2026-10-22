import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../client";
import { betaInvite, invitation } from "../schema";

export const BETA_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findOpenBetaInviteByEmail(
  email: string,
  now = new Date(),
) {
  const normalized = normalizedEmail(email);
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(betaInvite)
    .where(
      and(
        sql`lower(${betaInvite.email}) = ${normalized}`,
        eq(betaInvite.status, "pending"),
        gt(betaInvite.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findOpenBetaInviteByToken(
  token: string,
  now = new Date(),
) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select()
    .from(betaInvite)
    .where(
      and(
        eq(betaInvite.token, trimmed),
        eq(betaInvite.status, "pending"),
        gt(betaInvite.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findOpenTeamInviteByEmail(
  email: string,
  now = new Date(),
) {
  const normalized = normalizedEmail(email);
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = ${normalized}`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findOpenTeamInvitationById(id: string, now = new Date()) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      organizationId: invitation.organizationId,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, trimmed),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listBetaInvites(limit = 100) {
  return db
    .select({
      id: betaInvite.id,
      email: betaInvite.email,
      status: betaInvite.status,
      expiresAt: betaInvite.expiresAt,
      createdAt: betaInvite.createdAt,
      acceptedAt: betaInvite.acceptedAt,
    })
    .from(betaInvite)
    .orderBy(desc(betaInvite.createdAt))
    .limit(limit);
}

export async function createBetaInvite(input: {
  email: string;
  invitedByUserId: string;
  now?: Date;
}) {
  const email = normalizedEmail(input.email);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + BETA_INVITE_TTL_MS);
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");

  await db
    .update(betaInvite)
    .set({ status: "revoked" })
    .where(
      and(
        sql`lower(${betaInvite.email}) = ${email}`,
        eq(betaInvite.status, "pending"),
      ),
    );

  await db.insert(betaInvite).values({
    id,
    email,
    token,
    status: "pending",
    expiresAt,
    invitedByUserId: input.invitedByUserId,
    createdAt: now,
  });

  return { id, email, token, expiresAt };
}

export async function revokeBetaInvite(id: string) {
  const [row] = await db
    .update(betaInvite)
    .set({ status: "revoked" })
    .where(and(eq(betaInvite.id, id), eq(betaInvite.status, "pending")))
    .returning({ id: betaInvite.id, email: betaInvite.email });
  return row ?? null;
}

export async function acceptBetaInvitesForEmail(
  email: string,
  now = new Date(),
) {
  const normalized = normalizedEmail(email);
  if (!normalized) return;
  await db
    .update(betaInvite)
    .set({ status: "accepted", acceptedAt: now })
    .where(
      and(
        sql`lower(${betaInvite.email}) = ${normalized}`,
        eq(betaInvite.status, "pending"),
      ),
    );
}
