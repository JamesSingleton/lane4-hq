import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../client";
import { supportHandoff } from "../schema";

export const SUPPORT_HANDOFF_TTL_MS = 60 * 1000;

export function hashSupportHandoffToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSupportHandoff(input: {
  staffId: string;
  targetUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + SUPPORT_HANDOFF_TTL_MS);
  await db.insert(supportHandoff).values({
    id,
    tokenHash: hashSupportHandoffToken(token),
    staffId: input.staffId,
    targetUserId: input.targetUserId,
    expiresAt,
    createdAt: now,
  });
  return { id, token, expiresAt };
}

export async function consumeSupportHandoff(token: string, now = new Date()) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [row] = await db
    .update(supportHandoff)
    .set({ usedAt: now })
    .where(
      and(
        eq(supportHandoff.tokenHash, hashSupportHandoffToken(trimmed)),
        isNull(supportHandoff.usedAt),
        gt(supportHandoff.expiresAt, now),
      ),
    )
    .returning({
      id: supportHandoff.id,
      staffId: supportHandoff.staffId,
      targetUserId: supportHandoff.targetUserId,
    });
  return row ?? null;
}
