import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  maappAcknowledgments,
  member,
  safesportReports,
  seasonEnrollments,
  staffCredentials,
  swimmers,
  teamSwimmerMemberships,
} from "../schema/index";
import { ensureCurrentSeason } from "./seasons";

function generateId(): string {
  return crypto.randomUUID();
}

async function resolveSeasonIdForMembership(
  membershipId: string,
  seasonId?: string,
): Promise<string> {
  if (seasonId) return seasonId;

  const [membership] = await db
    .select({ organizationId: teamSwimmerMemberships.organizationId })
    .from(teamSwimmerMemberships)
    .where(eq(teamSwimmerMemberships.id, membershipId))
    .limit(1);

  if (!membership) {
    throw new Error(`Membership not found: ${membershipId}`);
  }

  return (await ensureCurrentSeason(membership.organizationId)).id;
}

const SAFESPORT_TYPES = [
  "safesport_core",
  "safesport_refresher_1",
  "safesport_refresher_2",
  "safesport_refresher_3",
] as const;

export async function getStaffCredentials(organizationId: string) {
  return db
    .select({
      id: staffCredentials.id,
      memberId: staffCredentials.memberId,
      userId: member.userId,
      role: member.role,
      credentialType: staffCredentials.credentialType,
      status: staffCredentials.status,
      completedAt: staffCredentials.completedAt,
      expiresAt: staffCredentials.expiresAt,
      verifiedBy: staffCredentials.verifiedBy,
      documentUrl: staffCredentials.documentUrl,
    })
    .from(staffCredentials)
    .innerJoin(member, eq(staffCredentials.memberId, member.id))
    .where(eq(member.organizationId, organizationId));
}

export async function upsertStaffCredential(data: {
  memberId: string;
  credentialType:
    | (typeof SAFESPORT_TYPES)[number]
    | "background_check"
    | "cpr_aed"
    | "stsc";
  status: "current" | "expired" | "pending" | "not_started";
  completedAt?: Date;
  expiresAt?: Date;
  documentUrl?: string;
}) {
  const existing = await db
    .select({ id: staffCredentials.id })
    .from(staffCredentials)
    .where(
      and(
        eq(staffCredentials.memberId, data.memberId),
        eq(staffCredentials.credentialType, data.credentialType),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(staffCredentials)
      .set({
        status: data.status,
        completedAt: data.completedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        documentUrl: data.documentUrl ?? null,
        verifiedBy: "manual_upload",
        updatedAt: new Date(),
      })
      .where(eq(staffCredentials.id, existing[0].id));
    return existing[0].id;
  }

  const id = generateId();
  await db.insert(staffCredentials).values({
    id,
    memberId: data.memberId,
    credentialType: data.credentialType,
    status: data.status,
    completedAt: data.completedAt ?? null,
    expiresAt: data.expiresAt ?? null,
    documentUrl: data.documentUrl ?? null,
    verifiedBy: "manual_upload",
  });
  return id;
}

export async function getComplianceSummary(organizationId: string) {
  const season = await ensureCurrentSeason(organizationId);
  const now = new Date();

  const credentials = await getStaffCredentials(organizationId);
  const coachesNeedingTraining = credentials.filter(
    (c) =>
      (SAFESPORT_TYPES as readonly string[]).includes(c.credentialType) &&
      (c.status !== "current" || (c.expiresAt && c.expiresAt <= now)),
  );

  const memberIds = [...new Set(credentials.map((c) => c.memberId))];
  const membersWithoutTraining = memberIds.filter((memberId) => {
    const memberCreds = credentials.filter((m) => m.memberId === memberId);
    return !memberCreds.some(
      (c) =>
        (SAFESPORT_TYPES as readonly string[]).includes(c.credentialType) &&
        c.status === "current" &&
        (!c.expiresAt || c.expiresAt > now),
    );
  });

  const [ackStats] = await db
    .select({
      total: sql<number>`count(distinct ${teamSwimmerMemberships.id})::int`,
      acknowledged: sql<number>`count(distinct case when ${maappAcknowledgments.id} is not null then ${teamSwimmerMemberships.id} end)::int`,
    })
    .from(seasonEnrollments)
    .innerJoin(
      teamSwimmerMemberships,
      eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
    )
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .leftJoin(
      maappAcknowledgments,
      and(
        eq(maappAcknowledgments.membershipId, teamSwimmerMemberships.id),
        eq(maappAcknowledgments.seasonId, season.id),
      ),
    )
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(seasonEnrollments.seasonId, season.id),
        eq(seasonEnrollments.status, "active"),
        sql`date_part('year', age(${swimmers.dateOfBirth})) < 18`,
      ),
    );

  const openReports = await db
    .select({ id: safesportReports.id })
    .from(safesportReports)
    .where(
      and(
        eq(safesportReports.organizationId, organizationId),
        inArray(safesportReports.status, ["submitted", "under_review"]),
      ),
    );

  return {
    seasonId: season.id,
    seasonYear: season.label,
    coachesNeedingTraining: membersWithoutTraining.length,
    minorAckTotal: ackStats?.total ?? 0,
    minorAckCompleted: ackStats?.acknowledged ?? 0,
    openReports: openReports.length,
    expiringCredentials: coachesNeedingTraining.length,
  };
}

