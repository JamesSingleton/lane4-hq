import { isMinorSwimmer } from "@lane4hq/swim-core/age";
import {
  normalizeDateOfBirth,
  swimmerIdentitiesMatch,
} from "@lane4hq/swim-core/people";
import { parseClassYear, parseTeamType } from "@lane4hq/swim-core/team-types";
import type {
  RosterRow,
  SwimmerContactsInput,
  SwimmerMedicalInput,
} from "@lane4hq/swim-core/validators";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "../client";
import { member, organization } from "../schema/auth";
import { trainingGroups } from "../schema/groups";
import { seasonEnrollments } from "../schema/seasons";
import {
  swimmerClubRegistrations,
  swimmerContacts,
  swimmerMedical,
  swimmers,
  teamSwimmerMemberships,
} from "../schema/swimmers";
import {
  enrollMembershipInSeason,
  ensureCurrentSeason,
  getEnrollmentForMembershipInSeason,
  updateSeasonEnrollment,
} from "./seasons";
import {
  findTeamSwimmersMatchingIdentity,
  mergeSwimmerRecords,
} from "./swimmer-merge";

export type RosterSortId =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "gender"
  | "status"
  | "classYear"
  | "groupName"
  | "usaId";

export type RosterPageInput = {
  seasonId?: string;
  q?: string;
  status?: string[];
  gender?: string[];
  groupId?: string[];
  classYear?: string[];
  sort?: { id: string; desc: boolean }[];
  page?: number;
  perPage?: number;
};

export type RosterRowResult = {
  membershipId: string;
  enrollmentId: string;
  seasonId: string;
  swimmerId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female";
  governingBodyId: string | null;
  practiceGroup: string | null;
  trainingGroups: string[] | null;
  groupId: string | null;
  groupName: string | null;
  classYear: string | null;
  academicStanding: string | null;
  eligibilityStatus:
    | "competing"
    | "redshirt"
    | "medical"
    | "exhausted"
    | "ineligible"
    | "other"
    | null;
  seasonsOfCompetitionUsed: number | null;
  eligibilityNotes: string | null;
  status: "active" | "inactive";
  joinedAt: Date;
};

export type UpdateSwimmerInput = Partial<RosterRow> & {
  groupId?: string | null;
  academicStanding?: string | null;
  eligibilityStatus?: string | null;
  seasonsOfCompetitionUsed?: number | null;
  eligibilityNotes?: string | null;
  seasonId?: string;
};

const rosterSelect = {
  membershipId: teamSwimmerMemberships.id,
  enrollmentId: seasonEnrollments.id,
  seasonId: seasonEnrollments.seasonId,
  swimmerId: swimmers.id,
  firstName: swimmers.firstName,
  middleName: swimmers.middleName,
  lastName: swimmers.lastName,
  preferredName: swimmers.preferredName,
  dateOfBirth: swimmers.dateOfBirth,
  gender: swimmers.gender,
  governingBodyId: swimmers.governingBodyId,
  practiceGroup: teamSwimmerMemberships.practiceGroup,
  trainingGroups: teamSwimmerMemberships.trainingGroups,
  groupId: seasonEnrollments.groupId,
  groupName: trainingGroups.name,
  classYear: seasonEnrollments.classYear,
  academicStanding: seasonEnrollments.academicStanding,
  eligibilityStatus: seasonEnrollments.eligibilityStatus,
  seasonsOfCompetitionUsed: seasonEnrollments.seasonsOfCompetitionUsed,
  eligibilityNotes: seasonEnrollments.eligibilityNotes,
  status: seasonEnrollments.status,
  joinedAt: seasonEnrollments.joinedAt,
};

async function resolveSeasonId(
  organizationId: string,
  seasonId?: string,
): Promise<string> {
  if (seasonId) return seasonId;
  const season = await ensureCurrentSeason(organizationId);
  return season.id;
}

function buildRosterWhere(
  organizationId: string,
  seasonId: string,
  input: RosterPageInput = {},
): SQL | undefined {
  const conditions: SQL[] = [
    eq(teamSwimmerMemberships.organizationId, organizationId),
    eq(seasonEnrollments.seasonId, seasonId),
  ];

  const statuses = input.status?.filter(Boolean);
  if (statuses && statuses.length > 0) {
    conditions.push(
      inArray(seasonEnrollments.status, statuses as ("active" | "inactive")[]),
    );
  } else {
    conditions.push(eq(seasonEnrollments.status, "active"));
  }

  const genders = input.gender?.filter(Boolean);
  if (genders && genders.length > 0) {
    conditions.push(inArray(swimmers.gender, genders as ("male" | "female")[]));
  }

  const groupIds = input.groupId?.filter(Boolean);
  if (groupIds && groupIds.length > 0) {
    const includeUnassigned = groupIds.includes("none");
    const realGroupIds = groupIds.filter((id) => id !== "none");
    const groupConditions: SQL[] = [];
    if (realGroupIds.length > 0) {
      groupConditions.push(inArray(seasonEnrollments.groupId, realGroupIds));
    }
    if (includeUnassigned) {
      groupConditions.push(isNull(seasonEnrollments.groupId));
    }
    if (groupConditions.length === 1) {
      conditions.push(groupConditions[0]!);
    } else if (groupConditions.length > 1) {
      conditions.push(or(...groupConditions)!);
    }
  }

  const classYears = input.classYear?.filter(Boolean);
  if (classYears && classYears.length > 0) {
    conditions.push(inArray(seasonEnrollments.classYear, classYears));
  }

  const q = input.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(swimmers.firstName, pattern),
        ilike(swimmers.lastName, pattern),
        ilike(swimmers.preferredName, pattern),
      )!,
    );
  }

  return and(...conditions);
}

