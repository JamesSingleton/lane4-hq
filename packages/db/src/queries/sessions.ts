import { and, eq, gt } from "drizzle-orm";
import { db } from "../client";
import { session } from "../schema/auth";

/**
 * Push a session's expiry out. Called from the auth server for desktop
 * sessions only; it writes the row directly so Better Auth's update hook
 * doesn't run again.
 */
export async function extendSessionExpiry(id: string, expiresAt: Date) {
  await db
    .update(session)
    .set({ expiresAt, updatedAt: new Date() })
    .where(eq(session.id, id));
}

/** Active Better Auth sessions for a user. Does not require a fresh session. */
export async function listActiveSessionsForUser(userId: string) {
  return db
    .select({
      id: session.id,
      token: session.token,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
}
