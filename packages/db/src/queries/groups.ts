import { tagException } from "@lane4hq/analytics";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../client";
import { aiGenerations, trainingGroups } from "../schema/groups";
import { seasonEnrollments } from "../schema/seasons";
import { teamSwimmerMemberships } from "../schema/swimmers";
import {
  enrollMembershipInSeason,
  ensureCurrentSeason,
  getEnrollmentForMembershipInSeason,
} from "./seasons";

function id() {
  return crypto.randomUUID();
}

export async function listTrainingGroups(organizationId: string) {
  return db
    .select()
    .from(trainingGroups)
    .where(eq(trainingGroups.organizationId, organizationId))
    .orderBy(trainingGroups.name);
}

export async function createTrainingGroup(
  organizationId: string,
  name: string,
) {
  const [row] = await db
    .insert(trainingGroups)
    .values({ id: id(), organizationId, name: name.trim() })
    .returning();
  return row;
}

export async function deleteTrainingGroup(
  organizationId: string,
  groupId: string,
) {
  await db
    .update(seasonEnrollments)
    .set({ groupId: null, updatedAt: new Date() })
    .where(eq(seasonEnrollments.groupId, groupId));

  await db
    .delete(trainingGroups)
    .where(
      and(
        eq(trainingGroups.id, groupId),
        eq(trainingGroups.organizationId, organizationId),
      ),
    );
}

async function setEnrollmentGroup(
  seasonId: string,
  membershipId: string,
  groupId: string | null,
) {
  const existing = await getEnrollmentForMembershipInSeason(
    membershipId,
    seasonId,
  );
  if (existing) {
    await db
      .update(seasonEnrollments)
      .set({ groupId, updatedAt: new Date() })
      .where(eq(seasonEnrollments.id, existing.id));
    return;
  }

  await enrollMembershipInSeason(seasonId, {
    membershipId,
    groupId,
  });
}

export async function assignMembershipGroup(
  organizationId: string,
  membershipId: string,
  groupId: string | null,
  seasonId?: string,
) {
  const [membership] = await db
    .select({ id: teamSwimmerMemberships.id })
    .from(teamSwimmerMemberships)
    .where(
      and(
        eq(teamSwimmerMemberships.id, membershipId),
        eq(teamSwimmerMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw tagException(
      new Error("That swimmer is not on this team."),
      "swimmer_missing",
    );
  }

  const season = seasonId
    ? { id: seasonId }
    : await ensureCurrentSeason(organizationId);
  await setEnrollmentGroup(season.id, membershipId, groupId);
}

export async function assignMembershipGroupsBulk(
  organizationId: string,
  membershipIds: string[],
  groupId: string | null,
  seasonId?: string,
) {
  if (membershipIds.length === 0) return;

  const memberships = await db
    .select({ id: teamSwimmerMemberships.id })
    .from(teamSwimmerMemberships)
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        inArray(teamSwimmerMemberships.id, membershipIds),
      ),
    );

  if (memberships.length === 0) return;

  const season = seasonId
    ? { id: seasonId }
    : await ensureCurrentSeason(organizationId);

  for (const membership of memberships) {
    await setEnrollmentGroup(season.id, membership.id, groupId);
  }
}

export async function recordAiGeneration(input: {
  organizationId: string;
  userId?: string;
  kind: "workout" | "relay";
  tokensIn?: number;
  tokensOut?: number;
}) {
  const [row] = await db
    .insert(aiGenerations)
    .values({
      id: id(),
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      kind: input.kind,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    })
    .returning();
  return row;
}

export async function countAiGenerationsThisMonth(organizationId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ value: count() })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.organizationId, organizationId),
        gte(aiGenerations.createdAt, start),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function countAiGenerationsLastMinutes(
  organizationId: string,
  minutes: number,
) {
  const since = new Date(Date.now() - minutes * 60_000);
  const [row] = await db
    .select({ value: count() })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.organizationId, organizationId),
        gte(aiGenerations.createdAt, since),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function listRecentAiGenerations(
  organizationId: string,
  limit = 20,
) {
  return db
    .select()
    .from(aiGenerations)
    .where(eq(aiGenerations.organizationId, organizationId))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(limit);
}