function buildRosterOrderBy(sort?: { id: string; desc: boolean }[]) {
  if (!sort || sort.length === 0) {
    return [asc(swimmers.lastName), asc(swimmers.firstName)];
  }

  const orderBy = sort.flatMap((item) => {
    const direction = item.desc ? desc : asc;
    switch (item.id) {
      case "firstName":
        return [direction(swimmers.firstName)];
      case "lastName":
        return [direction(swimmers.lastName)];
      case "dateOfBirth":
      case "age":
        return [direction(swimmers.dateOfBirth)];
      case "gender":
        return [direction(swimmers.gender)];
      case "status":
        return [direction(seasonEnrollments.status)];
      case "classYear":
        return [direction(seasonEnrollments.classYear)];
      case "groupId":
      case "groupName":
      case "trainingGroup":
        return [direction(trainingGroups.name)];
      case "usaId":
        return [direction(swimmers.governingBodyId)];
      default:
        return [];
    }
  });

  return orderBy.length > 0
    ? orderBy
    : [asc(swimmers.lastName), asc(swimmers.firstName)];
}

function generateId(): string {
  return crypto.randomUUID();
}

function resolveGoverningBodyId(data: RosterRow): string | undefined {
  return data.governingBodyId ?? data.usaMemberId ?? undefined;
}

function resolveClassYear(data: RosterRow): string | null {
  return parseClassYear(data.classYear) ?? null;
}

function resolveGroupId(
  data: RosterRow | UpdateSwimmerInput,
): string | null | undefined {
  if (!("groupId" in data)) return undefined;
  return data.groupId ?? null;
}

async function upsertMembershipContacts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  membershipId: string,
  contacts?: SwimmerContactsInput,
) {
  if (!contacts) return;

  const values = {
    parentName: contacts.parentName ?? null,
    parentEmail: contacts.parentEmail || null,
    parentPhone: contacts.parentPhone ?? null,
    emergencyName: contacts.emergencyName ?? null,
    emergencyPhone: contacts.emergencyPhone ?? null,
    addressLine1: contacts.addressLine1 ?? null,
    addressLine2: contacts.addressLine2 ?? null,
    city: contacts.city ?? null,
    state: contacts.state ?? null,
    postalCode: contacts.postalCode ?? null,
    country: contacts.country ?? null,
    minorDirectContactConsent: contacts.minorDirectContactConsent ?? false,
    minorDirectContactConsentedAt: contacts.minorDirectContactConsent
      ? new Date()
      : null,
    minorDirectContactConsentedBy:
      contacts.minorDirectContactConsentedBy ?? null,
    updatedAt: new Date(),
  };

  await tx
    .insert(swimmerContacts)
    .values({ membershipId, ...values })
    .onConflictDoUpdate({
      target: swimmerContacts.membershipId,
      set: values,
    });
}

async function upsertMembershipMedical(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  membershipId: string,
  medical?: SwimmerMedicalInput,
) {
  if (!medical) return;

  const values = {
    allergies: medical.allergies ?? null,
    medications: medical.medications ?? null,
    conditions: medical.conditions ?? null,
    notes: medical.notes ?? null,
    updatedAt: new Date(),
  };

  await tx
    .insert(swimmerMedical)
    .values({ membershipId, ...values })
    .onConflictDoUpdate({
      target: swimmerMedical.membershipId,
      set: values,
    });
}

export async function findSwimmerByGoverningBodyId(governingBodyId: string) {
  const [row] = await db
    .select()
    .from(swimmers)
    .where(eq(swimmers.governingBodyId, governingBodyId))
    .limit(1);
  return row ?? null;
}

export type LinkableSwimmerMatch = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string;
  governingBodyId: string | null;
  /** Other teams (visible to this coach) where this person already has a membership. */
  teamNames: string[];
};

/**
 * Coach-scoped name+DOB matches for cross-team linking without USA Swimming ID.
 * Only returns people already on teams the viewer belongs to, excluding anyone
 * already on the target team.
 */
export async function findLinkableSwimmersForCoach(input: {
  viewerUserId: string;
  targetOrganizationId: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dateOfBirth: string;
}): Promise<LinkableSwimmerMatch[]> {
  const dob = normalizeDateOfBirth(input.dateOfBirth);
  if (!dob || !input.firstName.trim() || !input.lastName.trim()) {
    return [];
  }

  const rows = await db
    .select({
      id: swimmers.id,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      preferredName: swimmers.preferredName,
      dateOfBirth: swimmers.dateOfBirth,
      governingBodyId: swimmers.governingBodyId,
      teamId: organization.id,
      teamName: organization.name,
    })
    .from(swimmers)
    .innerJoin(
      teamSwimmerMemberships,
      eq(teamSwimmerMemberships.swimmerId, swimmers.id),
    )
    .innerJoin(
      organization,
      eq(organization.id, teamSwimmerMemberships.organizationId),
    )
    .innerJoin(
      member,
      and(
        eq(member.organizationId, teamSwimmerMemberships.organizationId),
        eq(member.userId, input.viewerUserId),
      ),
    )
    .where(eq(swimmers.dateOfBirth, dob));

  const alreadyOnTarget = new Set(
    rows
      .filter((row) => row.teamId === input.targetOrganizationId)
      .map((row) => row.id),
  );

  const byId = new Map<string, LinkableSwimmerMatch>();
  for (const row of rows) {
    if (alreadyOnTarget.has(row.id)) continue;
    if (row.teamId === input.targetOrganizationId) continue;

    if (
      !swimmerIdentitiesMatch(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          preferredName: input.preferredName,
          dateOfBirth: dob,
        },
        {
          firstName: row.firstName,
          lastName: row.lastName,
          preferredName: row.preferredName,
          dateOfBirth: row.dateOfBirth,
        },
      )
    ) {
      continue;
    }

    const existing = byId.get(row.id);
    if (existing) {
      if (!existing.teamNames.includes(row.teamName)) {
        existing.teamNames.push(row.teamName);
      }
      continue;
    }

    byId.set(row.id, {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      preferredName: row.preferredName,
      dateOfBirth: row.dateOfBirth,
      governingBodyId: row.governingBodyId,
      teamNames: [row.teamName],
    });
  }

  return [...byId.values()];
}

