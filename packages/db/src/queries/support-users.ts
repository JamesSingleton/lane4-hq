import { eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import { user } from "../schema";

/** A LIKE pattern for a support lookup, or null when the query is too short or too long. */
export function supportUserSearchPattern(raw: string): string | null {
  const query = raw.trim().toLowerCase();
  if (query.length < 3 || query.length > 200) return null;
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Coaches matching an email or name fragment. Callers must already be operators. */
export async function searchUsersForSupport(raw: string, limit = 20) {
  const pattern = supportUserSearchPattern(raw);
  if (!pattern) return [];
  const capped = Math.min(Math.max(limit, 1), 20);
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      or(
        sql`lower(${user.email}) like ${pattern} escape '\\'`,
        sql`lower(${user.name}) like ${pattern} escape '\\'`,
      ),
    )
    .orderBy(user.email)
    .limit(capped);
}

export async function findUserForSupport(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, trimmed))
    .limit(1);
  return row ?? null;
}