export async function createMaappAcknowledgment(data: {
  membershipId: string;
  acknowledgedBy: "parent_guardian" | "athlete" | "adult_athlete";
  signerName: string;
  signerEmail: string;
  seasonId?: string;
  documentVersion?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const seasonId = await resolveSeasonIdForMembership(
    data.membershipId,
    data.seasonId,
  );
  const id = generateId();
  await db.insert(maappAcknowledgments).values({
    id,
    membershipId: data.membershipId,
    seasonId,
    acknowledgedBy: data.acknowledgedBy,
    signerName: data.signerName,
    signerEmail: data.signerEmail,
    documentVersion: data.documentVersion ?? "2025",
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
  });
  return id;
}

export async function getMaappAcknowledgment(
  membershipId: string,
  seasonId?: string,
) {
  const resolvedSeasonId = await resolveSeasonIdForMembership(
    membershipId,
    seasonId,
  );
  const [row] = await db
    .select()
    .from(maappAcknowledgments)
    .where(
      and(
        eq(maappAcknowledgments.membershipId, membershipId),
        eq(maappAcknowledgments.seasonId, resolvedSeasonId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createSafesportReport(data: {
  organizationId: string;
  reportedByUserId: string;
  subjectDescription: string;
  category:
    | "emotional_misconduct"
    | "physical_misconduct"
    | "sexual_misconduct"
    | "maapp_violation"
    | "other";
}) {
  const id = generateId();
  await db.insert(safesportReports).values({
    id,
    organizationId: data.organizationId,
    reportedByUserId: data.reportedByUserId,
    subjectDescription: data.subjectDescription,
    category: data.category,
    status: "submitted",
  });
  return id;
}

export async function getSafesportReports(organizationId: string) {
  return db
    .select()
    .from(safesportReports)
    .where(eq(safesportReports.organizationId, organizationId))
    .orderBy(sql`${safesportReports.createdAt} desc`);
}

export async function getCoachSafeSportStatus(memberId: string) {
  const now = new Date();
  const [row] = await db
    .select({
      credentialType: staffCredentials.credentialType,
      status: staffCredentials.status,
      expiresAt: staffCredentials.expiresAt,
    })
    .from(staffCredentials)
    .where(
      and(
        eq(staffCredentials.memberId, memberId),
        inArray(staffCredentials.credentialType, [...SAFESPORT_TYPES]),
        eq(staffCredentials.status, "current"),
        or(
          isNull(staffCredentials.expiresAt),
          gt(staffCredentials.expiresAt, now),
        ),
      ),
    )
    .limit(1);

  return row ?? null;
}