export async function getRoster(organizationId: string, seasonId?: string) {
  const resolvedSeasonId = await resolveSeasonId(organizationId, seasonId);

  const rows = await db
    .select(rosterSelect)
    .from(teamSwimmerMemberships)
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .innerJoin(
      seasonEnrollments,
      and(
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
        eq(seasonEnrollments.seasonId, resolvedSeasonId),
      ),
    )
    .leftJoin(trainingGroups, eq(seasonEnrollments.groupId, trainingGroups.id))
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(seasonEnrollments.status, "active"),
      ),
    );

  return rows;
}

export async function getRosterPage(
  organizationId: string,
  input: RosterPageInput = {},
): Promise<{
  data: RosterRowResult[];
  pageCount: number;
  total: number;
}> {
  const resolvedSeasonId = await resolveSeasonId(
    organizationId,
    input.seasonId,
  );
  const page = Math.max(1, input.page ?? 1);
  const perPage = Math.min(100, Math.max(1, input.perPage ?? 10));
  const offset = (page - 1) * perPage;
  const where = buildRosterWhere(organizationId, resolvedSeasonId, input);
  const orderBy = buildRosterOrderBy(input.sort);

  try {
    const [data, countRows] = await Promise.all([
      db
        .select(rosterSelect)
        .from(teamSwimmerMemberships)
        .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
        .innerJoin(
          seasonEnrollments,
          and(
            eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
            eq(seasonEnrollments.seasonId, resolvedSeasonId),
          ),
        )
        .leftJoin(
          trainingGroups,
          eq(seasonEnrollments.groupId, trainingGroups.id),
        )
        .where(where)
        .orderBy(...orderBy)
        .limit(perPage)
        .offset(offset),
      db
        .select({ total: count() })
        .from(teamSwimmerMemberships)
        .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
        .innerJoin(
          seasonEnrollments,
          and(
            eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
            eq(seasonEnrollments.seasonId, resolvedSeasonId),
          ),
        )
        .leftJoin(
          trainingGroups,
          eq(seasonEnrollments.groupId, trainingGroups.id),
        )
        .where(where),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return {
      data: data as RosterRowResult[],
      total,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  } catch {
    return { data: [], total: 0, pageCount: 0 };
  }
}

export async function getRosterFacetCounts(
  organizationId: string,
  seasonId?: string,
) {
  const resolvedSeasonId = await resolveSeasonId(organizationId, seasonId);
  const baseWhere = and(
    eq(teamSwimmerMemberships.organizationId, organizationId),
    eq(seasonEnrollments.seasonId, resolvedSeasonId),
  );
  const activeWhere = and(baseWhere, eq(seasonEnrollments.status, "active"));

  const [statusRows, genderRows, groupRows, classYearRows] = await Promise.all([
    db
      .select({
        value: seasonEnrollments.status,
        count: count(),
      })
      .from(seasonEnrollments)
      .innerJoin(
        teamSwimmerMemberships,
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
      )
      .where(baseWhere)
      .groupBy(seasonEnrollments.status),
    db
      .select({
        value: swimmers.gender,
        count: count(),
      })
      .from(seasonEnrollments)
      .innerJoin(
        teamSwimmerMemberships,
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
      )
      .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
      .where(activeWhere)
      .groupBy(swimmers.gender),
    db
      .select({
        value: seasonEnrollments.groupId,
        name: trainingGroups.name,
        count: count(),
      })
      .from(seasonEnrollments)
      .innerJoin(
        teamSwimmerMemberships,
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
      )
      .leftJoin(
        trainingGroups,
        eq(seasonEnrollments.groupId, trainingGroups.id),
      )
      .where(activeWhere)
      .groupBy(seasonEnrollments.groupId, trainingGroups.name),
    db
      .select({
        value: seasonEnrollments.classYear,
        count: count(),
      })
      .from(seasonEnrollments)
      .innerJoin(
        teamSwimmerMemberships,
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
      )
      .where(activeWhere)
      .groupBy(seasonEnrollments.classYear),
  ]);

  const status: Record<string, number> = {};
  for (const row of statusRows) {
    status[row.value] = Number(row.count);
  }

  const gender: Record<string, number> = {};
  for (const row of genderRows) {
    gender[row.value] = Number(row.count);
  }

  const groupId: Record<string, number> = {};
  for (const row of groupRows) {
    groupId[row.value ?? "none"] = Number(row.count);
  }

  const groups = groupRows
    .map((row) => ({
      id: row.value ?? "none",
      name: row.name?.trim() || "Ungrouped",
      count: Number(row.count),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const classYear: Record<string, number> = {};
  for (const row of classYearRows) {
    if (row.value) classYear[row.value] = Number(row.count);
  }

  return {
    status,
    gender,
    groupId,
    groups,
    classYear,
    totalActive: status.active ?? 0,
    maleActive: gender.male ?? 0,
    femaleActive: gender.female ?? 0,
  };
}

export async function getRosterForExport(
  organizationId: string,
  input: RosterPageInput & { swimmerIds?: string[] } = {},
) {
  const resolvedSeasonId = await resolveSeasonId(
    organizationId,
    input.seasonId,
  );
  const where = buildRosterWhere(organizationId, resolvedSeasonId, input);
  const conditions: SQL[] = where ? [where] : [];
  if (input.swimmerIds && input.swimmerIds.length > 0) {
    conditions.push(inArray(swimmers.id, input.swimmerIds));
  }

  return db
    .select(rosterSelect)
    .from(teamSwimmerMemberships)
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .innerJoin(
      seasonEnrollments,
      and(
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
        eq(seasonEnrollments.seasonId, resolvedSeasonId),
      ),
    )
    .leftJoin(trainingGroups, eq(seasonEnrollments.groupId, trainingGroups.id))
    .where(and(...conditions))
    .orderBy(...buildRosterOrderBy(input.sort));
}

export async function getSwimmerById(
  swimmerId: string,
  organizationId: string,
  seasonId?: string,
) {
  const resolvedSeasonId = await resolveSeasonId(organizationId, seasonId);

  const [row] = await db
    .select({
      membershipId: teamSwimmerMemberships.id,
      enrollmentId: seasonEnrollments.id,
      seasonId: seasonEnrollments.seasonId,
      swimmerId: swimmers.id,
      firstName: swimmers.firstName,
      middleName: swimmers.middleName,
      lastName: swimmers.lastName,
      preferredName: swimmers.preferredName,
      dateOfBirth: swimmers.dateOfBirth,
      gender: swimmers.gender,
      email: swimmers.email,
      phone: swimmers.phone,
      governingBody: swimmers.governingBody,
      governingBodyId: swimmers.governingBodyId,
      practiceGroup: teamSwimmerMemberships.practiceGroup,
      trainingGroups: teamSwimmerMemberships.trainingGroups,
      groupId: seasonEnrollments.groupId,
      groupName: trainingGroups.name,
      classYear: seasonEnrollments.classYear,
      academicStanding: seasonEnrollments.academicStanding,
      eligibilityStatus: seasonEnrollments.eligibilityStatus,
      seasonsOfCompetitionUsed: seasonEnrollments.seasonsOfCompetitionUsed,
      eligibilityNotes: seasonEnrollments.eligibilityNotes,
      status: seasonEnrollments.status,
      joinedAt: seasonEnrollments.joinedAt,
    })
    .from(teamSwimmerMemberships)
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .leftJoin(
      seasonEnrollments,
      and(
        eq(seasonEnrollments.membershipId, teamSwimmerMemberships.id),
        eq(seasonEnrollments.seasonId, resolvedSeasonId),
      ),
    )
    .leftJoin(trainingGroups, eq(seasonEnrollments.groupId, trainingGroups.id))
    .where(
      and(
        eq(swimmers.id, swimmerId),
        eq(teamSwimmerMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getSwimmerContactsByMembership(
  organizationId: string,
  membershipIds: string[],
) {
  if (membershipIds.length === 0) return [];
  return db
    .select({
      membershipId: swimmerContacts.membershipId,
      parentName: swimmerContacts.parentName,
      parentEmail: swimmerContacts.parentEmail,
      parentPhone: swimmerContacts.parentPhone,
      emergencyPhone: swimmerContacts.emergencyPhone,
      addressLine1: swimmerContacts.addressLine1,
      addressLine2: swimmerContacts.addressLine2,
      city: swimmerContacts.city,
      state: swimmerContacts.state,
      postalCode: swimmerContacts.postalCode,
      country: swimmerContacts.country,
    })
    .from(swimmerContacts)
    .innerJoin(
      teamSwimmerMemberships,
      eq(swimmerContacts.membershipId, teamSwimmerMemberships.id),
    )
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        inArray(swimmerContacts.membershipId, membershipIds),
      ),
    );
}

export async function getSwimmerContactsForMembership(
  membershipId: string,
  organizationId: string,
) {
  const [row] = await db
    .select({
      membershipId: swimmerContacts.membershipId,
      parentName: swimmerContacts.parentName,
      parentEmail: swimmerContacts.parentEmail,
      parentPhone: swimmerContacts.parentPhone,
      emergencyName: swimmerContacts.emergencyName,
      emergencyPhone: swimmerContacts.emergencyPhone,
      addressLine1: swimmerContacts.addressLine1,
      addressLine2: swimmerContacts.addressLine2,
      city: swimmerContacts.city,
      state: swimmerContacts.state,
      postalCode: swimmerContacts.postalCode,
      country: swimmerContacts.country,
      minorDirectContactConsent: swimmerContacts.minorDirectContactConsent,
    })
    .from(swimmerContacts)
    .innerJoin(
      teamSwimmerMemberships,
      eq(swimmerContacts.membershipId, teamSwimmerMemberships.id),
    )
    .where(
      and(
        eq(swimmerContacts.membershipId, membershipId),
        eq(teamSwimmerMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getSwimmerMedicalForMembership(
  membershipId: string,
  organizationId: string,
) {
  const [row] = await db
    .select({
      membershipId: swimmerMedical.membershipId,
      allergies: swimmerMedical.allergies,
      medications: swimmerMedical.medications,
      conditions: swimmerMedical.conditions,
      notes: swimmerMedical.notes,
    })
    .from(swimmerMedical)
    .innerJoin(
      teamSwimmerMemberships,
      eq(swimmerMedical.membershipId, teamSwimmerMemberships.id),
    )
    .where(
      and(
        eq(swimmerMedical.membershipId, membershipId),
        eq(teamSwimmerMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getSwimmerAffiliations(
  swimmerId: string,
  viewerUserId: string,
) {
  const rows = await db
    .select({
      organizationId: organization.id,
      name: organization.name,
      teamType: organization.teamType,
      status: teamSwimmerMemberships.status,
      practiceGroup: teamSwimmerMemberships.practiceGroup,
      role: member.role,
    })
    .from(teamSwimmerMemberships)
    .innerJoin(
      organization,
      eq(teamSwimmerMemberships.organizationId, organization.id),
    )
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, viewerUserId),
      ),
    )
    .where(eq(teamSwimmerMemberships.swimmerId, swimmerId));

  return rows.map((row) => ({
    organizationId: row.organizationId,
    name: row.name,
    teamType: parseTeamType(row.teamType),
    status: row.status,
    practiceGroup: row.practiceGroup,
  }));
}

export async function getClubRegistrationForMembership(
  membershipId: string,
  organizationId: string,
) {
  const [row] = await db
    .select({
      id: swimmerClubRegistrations.id,
      usaMemberId: swimmerClubRegistrations.usaMemberId,
      clubId: swimmerClubRegistrations.clubId,
      registrationStatus: swimmerClubRegistrations.registrationStatus,
      lastSyncedAt: swimmerClubRegistrations.lastSyncedAt,
    })
    .from(swimmerClubRegistrations)
    .innerJoin(
      teamSwimmerMemberships,
      eq(swimmerClubRegistrations.membershipId, teamSwimmerMemberships.id),
    )
    .where(
      and(
        eq(swimmerClubRegistrations.membershipId, membershipId),
        eq(teamSwimmerMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Aggregate SWIMS sync health for the team dashboard widget. */
export async function getSwimsDashboardSummary(organizationId: string) {
  const [usasMembers, notInCommit, inactiveInCommit, nonAthletes] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(swimmerClubRegistrations)
        .innerJoin(
          teamSwimmerMemberships,
          eq(swimmerClubRegistrations.membershipId, teamSwimmerMemberships.id),
        )
        .where(
          and(
            eq(teamSwimmerMemberships.organizationId, organizationId),
            eq(teamSwimmerMemberships.status, "active"),
            isNull(teamSwimmerMemberships.leftAt),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(teamSwimmerMemberships)
        .leftJoin(
          swimmerClubRegistrations,
          eq(swimmerClubRegistrations.membershipId, teamSwimmerMemberships.id),
        )
        .where(
          and(
            eq(teamSwimmerMemberships.organizationId, organizationId),
            eq(teamSwimmerMemberships.status, "active"),
            isNull(teamSwimmerMemberships.leftAt),
            isNull(swimmerClubRegistrations.id),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(swimmerClubRegistrations)
        .innerJoin(
          teamSwimmerMemberships,
          eq(swimmerClubRegistrations.membershipId, teamSwimmerMemberships.id),
        )
        .where(
          and(
            eq(teamSwimmerMemberships.organizationId, organizationId),
            eq(teamSwimmerMemberships.status, "inactive"),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0)),
      db
        .select({ count: count() })
        .from(member)
        .where(eq(member.organizationId, organizationId))
        .then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

  const [latestSync] = await db
    .select({ lastSyncedAt: swimmerClubRegistrations.lastSyncedAt })
    .from(swimmerClubRegistrations)
    .innerJoin(
      teamSwimmerMemberships,
      eq(swimmerClubRegistrations.membershipId, teamSwimmerMemberships.id),
    )
    .where(eq(teamSwimmerMemberships.organizationId, organizationId))
    .orderBy(desc(swimmerClubRegistrations.lastSyncedAt))
    .limit(1);

  return {
    usasMembers,
    notInCommit,
    inactiveInCommit,
    nonAthletes,
    lastSyncedAt: latestSync?.lastSyncedAt ?? null,
  };
}

async function enrollInCurrentSeason(
  organizationId: string,
  membershipId: string,
  data: RosterRow | UpdateSwimmerInput,
) {
  const season = await ensureCurrentSeason(organizationId);
  const groupId = resolveGroupId(data);
  await enrollMembershipInSeason(season.id, {
    membershipId,
    classYear: resolveClassYear(data as RosterRow),
    groupId: groupId === undefined ? null : groupId,
    academicStanding:
      "academicStanding" in data ? (data.academicStanding ?? null) : null,
    eligibilityStatus:
      "eligibilityStatus" in data ? (data.eligibilityStatus ?? null) : null,
    seasonsOfCompetitionUsed:
      "seasonsOfCompetitionUsed" in data
        ? (data.seasonsOfCompetitionUsed ?? null)
        : null,
    eligibilityNotes:
      "eligibilityNotes" in data ? (data.eligibilityNotes ?? null) : null,
  });
  return season.id;
}

/**
 * Marks a membership active again and makes sure it has an active enrollment
 * in the target season. Prior-season enrollments are left untouched.
 */
async function restoreMembership(
  organizationId: string,
  membershipId: string,
  options?: { seasonId?: string; data?: RosterRow },
) {
  await db
    .update(teamSwimmerMemberships)
    .set({ status: "active", leftAt: null, updatedAt: new Date() })
    .where(eq(teamSwimmerMemberships.id, membershipId));

  const seasonId = await resolveSeasonId(organizationId, options?.seasonId);
  const enrollment = await getEnrollmentForMembershipInSeason(
    membershipId,
    seasonId,
  );
  const data = options?.data;

  if (!enrollment) {
    const groupId = data ? resolveGroupId(data) : undefined;
    await enrollMembershipInSeason(seasonId, {
      membershipId,
      classYear: data ? resolveClassYear(data) : null,
      groupId: groupId ?? null,
    });
    return seasonId;
  }

  const groupId = data ? resolveGroupId(data) : undefined;
  const classYear = data ? resolveClassYear(data) : null;
  await updateSeasonEnrollment(enrollment.id, organizationId, {
    status: "active",
    leftAt: null,
    ...(groupId !== undefined && { groupId }),
    ...(classYear && { classYear }),
  });
  return seasonId;
}

export type ReactivateSwimmerResult =
  | { status: "reactivated"; swimmerId: string; membershipId: string }
  | { status: "already_active"; swimmerId: string; membershipId: string }
  | { status: "not_found"; swimmerId: string };

/** Brings an archived swimmer back onto the team for the given (default current) season. */
export async function reactivateSwimmerOnTeam(
  swimmerId: string,
  organizationId: string,
  options?: { seasonId?: string },
): Promise<ReactivateSwimmerResult> {
  const [membership] = await db
    .select({
      id: teamSwimmerMemberships.id,
      status: teamSwimmerMemberships.status,
    })
    .from(teamSwimmerMemberships)
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(teamSwimmerMemberships.swimmerId, swimmerId),
      ),
    )
    .limit(1);

  if (!membership) return { status: "not_found", swimmerId };

  if (membership.status === "active") {
    const seasonId = await resolveSeasonId(organizationId, options?.seasonId);
    const enrollment = await getEnrollmentForMembershipInSeason(
      membership.id,
      seasonId,
    );
    if (enrollment?.status === "active") {
      return {
        status: "already_active",
        swimmerId,
        membershipId: membership.id,
      };
    }
  }

  await restoreMembership(organizationId, membership.id, {
    seasonId: options?.seasonId,
  });
  return { status: "reactivated", swimmerId, membershipId: membership.id };
}

export type ArchivedTeamSwimmer = {
  swimmerId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  governingBodyId: string | null;
  leftAt: Date | null;
};

/**
 * Archived (inactive) swimmers on this team who match a USA Swimming ID or
 * name + date of birth. Used so create/import reactivate instead of duplicating.
 */
export async function findArchivedTeamSwimmers(
  organizationId: string,
  identity: {
    governingBodyId?: string | null;
    firstName?: string;
    lastName?: string;
    preferredName?: string | null;
    dateOfBirth?: string | null;
  },
): Promise<ArchivedTeamSwimmer[]> {
  const governingBodyId = identity.governingBodyId?.trim() || null;
  const dateOfBirth = identity.dateOfBirth?.trim()
    ? normalizeDateOfBirth(identity.dateOfBirth)
    : null;
  const firstName = identity.firstName?.trim() ?? "";
  const lastName = identity.lastName?.trim() ?? "";
  const canMatchIdentity = Boolean(firstName && lastName && dateOfBirth);

  if (!governingBodyId && !canMatchIdentity) return [];

  const narrowing: SQL[] = [];
  if (governingBodyId) {
    narrowing.push(eq(swimmers.governingBodyId, governingBodyId));
  }
  if (canMatchIdentity && dateOfBirth) {
    narrowing.push(eq(swimmers.dateOfBirth, dateOfBirth));
  }

  const rows = await db
    .select({
      swimmerId: swimmers.id,
      membershipId: teamSwimmerMemberships.id,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      preferredName: swimmers.preferredName,
      dateOfBirth: swimmers.dateOfBirth,
      governingBodyId: swimmers.governingBodyId,
      leftAt: teamSwimmerMemberships.leftAt,
    })
    .from(teamSwimmerMemberships)
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(teamSwimmerMemberships.status, "inactive"),
        or(...narrowing),
      ),
    )
    .limit(20);

  return rows.filter((row) => {
    if (governingBodyId && row.governingBodyId === governingBodyId) {
      return true;
    }
    if (!canMatchIdentity || !dateOfBirth || !row.dateOfBirth) return false;
    return swimmerIdentitiesMatch(
      {
        firstName,
        lastName,
        preferredName: identity.preferredName ?? null,
        dateOfBirth,
      },
      { ...row, dateOfBirth: row.dateOfBirth },
    );
  });
}

async function reactivateMembershipFromRow(
  organizationId: string,
  swimmerId: string,
  membershipId: string,
  data: RosterRow,
) {
  const governingBodyId = resolveGoverningBodyId(data);

  await db.transaction(async (tx) => {
    if (data.practiceGroup !== undefined || data.trainingGroups !== undefined) {
      await tx
        .update(teamSwimmerMemberships)
        .set({
          ...(data.practiceGroup !== undefined && {
            practiceGroup: data.practiceGroup ?? null,
          }),
          ...(data.trainingGroups !== undefined && {
            trainingGroups: data.trainingGroups ?? [],
          }),
        })
        .where(eq(teamSwimmerMemberships.id, membershipId));
    }

    if (governingBodyId) {
      await tx
        .insert(swimmerClubRegistrations)
        .values({
          id: generateId(),
          membershipId,
          usaMemberId: governingBodyId,
        })
        .onConflictDoNothing();
    }

    await upsertMembershipContacts(tx, membershipId, data.contacts);
    await upsertMembershipMedical(tx, membershipId, data.medical);
  });

  await restoreMembership(organizationId, membershipId, { data });

  return { swimmerId, membershipId, reactivated: true as const };
}

async function createMembershipForTeam(
  organizationId: string,
  swimmerId: string,
  data: RosterRow,
): Promise<{ swimmerId: string; membershipId: string; reactivated?: true }> {
  const [existing] = await db
    .select({
      id: teamSwimmerMemberships.id,
      status: teamSwimmerMemberships.status,
    })
    .from(teamSwimmerMemberships)
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(teamSwimmerMemberships.swimmerId, swimmerId),
      ),
    )
    .limit(1);

  if (existing?.status === "active") {
    throw new Error("Swimmer is already on this team");
  }
  if (existing) {
    return reactivateMembershipFromRow(
      organizationId,
      swimmerId,
      existing.id,
      data,
    );
  }

  const membershipId = generateId();
  const governingBodyId = resolveGoverningBodyId(data);

  await db.transaction(async (tx) => {
    await tx.insert(teamSwimmerMemberships).values({
      id: membershipId,
      organizationId,
      swimmerId,
      practiceGroup: data.practiceGroup ?? null,
      trainingGroups: data.trainingGroups ?? [],
      status: "active",
    });

    if (governingBodyId) {
      await tx.insert(swimmerClubRegistrations).values({
        id: generateId(),
        membershipId,
        usaMemberId: governingBodyId,
      });
    }

    await upsertMembershipContacts(tx, membershipId, data.contacts);
    await upsertMembershipMedical(tx, membershipId, data.medical);
  });

  await enrollInCurrentSeason(organizationId, membershipId, data);

  return { swimmerId, membershipId };
}

export async function addExistingSwimmerToTeam(
  swimmerId: string,
  organizationId: string,
  data: RosterRow,
) {
  const [swimmer] = await db
    .select({ id: swimmers.id })
    .from(swimmers)
    .where(eq(swimmers.id, swimmerId))
    .limit(1);

  if (!swimmer) {
    throw new Error("Swimmer not found");
  }

  return createMembershipForTeam(organizationId, swimmerId, data);
}

export async function addSwimmer(
  organizationId: string,
  data: RosterRow,
  options?: { viewerUserId?: string },
) {
  const governingBodyId = resolveGoverningBodyId(data);

  if (data.linkExistingSwimmerId) {
    return addExistingSwimmerToTeam(
      data.linkExistingSwimmerId,
      organizationId,
      data,
    );
  }

  if (governingBodyId) {
    const existing = await findSwimmerByGoverningBodyId(governingBodyId);
    if (existing) {
      const result = await createMembershipForTeam(
        organizationId,
        existing.id,
        data,
      );
      return { ...result, linkedExisting: true as const };
    }
  }

  if (!data.forceNewPerson) {
    const archived = await findArchivedTeamSwimmers(organizationId, {
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName,
      dateOfBirth: data.dateOfBirth,
    });
    if (archived.length === 1) {
      return reactivateMembershipFromRow(
        organizationId,
        archived[0]!.swimmerId,
        archived[0]!.membershipId,
        data,
      );
    }
  }

  // Unique name+DOB on another team this coach sees → link instead of duplicating.
  if (options?.viewerUserId && !data.forceNewPerson) {
    const matches = await findLinkableSwimmersForCoach({
      viewerUserId: options.viewerUserId,
      targetOrganizationId: organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName,
      dateOfBirth: data.dateOfBirth,
    });
    if (matches.length === 1) {
      const result = await createMembershipForTeam(
        organizationId,
        matches[0]!.id,
        data,
      );
      return { ...result, linkedExisting: true as const };
    }
  }

  const swimmerId = generateId();
  const membershipId = generateId();

  await db.transaction(async (tx) => {
    await tx.insert(swimmers).values({
      id: swimmerId,
      firstName: data.firstName,
      middleName: data.middleName ?? null,
      lastName: data.lastName,
      preferredName: data.preferredName ?? null,
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      email: data.email || null,
      phone: data.phone ?? null,
      governingBody: governingBodyId ? "usa_swimming" : null,
      governingBodyId: governingBodyId ?? null,
    });

    await tx.insert(teamSwimmerMemberships).values({
      id: membershipId,
      organizationId,
      swimmerId,
      practiceGroup: data.practiceGroup ?? null,
      trainingGroups: data.trainingGroups ?? [],
      status: "active",
    });

    if (governingBodyId) {
      await tx.insert(swimmerClubRegistrations).values({
        id: generateId(),
        membershipId,
        usaMemberId: governingBodyId,
      });
    }

    await upsertMembershipContacts(tx, membershipId, data.contacts);
    await upsertMembershipMedical(tx, membershipId, data.medical);
  });

  await enrollInCurrentSeason(organizationId, membershipId, data);

  return { swimmerId, membershipId };
}

export async function updateSwimmer(
  swimmerId: string,
  organizationId: string,
  data: UpdateSwimmerInput,
) {
  const membership = await getSwimmerById(
    swimmerId,
    organizationId,
    data.seasonId,
  );
  if (!membership) return null;

  await db.transaction(async (tx) => {
    if (
      data.firstName ||
      data.lastName ||
      data.middleName !== undefined ||
      data.preferredName !== undefined ||
      data.dateOfBirth ||
      data.gender ||
      data.email !== undefined ||
      data.phone !== undefined
    ) {
      await tx
        .update(swimmers)
        .set({
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.middleName !== undefined && {
            middleName: data.middleName ?? null,
          }),
          ...(data.preferredName !== undefined && {
            preferredName: data.preferredName ?? null,
          }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.dateOfBirth && { dateOfBirth: data.dateOfBirth }),
          ...(data.gender && { gender: data.gender }),
          ...(data.email !== undefined && { email: data.email || null }),
          ...(data.phone !== undefined && { phone: data.phone ?? null }),
          updatedAt: new Date(),
        })
        .where(eq(swimmers.id, swimmerId));
    }

    if (data.practiceGroup !== undefined || data.trainingGroups !== undefined) {
      await tx
        .update(teamSwimmerMemberships)
        .set({
          ...(data.practiceGroup !== undefined && {
            practiceGroup: data.practiceGroup,
          }),
          ...(data.trainingGroups !== undefined && {
            trainingGroups: data.trainingGroups,
          }),
          updatedAt: new Date(),
        })
        .where(eq(teamSwimmerMemberships.id, membership.membershipId));
    }

    if (data.contacts) {
      await upsertMembershipContacts(
        tx,
        membership.membershipId,
        data.contacts,
      );
    }

    if (data.medical) {
      await upsertMembershipMedical(tx, membership.membershipId, data.medical);
    }
  });

  const enrollmentFieldsChanged =
    data.classYear !== undefined ||
    data.groupId !== undefined ||
    data.academicStanding !== undefined ||
    data.eligibilityStatus !== undefined ||
    data.seasonsOfCompetitionUsed !== undefined ||
    data.eligibilityNotes !== undefined;

  if (enrollmentFieldsChanged) {
    const resolvedSeasonId = await resolveSeasonId(
      organizationId,
      data.seasonId,
    );
    let enrollmentId = membership.enrollmentId;

    if (!enrollmentId) {
      enrollmentId = await enrollMembershipInSeason(resolvedSeasonId, {
        membershipId: membership.membershipId,
        classYear: data.classYear ?? null,
        groupId: data.groupId ?? null,
        academicStanding: data.academicStanding ?? null,
        eligibilityStatus: data.eligibilityStatus ?? null,
        seasonsOfCompetitionUsed: data.seasonsOfCompetitionUsed ?? null,
        eligibilityNotes: data.eligibilityNotes ?? null,
      });
    } else {
      await updateSeasonEnrollment(enrollmentId, organizationId, {
        ...(data.classYear !== undefined && {
          classYear: parseClassYear(data.classYear),
        }),
        ...(data.groupId !== undefined && { groupId: data.groupId }),
        ...(data.academicStanding !== undefined && {
          academicStanding: data.academicStanding,
        }),
        ...(data.eligibilityStatus !== undefined && {
          eligibilityStatus: data.eligibilityStatus,
        }),
        ...(data.seasonsOfCompetitionUsed !== undefined && {
          seasonsOfCompetitionUsed: data.seasonsOfCompetitionUsed,
        }),
        ...(data.eligibilityNotes !== undefined && {
          eligibilityNotes: data.eligibilityNotes,
        }),
      });
    }
  }

  return getSwimmerById(swimmerId, organizationId, data.seasonId);
}

export async function removeSwimmerFromTeam(
  swimmerId: string,
  organizationId: string,
  seasonId?: string,
) {
  const membership = await getSwimmerById(swimmerId, organizationId, seasonId);
  if (!membership) return false;

  const resolvedSeasonId = await resolveSeasonId(organizationId, seasonId);
  const enrollment =
    membership.enrollmentId != null
      ? { id: membership.enrollmentId }
      : await getEnrollmentForMembershipInSeason(
          membership.membershipId,
          resolvedSeasonId,
        );

  if (enrollment) {
    await updateSeasonEnrollment(enrollment.id, organizationId, {
      status: "inactive",
      leftAt: new Date(),
    });
  }

  await db
    .update(teamSwimmerMemberships)
    .set({ status: "inactive", leftAt: new Date(), updatedAt: new Date() })
    .where(eq(teamSwimmerMemberships.id, membership.membershipId));

  return true;
}

export async function getRosterStats(
  organizationId: string,
  seasonId?: string,
) {
  const roster = await getRoster(organizationId, seasonId);
  return {
    totalSwimmers: roster.length,
    minorSwimmers: roster.filter((r) => isMinorSwimmer(r.dateOfBirth)).length,
    practiceGroups: [
      ...new Set(roster.map((r) => r.practiceGroup).filter(Boolean)),
    ].length,
  };
}

export async function searchSwimmerByUsaId(usaMemberId: string) {
  const [row] = await db
    .select({
      id: swimmers.id,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      dateOfBirth: swimmers.dateOfBirth,
      governingBodyId: swimmers.governingBodyId,
    })
    .from(swimmers)
    .where(eq(swimmers.governingBodyId, usaMemberId))
    .limit(1);

  return row ?? null;
}

export async function getSwimmerIdentityById(swimmerId: string) {
  const [row] = await db
    .select({
      id: swimmers.id,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      preferredName: swimmers.preferredName,
      dateOfBirth: swimmers.dateOfBirth,
      gender: swimmers.gender,
      governingBodyId: swimmers.governingBodyId,
    })
    .from(swimmers)
    .where(eq(swimmers.id, swimmerId))
    .limit(1);

  return row ?? null;
}

export type ImportRosterSharePackResult = {
  linked: number;
  merged: number;
  reactivated: number;
  alreadyOnTeam: number;
  failed: Array<{ swimmerId: string; name: string; reason: string }>;
};

/**
 * Link athletes from a Lane4 HQ roster share pack onto a team.
 * Confirms name+DOB against the stored person. When this team already has a
 * different person row matching name+DOB, merges that duplicate into the
 * pack's opaque id so we do not keep two people.
 */
export async function importRosterSharePack(
  organizationId: string,
  athletes: Array<{
    swimmerId: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    dateOfBirth: string;
    gender: "male" | "female";
  }>,
): Promise<ImportRosterSharePackResult> {
  const result: ImportRosterSharePackResult = {
    linked: 0,
    merged: 0,
    reactivated: 0,
    alreadyOnTeam: 0,
    failed: [],
  };

  for (const athlete of athletes) {
    const name = `${athlete.firstName} ${athlete.lastName}`.trim();
    const packIdentity = {
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      preferredName: athlete.preferredName,
      dateOfBirth: athlete.dateOfBirth,
    };
    const existing = await getSwimmerIdentityById(athlete.swimmerId);
    if (!existing) {
      result.failed.push({
        swimmerId: athlete.swimmerId,
        name,
        reason: "Swimmer not found — pack may be from another environment",
      });
      continue;
    }

    if (
      !swimmerIdentitiesMatch(packIdentity, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        preferredName: existing.preferredName,
        dateOfBirth: existing.dateOfBirth,
      })
    ) {
      result.failed.push({
        swimmerId: athlete.swimmerId,
        name,
        reason: "Name/DOB does not match stored profile",
      });
      continue;
    }

    const localMatches = await findTeamSwimmersMatchingIdentity(
      organizationId,
      {
        firstName: existing.firstName,
        lastName: existing.lastName,
        preferredName: existing.preferredName,
        dateOfBirth: existing.dateOfBirth,
      },
      existing.id,
    );

    if (localMatches.length > 1) {
      result.failed.push({
        swimmerId: athlete.swimmerId,
        name,
        reason:
          "Multiple local roster matches — resolve duplicates on this team first",
      });
      continue;
    }

    try {
      if (localMatches.length === 1 && localMatches[0]) {
        await mergeSwimmerRecords({
          winnerSwimmerId: existing.id,
          loserSwimmerId: localMatches[0].swimmerId,
        });
        result.merged += 1;
        continue;
      }

      const added = await addExistingSwimmerToTeam(
        existing.id,
        organizationId,
        {
          firstName: existing.firstName,
          lastName: existing.lastName,
          preferredName: existing.preferredName ?? undefined,
          dateOfBirth: existing.dateOfBirth,
          gender: existing.gender,
        },
      );
      if (added.reactivated) {
        result.reactivated += 1;
      } else {
        result.linked += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Link failed";
      if (message.includes("already on this team")) {
        result.alreadyOnTeam += 1;
      } else {
        result.failed.push({
          swimmerId: athlete.swimmerId,
          name,
          reason: message,
        });
      }
    }
  }

  return result;
}

export async function searchLinkableSwimmersByIdentity(
  viewerUserId: string,
  targetOrganizationId: string,
  identity: {
    firstName: string;
    lastName: string;
    preferredName?: string | null;
    dateOfBirth: string;
  },
) {
  return findLinkableSwimmersForCoach({
    viewerUserId,
    targetOrganizationId,
    ...identity,
  });
}
