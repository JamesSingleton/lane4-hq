import {
  normalizeMeetEndDate,
  parseDateOnly,
} from "@lane4hq/swim-core/calendar-date";
import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import { formatEventName, parseEventGender } from "@lane4hq/swim-core/events";
import {
  RELAY_PRIMARY_LEG_COUNT,
  RELAY_TEAM_LETTERS,
} from "@lane4hq/swim-core/relay-legs";
import type { CreateMeetInput } from "@lane4hq/swim-core/validators";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import {
  type EntryLimitPackage,
  type MeetResultRound,
  meetCommitments,
  meetEntries,
  meetEvents,
  meetRelayLegs,
  meetRelayResultMembers,
  meetRelayResultSplits,
  meetRelayResults,
  meetRelayTeams,
  meetResults,
  meets,
  organization,
  type SeedTimeSource,
  swimEvents,
  swimmerBestTimes,
  swimmers,
  teamSeasons,
  teamSwimmerMemberships,
} from "../schema/index";
import {
  findSwimmerBestTime,
  recomputeBestTimesForSwimmers,
  upsertBestTime,
} from "./progression";
import { ensureCurrentSeason } from "./seasons";

function generateId(): string {
  return crypto.randomUUID();
}

/** Meet dates are calendar days; store as UTC midnight. */
function toMeetDate(value: string): Date {
  const parsed = parseDateOnly(value.slice(0, 10));
  if (!parsed) {
    throw new Error(`Invalid meet date: ${value}`);
  }
  return parsed;
}

/** Optional calendar date; empty/null clears, undefined leaves unchanged. */
function toOptionalMeetDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || value === "") return null;
  return toMeetDate(value);
}

function toOptionalMeetEndDate(
  startDate: string,
  endDate: string | undefined,
): Date | null {
  const normalized = normalizeMeetEndDate(startDate, endDate);
  return normalized ? toMeetDate(normalized) : null;
}

export async function ensureSwimEvent(event: {
  eventKey: string;
  distance: number;
  stroke: string;
  gender: string;
  course: "SCY" | "SCM" | "LCM";
}) {
  const [existing] = await db
    .select({ eventKey: swimEvents.eventKey })
    .from(swimEvents)
    .where(eq(swimEvents.eventKey, event.eventKey))
    .limit(1);
  if (existing) return;

  const gender = parseEventGender(event.gender);
  const isRelay =
    event.stroke === "free_relay" ||
    event.stroke === "medley_relay" ||
    event.stroke.includes("relay");
  await db.insert(swimEvents).values({
    eventKey: event.eventKey,
    label: formatEventName(event.distance, event.stroke),
    distance: event.distance,
    stroke: event.stroke,
    course: event.course,
    gender,
    eventType: isRelay ? "relay" : "individual",
  });
}

export async function getMeets(
  organizationId: string,
  options?: { seasonId?: string },
) {
  const conditions = [eq(meets.organizationId, organizationId)];
  if (options?.seasonId) {
    conditions.push(eq(meets.seasonId, options.seasonId));
  }

  return db
    .select({
      id: meets.id,
      organizationId: meets.organizationId,
      seasonId: meets.seasonId,
      seasonLabel: teamSeasons.label,
      name: meets.name,
      startDate: meets.startDate,
      endDate: meets.endDate,
      entryDeadline: meets.entryDeadline,
      course: meets.course,
      location: meets.location,
      address: meets.address,
      opponents: meets.opponents,
      importSource: meets.importSource,
      rawFilePath: meets.rawFilePath,
      maxIndividualEntries: meets.maxIndividualEntries,
      maxRelayEntries: meets.maxRelayEntries,
      maxCombinedEntries: meets.maxCombinedEntries,
      entryLimitPackages: meets.entryLimitPackages,
      entryLimitsSource: meets.entryLimitsSource,
      createdAt: meets.createdAt,
      updatedAt: meets.updatedAt,
    })
    .from(meets)
    .leftJoin(teamSeasons, eq(meets.seasonId, teamSeasons.id))
    .where(and(...conditions))
    .orderBy(desc(meets.startDate));
}

/** Upcoming meets for a coach who belongs to multiple teams. */
export async function getUpcomingMeetsForOrganizations(
  organizationIds: string[],
  from: Date,
  limit = 20,
) {
  if (organizationIds.length === 0) return [];

  return db
    .select({
      id: meets.id,
      organizationId: meets.organizationId,
      teamName: organization.name,
      name: meets.name,
      startDate: meets.startDate,
      location: meets.location,
    })
    .from(meets)
    .innerJoin(organization, eq(meets.organizationId, organization.id))
    .where(
      and(
        inArray(meets.organizationId, organizationIds),
        gte(meets.startDate, from),
      ),
    )
    .orderBy(asc(meets.startDate))
    .limit(limit);
}

export async function getMeetById(meetId: string, organizationId: string) {
  const [meet] = await db
    .select()
    .from(meets)
    .where(eq(meets.id, meetId))
    .limit(1);

  if (!meet || meet.organizationId !== organizationId) return null;
  return meet;
}

export async function createMeet(
  organizationId: string,
  data: CreateMeetInput & {
    seasonId?: string;
    importSource?: string;
    maxIndividualEntries?: number | null;
    maxRelayEntries?: number | null;
    maxCombinedEntries?: number | null;
    entryLimitPackages?: EntryLimitPackage[] | null;
    entryLimitsSource?: string | null;
  },
) {
  const seasonId =
    data.seasonId ?? (await ensureCurrentSeason(organizationId)).id;
  const id = generateId();
  await db.insert(meets).values({
    id,
    organizationId,
    seasonId,
    name: data.name,
    startDate: toMeetDate(data.startDate),
    endDate: toOptionalMeetEndDate(data.startDate, data.endDate),
    entryDeadline: toOptionalMeetDate(data.entryDeadline) ?? null,
    course: data.course,
    location: data.location ?? null,
    address: data.address ?? null,
    opponents: data.opponents?.trim() || null,
    importSource: data.importSource ?? null,
    maxIndividualEntries: data.maxIndividualEntries ?? null,
    maxRelayEntries: data.maxRelayEntries ?? null,
    maxCombinedEntries: data.maxCombinedEntries ?? null,
    entryLimitPackages: data.entryLimitPackages ?? null,
    entryLimitsSource: data.entryLimitsSource ?? null,
  });
  return id;
}

export async function updateMeet(
  meetId: string,
  organizationId: string,
  data: CreateMeetInput & {
    seasonId?: string;
    importSource?: string | null;
    maxIndividualEntries?: number | null;
    maxRelayEntries?: number | null;
    maxCombinedEntries?: number | null;
    entryLimitPackages?: EntryLimitPackage[] | null;
    entryLimitsSource?: string | null;
    maxScoringEntriesPerIndividualEvent?: number | null;
    maxRelayTeamsPerEvent?: number | null;
  },
) {
  const meet = await getMeetById(meetId, organizationId);
  if (!meet) return false;

  await db
    .update(meets)
    .set({
      name: data.name,
      startDate: toMeetDate(data.startDate),
      endDate: toOptionalMeetEndDate(data.startDate, data.endDate),
      ...(data.entryDeadline !== undefined
        ? { entryDeadline: toOptionalMeetDate(data.entryDeadline) ?? null }
        : {}),
      course: data.course,
      location: data.location ?? null,
      address: data.address ?? null,
      ...(data.opponents !== undefined
        ? { opponents: data.opponents?.trim() || null }
        : {}),
      ...(data.importSource !== undefined
        ? { importSource: data.importSource }
        : {}),
      ...(data.seasonId !== undefined ? { seasonId: data.seasonId } : {}),
      ...(data.maxIndividualEntries !== undefined
        ? { maxIndividualEntries: data.maxIndividualEntries }
        : {}),
      ...(data.maxRelayEntries !== undefined
        ? { maxRelayEntries: data.maxRelayEntries }
        : {}),
      ...(data.maxCombinedEntries !== undefined
        ? { maxCombinedEntries: data.maxCombinedEntries }
        : {}),
      ...(data.entryLimitPackages !== undefined
        ? { entryLimitPackages: data.entryLimitPackages }
        : {}),
      ...(data.entryLimitsSource !== undefined
        ? { entryLimitsSource: data.entryLimitsSource }
        : {}),
      ...(data.maxScoringEntriesPerIndividualEvent !== undefined
        ? {
            maxScoringEntriesPerIndividualEvent:
              data.maxScoringEntriesPerIndividualEvent,
          }
        : {}),
      ...(data.maxRelayTeamsPerEvent !== undefined
        ? { maxRelayTeamsPerEvent: data.maxRelayTeamsPerEvent }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(meets.id, meetId));

  return true;
}

export async function updateMeetRelayTeamSeed(
  meetId: string,
  meetEventId: string,
  relayLetter: string,
  seedTimeMs: number | null,
) {
  const letter = relayLetter.trim().toUpperCase() || "A";
  const now = new Date();
  const [existing] = await db
    .select({ id: meetRelayTeams.id })
    .from(meetRelayTeams)
    .where(
      and(
        eq(meetRelayTeams.meetId, meetId),
        eq(meetRelayTeams.meetEventId, meetEventId),
        eq(meetRelayTeams.relayLetter, letter),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(meetRelayTeams)
      .set({
        seedTimeMs,
        seedTimeSource:
          seedTimeMs != null && seedTimeMs > 0 ? "manual" : "no_time",
        updatedAt: now,
      })
      .where(eq(meetRelayTeams.id, existing.id));
    return;
  }

  await db.insert(meetRelayTeams).values({
    id: generateId(),
    meetId,
    meetEventId,
    relayLetter: letter,
    seedTimeMs,
    seedTimeSource: seedTimeMs != null && seedTimeMs > 0 ? "manual" : "no_time",
    updatedAt: now,
  });
}

/** Meets with result/athlete counts for the Results hub list. */
export async function getMeetsWithResultStats(organizationId: string) {
  const meetList = await getMeets(organizationId);
  if (meetList.length === 0) return [];
  const meetIds = meetList.map((meet) => meet.id);

  const [individualStats, relayStats] = await Promise.all([
    db
      .select({
        meetId: meetResults.meetId,
        resultCount: sql<number>`count(*)::int`,
        swimmerIds: sql<string[]>`array_agg(distinct ${meetResults.swimmerId})`,
      })
      .from(meetResults)
      .where(inArray(meetResults.meetId, meetIds))
      .groupBy(meetResults.meetId),
    db
      .select({
        meetId: meetRelayResults.meetId,
        resultCount: sql<number>`count(distinct ${meetRelayResults.id})::int`,
        swimmerIds: sql<
          string[] | null
        >`array_agg(distinct ${teamSwimmerMemberships.swimmerId}) filter (where ${teamSwimmerMemberships.swimmerId} is not null)`,
      })
      .from(meetRelayResults)
      .leftJoin(
        meetRelayResultMembers,
        eq(meetRelayResultMembers.resultId, meetRelayResults.id),
      )
      .leftJoin(
        teamSwimmerMemberships,
        eq(teamSwimmerMemberships.id, meetRelayResultMembers.membershipId),
      )
      .where(inArray(meetRelayResults.meetId, meetIds))
      .groupBy(meetRelayResults.meetId),
  ]);

  const byMeet = new Map<
    string,
    { resultCount: number; swimmerIds: Set<string> }
  >();
  for (const stats of [individualStats, relayStats]) {
    for (const stat of stats) {
      const current = byMeet.get(stat.meetId) ?? {
        resultCount: 0,
        swimmerIds: new Set<string>(),
      };
      current.resultCount += stat.resultCount;
      for (const swimmerId of stat.swimmerIds ?? []) {
        current.swimmerIds.add(swimmerId);
      }
      byMeet.set(stat.meetId, current);
    }
  }

  return meetList.map((meet) => {
    const s = byMeet.get(meet.id);
    return {
      ...meet,
      resultCount: s?.resultCount ?? 0,
      athleteCount: s?.swimmerIds.size ?? 0,
    };
  });
}

export async function getMeetEvents(meetId: string) {
  return db.select().from(meetEvents).where(eq(meetEvents.meetId, meetId));
}

export async function getMeetEntries(meetId: string) {
  return db.select().from(meetEntries).where(eq(meetEntries.meetId, meetId));
}

function storedEventSuffix(value?: string | null): string | null {
  const letter = value?.trim().charAt(0).toUpperCase() ?? "";
  return /^[A-Z]$/.test(letter) ? letter : null;
}

export async function addMeetEvent(
  meetId: string,
  event: {
    eventNumber?: number;
    eventSuffix?: string | null;
    stroke: string;
    distance: number;
    gender: string;
    ageGroup?: string;
    eventKey: string;
    course?: "SCY" | "SCM" | "LCM";
    qualifyingTimeMs?: number | null;
    eventKind?: "swim" | "dive";
    diveCount?: number | null;
    importedFromFile?: boolean;
  },
) {
  const gender = parseEventGender(event.gender);
  await ensureSwimEvent({
    eventKey: event.eventKey,
    distance: event.distance,
    stroke: event.stroke,
    gender,
    course: event.course ?? "SCY",
  });

  const id = generateId();
  await db.insert(meetEvents).values({
    id,
    meetId,
    eventNumber: event.eventNumber,
    eventSuffix: storedEventSuffix(event.eventSuffix),
    stroke: event.stroke,
    distance: event.distance,
    gender,
    ageGroup: event.ageGroup,
    eventKey: event.eventKey,
    qualifyingTimeMs: event.qualifyingTimeMs ?? null,
    eventKind: event.eventKind ?? "swim",
    diveCount: event.diveCount ?? null,
    importedFromFile: event.importedFromFile ?? false,
  });
  return id;
}

export async function addMeetEntry(
  meetId: string,
  meetEventId: string,
  membershipId: string,
  seedTimeMs?: number | null,
  entryNotes?: string,
  status: "draft" | "approved" | "scratched" = "draft",
  seedTimeSource?: SeedTimeSource,
  exhibition?: boolean,
) {
  const source: SeedTimeSource =
    seedTimeSource ??
    (seedTimeMs != null && seedTimeMs > 0 ? "personal_best" : "no_time");
  const id = generateId();
  await db.insert(meetEntries).values({
    id,
    meetId,
    meetEventId,
    membershipId,
    seedTimeMs: seedTimeMs ?? null,
    seedTimeSource: source,
    entryNotes: entryNotes ?? null,
    status,
    exhibition: exhibition ?? false,
  });
  return id;
}

export async function upsertMeetCommitment(
  meetId: string,
  membershipId: string,
  status: "pending" | "committed" | "declined" | "not_going" | "not_eligible",
  notes?: string,
  relayOnly?: boolean,
) {
  const storedStatus = status === "declined" ? "not_going" : status;
  const [existing] = await db
    .select()
    .from(meetCommitments)
    .where(
      and(
        eq(meetCommitments.meetId, meetId),
        eq(meetCommitments.membershipId, membershipId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(meetCommitments)
      .set({
        status: storedStatus,
        notes: notes ?? existing.notes,
        relayOnly: relayOnly ?? existing.relayOnly,
        updatedAt: new Date(),
      })
      .where(eq(meetCommitments.id, existing.id));
    return existing.id;
  }

  const id = generateId();
  await db.insert(meetCommitments).values({
    id,
    meetId,
    membershipId,
    status: storedStatus,
    notes: notes ?? null,
    relayOnly: relayOnly ?? false,
  });
  return id;
}

export async function setMeetCommitmentRelayOnly(
  meetId: string,
  membershipId: string,
  relayOnly: boolean,
) {
  const [existing] = await db
    .select()
    .from(meetCommitments)
    .where(
      and(
        eq(meetCommitments.meetId, meetId),
        eq(meetCommitments.membershipId, membershipId),
      ),
    )
    .limit(1);

  if (relayOnly) {
    if (existing) {
      await db
        .update(meetCommitments)
        .set({ relayOnly: true, updatedAt: new Date() })
        .where(eq(meetCommitments.id, existing.id));
      return existing.id;
    }
    const id = generateId();
    await db.insert(meetCommitments).values({
      id,
      meetId,
      membershipId,
      status: "committed",
      relayOnly: true,
    });
    return id;
  }

  if (!existing) return null;
  await db
    .update(meetCommitments)
    .set({ relayOnly: false, updatedAt: new Date() })
    .where(eq(meetCommitments.id, existing.id));
  return existing.id;
}

export async function deleteMeetCommitment(
  meetId: string,
  membershipId: string,
) {
  await db
    .delete(meetCommitments)
    .where(
      and(
        eq(meetCommitments.meetId, meetId),
        eq(meetCommitments.membershipId, membershipId),
      ),
    );
}

export async function getMeetCommitments(meetId: string) {
  return db
    .select({
      id: meetCommitments.id,
      membershipId: meetCommitments.membershipId,
      status: meetCommitments.status,
      relayOnly: meetCommitments.relayOnly,
      notes: meetCommitments.notes,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      practiceGroup: teamSwimmerMemberships.practiceGroup,
    })
    .from(meetCommitments)
    .innerJoin(
      teamSwimmerMemberships,
      eq(meetCommitments.membershipId, teamSwimmerMemberships.id),
    )
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .where(eq(meetCommitments.meetId, meetId));
}

/** Batch exclusion counts for dashboard meet cards. */
export async function getMeetCommitmentCounts(meetIds: string[]) {
  if (meetIds.length === 0) {
    return new Map<string, { notGoing: number; notEligible: number }>();
  }

  const rows = await db
    .select({
      meetId: meetCommitments.meetId,
      notGoing: sql<number>`count(*) filter (where ${meetCommitments.status} = 'not_going')::int`,
      notEligible: sql<number>`count(*) filter (where ${meetCommitments.status} = 'not_eligible')::int`,
    })
    .from(meetCommitments)
    .where(inArray(meetCommitments.meetId, meetIds))
    .groupBy(meetCommitments.meetId);

  return new Map(
    rows.map((row) => [
      row.meetId,
      {
        notGoing: Number(row.notGoing ?? 0),
        notEligible: Number(row.notEligible ?? 0),
      },
    ]),
  );
}

/** Entry fill progress for dashboard deadline cards. */
export async function getMeetEntryProgressCounts(meetIds: string[]) {
  if (meetIds.length === 0) {
    return new Map<string, { entryCount: number; athletesEntered: number }>();
  }

  const rows = await db
    .select({
      meetId: meetEntries.meetId,
      entryCount: sql<number>`count(*) filter (where ${meetEntries.status} <> 'scratched')::int`,
      athletesEntered: sql<number>`count(distinct ${meetEntries.membershipId}) filter (where ${meetEntries.status} <> 'scratched')::int`,
    })
    .from(meetEntries)
    .where(inArray(meetEntries.meetId, meetIds))
    .groupBy(meetEntries.meetId);

  return new Map(
    rows.map((row) => [
      row.meetId,
      {
        entryCount: Number(row.entryCount ?? 0),
        athletesEntered: Number(row.athletesEntered ?? 0),
      },
    ]),
  );
}

export async function getMeetEntriesDetailed(meetId: string) {
  return db
    .select({
      id: meetEntries.id,
      meetEventId: meetEntries.meetEventId,
      membershipId: meetEntries.membershipId,
      seedTimeMs: meetEntries.seedTimeMs,
      entryNotes: meetEntries.entryNotes,
      status: meetEntries.status,
      seedTimeSource: meetEntries.seedTimeSource,
      exhibition: meetEntries.exhibition,
      eventNumber: meetEvents.eventNumber,
      distance: meetEvents.distance,
      stroke: meetEvents.stroke,
      gender: meetEvents.gender,
      eventKey: meetEvents.eventKey,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      swimmerId: swimmers.id,
    })
    .from(meetEntries)
    .innerJoin(meetEvents, eq(meetEntries.meetEventId, meetEvents.id))
    .innerJoin(
      teamSwimmerMemberships,
      eq(meetEntries.membershipId, teamSwimmerMemberships.id),
    )
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .where(eq(meetEntries.meetId, meetId));
}

export async function updateMeetEntry(
  entryId: string,
  data: {
    seedTimeMs?: number | null;
    seedTimeSource?: SeedTimeSource;
    entryNotes?: string | null;
    exhibition?: boolean;
    status?: "draft" | "approved" | "scratched";
  },
) {
  await db
    .update(meetEntries)
    .set({
      ...(data.seedTimeMs !== undefined ? { seedTimeMs: data.seedTimeMs } : {}),
      ...(data.seedTimeSource !== undefined
        ? { seedTimeSource: data.seedTimeSource }
        : {}),
      ...(data.entryNotes !== undefined ? { entryNotes: data.entryNotes } : {}),
      ...(data.exhibition !== undefined ? { exhibition: data.exhibition } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(meetEntries.id, entryId));
}

export async function updateMeetEntryStatus(
  entryId: string,
  status: "draft" | "approved" | "scratched",
) {
  await db
    .update(meetEntries)
    .set({ status, updatedAt: new Date() })
    .where(eq(meetEntries.id, entryId));
}

export async function deleteMeetEntry(entryId: string) {
  await db.delete(meetEntries).where(eq(meetEntries.id, entryId));
}

/** Deletes a meet owned by the organization. Cascades events/entries/results. */
export async function deleteMeet(meetId: string, organizationId: string) {
  const meet = await getMeetById(meetId, organizationId);
  if (!meet) return false;

  await db.delete(meets).where(eq(meets.id, meetId));
  return true;
}

export async function addMeetResult(
  meetId: string,
  meetEventId: string,
  swimmerId: string,
  timeMs: number,
  options?: {
    place?: number;
    isDq?: boolean;
    previousBestTimeMs?: number | null;
    splitTimes?: number[] | null;
    round?: MeetResultRound | null;
    heat?: number | null;
    lane?: number | null;
    exhibition?: boolean;
    dqCode?: string | null;
  },
) {
  const id = generateId();
  const [meet] = await db
    .select()
    .from(meets)
    .where(eq(meets.id, meetId))
    .limit(1);

  const [event] = await db
    .select({
      id: meetEvents.id,
      eventKey: meetEvents.eventKey,
      stroke: meetEvents.stroke,
      course: swimEvents.course,
    })
    .from(meetEvents)
    .leftJoin(swimEvents, eq(swimEvents.eventKey, meetEvents.eventKey))
    .where(eq(meetEvents.id, meetEventId))
    .limit(1);

  if (event && isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error(
      "Relay times are recorded as team results, not individual swims.",
    );
  }

  const course = event?.course ?? meet?.course ?? "SCY";

  let previousBestTimeMs: number | null = null;
  if (options && "previousBestTimeMs" in options) {
    previousBestTimeMs = options.previousBestTimeMs ?? null;
  } else if (event) {
    previousBestTimeMs = await getBestTimeMs(swimmerId, event.eventKey, course);
  }

  await db.insert(meetResults).values({
    id,
    meetId,
    meetEventId,
    swimmerId,
    timeMs,
    previousBestTimeMs,
    place: options?.place ?? null,
    isDq: options?.isDq ?? false,
    splitTimes: options?.splitTimes ?? null,
    round: options?.round ?? null,
    heat: options?.heat ?? null,
    lane: options?.lane ?? null,
    exhibition: options?.exhibition ?? false,
    dqCode: options?.dqCode ?? null,
  });

  if (event && !options?.isDq) {
    await upsertBestTime({
      swimmerId,
      eventKey: event.eventKey,
      course,
      timeMs,
      achievedAt: meet?.startDate ?? new Date(),
      meetId,
    });
  }

  return id;
}

export type ResolvedMeetResultInput = {
  meetEventId: string;
  swimmerId: string;
  timeMs: number;
  place: number | null;
  previousBestTimeMs: number | null;
};

export async function addResolvedMeetResults(
  meetId: string,
  rows: readonly ResolvedMeetResultInput[],
  swimmerIds: readonly string[],
) {
  if (rows.length === 0) return [];

  const results = rows.map((row) => ({
    id: generateId(),
    meetId,
    meetEventId: row.meetEventId,
    swimmerId: row.swimmerId,
    timeMs: row.timeMs,
    previousBestTimeMs: row.previousBestTimeMs,
    place: row.place,
    isDq: false,
    splitTimes: null,
    round: null,
    heat: null,
    lane: null,
    exhibition: false,
    dqCode: null,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(meetResults).values(results);
    await recomputeBestTimesForSwimmers(swimmerIds, tx);
  });

  return results.map((result) => result.id);
}

export async function getBestTimeMs(
  swimmerId: string,
  eventKey: string,
  _course?: "SCY" | "SCM" | "LCM",
): Promise<number | null> {
  const best = await findSwimmerBestTime(swimmerId, eventKey);
  return best?.timeMs ?? null;
}

export async function getMeetResults(meetId: string) {
  return db.select().from(meetResults).where(eq(meetResults.meetId, meetId));
}

export async function getMeetResultsDetailed(meetId: string) {
  return db
    .select({
      id: meetResults.id,
      meetEventId: meetResults.meetEventId,
      swimmerId: meetResults.swimmerId,
      timeMs: meetResults.timeMs,
      previousBestTimeMs: meetResults.previousBestTimeMs,
      place: meetResults.place,
      isDq: meetResults.isDq,
      round: meetResults.round,
      heat: meetResults.heat,
      lane: meetResults.lane,
      exhibition: meetResults.exhibition,
      dqCode: meetResults.dqCode,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      dateOfBirth: swimmers.dateOfBirth,
      eventNumber: meetEvents.eventNumber,
      distance: meetEvents.distance,
      stroke: meetEvents.stroke,
      gender: meetEvents.gender,
      ageGroup: meetEvents.ageGroup,
      eventKey: meetEvents.eventKey,
    })
    .from(meetResults)
    .innerJoin(swimmers, eq(meetResults.swimmerId, swimmers.id))
    .innerJoin(meetEvents, eq(meetResults.meetEventId, meetEvents.id))
    .where(eq(meetResults.meetId, meetId))
    .orderBy(asc(meetEvents.eventNumber), asc(meetResults.place));
}

export async function getRosterBestTimesForEvents(
  organizationId: string,
  eventKeys: string[],
) {
  if (eventKeys.length === 0) return [];

  return db
    .select({
      membershipId: teamSwimmerMemberships.id,
      swimmerId: swimmers.id,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
      eventKey: swimmerBestTimes.eventKey,
      course: swimmerBestTimes.course,
      timeMs: swimmerBestTimes.timeMs,
    })
    .from(teamSwimmerMemberships)
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .innerJoin(swimmerBestTimes, eq(swimmerBestTimes.swimmerId, swimmers.id))
    .where(
      and(
        eq(teamSwimmerMemberships.organizationId, organizationId),
        eq(teamSwimmerMemberships.status, "active"),
        inArray(swimmerBestTimes.eventKey, eventKeys),
      ),
    );
}

export async function replaceMeetRelayLegs(input: {
  meetId: string;
  meetEventId: string;
  legs: Array<{
    membershipId: string;
    legOrder: number;
    stroke?: string;
    reasoning?: string;
    relayLetter?: string;
  }>;
}) {
  await db
    .delete(meetRelayLegs)
    .where(
      and(
        eq(meetRelayLegs.meetId, input.meetId),
        eq(meetRelayLegs.meetEventId, input.meetEventId),
      ),
    );
  if (input.legs.length === 0) return;
  await db.insert(meetRelayLegs).values(
    input.legs.map((leg) => ({
      id: generateId(),
      meetId: input.meetId,
      meetEventId: input.meetEventId,
      relayLetter: (leg.relayLetter ?? "A").trim().toUpperCase() || "A",
      legOrder: leg.legOrder,
      membershipId: leg.membershipId,
      stroke: leg.stroke ?? null,
      reasoning: leg.reasoning ?? null,
    })),
  );
}

export async function replaceMeetRelayTeams(input: {
  meetId: string;
  meetEventId: string;
  teams: Array<{
    relayLetter: string;
    seedTimeMs?: number | null;
    seedTimeSource?: SeedTimeSource;
  }>;
}) {
  await db
    .delete(meetRelayTeams)
    .where(
      and(
        eq(meetRelayTeams.meetId, input.meetId),
        eq(meetRelayTeams.meetEventId, input.meetEventId),
      ),
    );
  if (input.teams.length === 0) return;
  const now = new Date();
  await db.insert(meetRelayTeams).values(
    input.teams.map((team) => ({
      id: generateId(),
      meetId: input.meetId,
      meetEventId: input.meetEventId,
      relayLetter: team.relayLetter.trim().toUpperCase() || "A",
      seedTimeMs: team.seedTimeMs ?? null,
      seedTimeSource: team.seedTimeSource ?? "no_time",
      updatedAt: now,
    })),
  );
}

export async function getMeetRelayTeams(meetId: string) {
  return db
    .select()
    .from(meetRelayTeams)
    .where(eq(meetRelayTeams.meetId, meetId))
    .orderBy(asc(meetRelayTeams.relayLetter));
}

export async function getMeetRelayLegs(meetId: string) {
  return db
    .select()
    .from(meetRelayLegs)
    .where(eq(meetRelayLegs.meetId, meetId))
    .orderBy(asc(meetRelayLegs.relayLetter), asc(meetRelayLegs.legOrder));
}

export async function getMeetRelayLegsDetailed(meetId: string) {
  return db
    .select({
      meetEventId: meetRelayLegs.meetEventId,
      relayLetter: meetRelayLegs.relayLetter,
      legOrder: meetRelayLegs.legOrder,
      membershipId: meetRelayLegs.membershipId,
      firstName: swimmers.firstName,
      lastName: swimmers.lastName,
    })
    .from(meetRelayLegs)
    .innerJoin(
      teamSwimmerMemberships,
      eq(meetRelayLegs.membershipId, teamSwimmerMemberships.id),
    )
    .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
    .where(eq(meetRelayLegs.meetId, meetId))
    .orderBy(asc(meetRelayLegs.relayLetter), asc(meetRelayLegs.legOrder));
}

export type MeetRelayResultSplitRow = {
  id: string;
  resultId: string;
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  legOrder: number;
  timeMs: number;
};

export type MeetRelayResultMemberRow = {
  id: string;
  resultId: string;
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  legOrder: number;
};

export type MeetRelayResultRow = {
  id: string;
  meetEventId: string;
  relayLetter: string;
  round: MeetResultRound | null;
  timeMs: number;
  heat: number | null;
  lane: number | null;
  exhibition: boolean;
  isDq: boolean;
  dqCode: string | null;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup: string | null;
  eventKey: string;
  members: MeetRelayResultMemberRow[];
  splits: MeetRelayResultSplitRow[];
};

export async function getMeetRelayResultsDetailed(
  meetId: string,
): Promise<MeetRelayResultRow[]> {
  const resultRows = await db
    .select({
      id: meetRelayResults.id,
      meetEventId: meetRelayResults.meetEventId,
      relayLetter: meetRelayResults.relayLetter,
      round: meetRelayResults.round,
      timeMs: meetRelayResults.timeMs,
      heat: meetRelayResults.heat,
      lane: meetRelayResults.lane,
      exhibition: meetRelayResults.exhibition,
      isDq: meetRelayResults.isDq,
      dqCode: meetRelayResults.dqCode,
      eventNumber: meetEvents.eventNumber,
      distance: meetEvents.distance,
      stroke: meetEvents.stroke,
      gender: meetEvents.gender,
      ageGroup: meetEvents.ageGroup,
      eventKey: meetEvents.eventKey,
    })
    .from(meetRelayResults)
    .innerJoin(meetEvents, eq(meetRelayResults.meetEventId, meetEvents.id))
    .where(eq(meetRelayResults.meetId, meetId))
    .orderBy(
      asc(meetEvents.eventNumber),
      asc(meetRelayResults.relayLetter),
      asc(meetRelayResults.round),
    );

  if (resultRows.length === 0) return [];

  const resultIds = resultRows.map((row) => row.id);
  const [memberRows, splitRows] = await Promise.all([
    db
      .select({
        id: meetRelayResultMembers.id,
        resultId: meetRelayResultMembers.resultId,
        membershipId: meetRelayResultMembers.membershipId,
        swimmerId: teamSwimmerMemberships.swimmerId,
        firstName: swimmers.firstName,
        lastName: swimmers.lastName,
        legOrder: meetRelayResultMembers.legOrder,
      })
      .from(meetRelayResultMembers)
      .innerJoin(
        teamSwimmerMemberships,
        eq(meetRelayResultMembers.membershipId, teamSwimmerMemberships.id),
      )
      .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
      .where(inArray(meetRelayResultMembers.resultId, resultIds))
      .orderBy(asc(meetRelayResultMembers.legOrder)),
    db
      .select({
        id: meetRelayResultSplits.id,
        resultId: meetRelayResultSplits.resultId,
        membershipId: meetRelayResultSplits.membershipId,
        swimmerId: teamSwimmerMemberships.swimmerId,
        firstName: swimmers.firstName,
        lastName: swimmers.lastName,
        gender: swimmers.gender,
        legOrder: meetRelayResultSplits.legOrder,
        timeMs: meetRelayResultSplits.timeMs,
      })
      .from(meetRelayResultSplits)
      .innerJoin(
        teamSwimmerMemberships,
        eq(meetRelayResultSplits.membershipId, teamSwimmerMemberships.id),
      )
      .innerJoin(swimmers, eq(teamSwimmerMemberships.swimmerId, swimmers.id))
      .where(inArray(meetRelayResultSplits.resultId, resultIds))
      .orderBy(asc(meetRelayResultSplits.legOrder)),
  ]);

  const membersByResult = new Map<string, MeetRelayResultMemberRow[]>();
  for (const member of memberRows) {
    const list = membersByResult.get(member.resultId) ?? [];
    list.push(member);
    membersByResult.set(member.resultId, list);
  }
  const splitsByResult = new Map<string, MeetRelayResultSplitRow[]>();
  for (const split of splitRows) {
    const list = splitsByResult.get(split.resultId) ?? [];
    list.push(split);
    splitsByResult.set(split.resultId, list);
  }

  return resultRows.map((row) => ({
    ...row,
    members: membersByResult.get(row.id) ?? [],
    splits: splitsByResult.get(row.id) ?? [],
  }));
}

export async function upsertMeetRelayResult(input: {
  meetId: string;
  meetEventId: string;
  relayLetter: string;
  round: MeetResultRound | null;
  timeMs: number;
  heat?: number | null;
  lane?: number | null;
  exhibition?: boolean;
  isDq?: boolean;
  dqCode?: string | null;
  split?: {
    membershipId: string;
    swimmerId: string;
    swimmerGender: "male" | "female";
    legOrder: number;
    timeMs: number;
  } | null;
}): Promise<{ resultId: string; creditedSwimmerIds: string[] }> {
  const letter = input.relayLetter.trim().toUpperCase();
  if (
    !RELAY_TEAM_LETTERS.includes(letter as (typeof RELAY_TEAM_LETTERS)[number])
  ) {
    throw new Error("Relay team must be A, B, or C.");
  }
  if (input.split) {
    if (
      input.split.legOrder < 1 ||
      input.split.legOrder > RELAY_PRIMARY_LEG_COUNT
    ) {
      throw new Error("Relay splits are racing legs 1–4.");
    }
  }

  const [event] = await db
    .select({
      id: meetEvents.id,
      eventKey: meetEvents.eventKey,
      stroke: meetEvents.stroke,
    })
    .from(meetEvents)
    .where(
      and(
        eq(meetEvents.id, input.meetEventId),
        eq(meetEvents.meetId, input.meetId),
      ),
    )
    .limit(1);
  if (!event) throw new Error("Event not found");
  if (!isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error("That event is not a relay.");
  }

  const creditedSwimmerIds = new Set<string>();

  const resultId = await db.transaction(async (tx) => {
    const roundClause =
      input.round == null
        ? isNull(meetRelayResults.round)
        : eq(meetRelayResults.round, input.round);

    const [existing] = await tx
      .select()
      .from(meetRelayResults)
      .where(
        and(
          eq(meetRelayResults.meetId, input.meetId),
          eq(meetRelayResults.meetEventId, input.meetEventId),
          eq(meetRelayResults.relayLetter, letter),
          roundClause,
        ),
      )
      .limit(1);

    const now = new Date();
    const isDq = input.isDq ?? false;
    const exhibition = input.exhibition ?? false;
    const id = existing?.id ?? generateId();

    if (existing) {
      await tx
        .update(meetRelayResults)
        .set({
          timeMs: input.timeMs,
          heat: input.heat ?? null,
          lane: input.lane ?? null,
          exhibition,
          isDq,
          dqCode: input.dqCode ?? null,
          updatedAt: now,
        })
        .where(eq(meetRelayResults.id, existing.id));
    } else {
      await tx.insert(meetRelayResults).values({
        id,
        meetId: input.meetId,
        meetEventId: input.meetEventId,
        relayLetter: letter,
        round: input.round,
        timeMs: input.timeMs,
        heat: input.heat ?? null,
        lane: input.lane ?? null,
        exhibition,
        isDq,
        dqCode: input.dqCode ?? null,
      });
    }

    const existingMembers = await tx
      .select({
        membershipId: meetRelayResultMembers.membershipId,
        legOrder: meetRelayResultMembers.legOrder,
      })
      .from(meetRelayResultMembers)
      .where(eq(meetRelayResultMembers.resultId, id))
      .orderBy(asc(meetRelayResultMembers.legOrder));

    if (existingMembers.length === 0) {
      const relayLegs = await tx
        .select({
          membershipId: meetRelayLegs.membershipId,
          legOrder: meetRelayLegs.legOrder,
        })
        .from(meetRelayLegs)
        .where(
          and(
            eq(meetRelayLegs.meetId, input.meetId),
            eq(meetRelayLegs.meetEventId, input.meetEventId),
            eq(meetRelayLegs.relayLetter, letter),
          ),
        )
        .orderBy(asc(meetRelayLegs.legOrder));
      const racingLegs = relayLegs.filter(
        (leg) => leg.legOrder >= 1 && leg.legOrder <= RELAY_PRIMARY_LEG_COUNT,
      );
      if (racingLegs.length > 0) {
        await tx.insert(meetRelayResultMembers).values(
          racingLegs.map((leg) => ({
            id: generateId(),
            resultId: id,
            membershipId: leg.membershipId,
            legOrder: leg.legOrder,
          })),
        );
        existingMembers.push(...racingLegs);
      }
    }

    if (input.split) {
      const savedMember = existingMembers.find(
        (member) => member.legOrder === input.split!.legOrder,
      );
      if (
        savedMember &&
        savedMember.membershipId !== input.split.membershipId
      ) {
        throw new Error("The split swimmer must match the saved relay lineup.");
      }
      if (!savedMember) {
        await tx.insert(meetRelayResultMembers).values({
          id: generateId(),
          resultId: id,
          membershipId: input.split.membershipId,
          legOrder: input.split.legOrder,
        });
        existingMembers.push({
          membershipId: input.split.membershipId,
          legOrder: input.split.legOrder,
        });
      }

      const [existingSplit] = await tx
        .select()
        .from(meetRelayResultSplits)
        .where(
          and(
            eq(meetRelayResultSplits.resultId, id),
            eq(meetRelayResultSplits.legOrder, input.split.legOrder),
          ),
        )
        .limit(1);

      if (
        existingSplit &&
        existingSplit.membershipId !== input.split.membershipId
      ) {
        throw new Error(
          "That relay leg already has a different swimmer's split.",
        );
      }

      if (existingSplit) {
        await tx
          .update(meetRelayResultSplits)
          .set({
            timeMs: input.split.timeMs,
            updatedAt: now,
          })
          .where(eq(meetRelayResultSplits.id, existingSplit.id));
      } else {
        await tx.insert(meetRelayResultSplits).values({
          id: generateId(),
          resultId: id,
          membershipId: input.split.membershipId,
          legOrder: input.split.legOrder,
          timeMs: input.split.timeMs,
        });
      }

      creditedSwimmerIds.add(input.split.swimmerId);
    }

    const splitSwimmers = await tx
      .select({
        swimmerId: teamSwimmerMemberships.swimmerId,
      })
      .from(meetRelayResultSplits)
      .innerJoin(
        teamSwimmerMemberships,
        eq(meetRelayResultSplits.membershipId, teamSwimmerMemberships.id),
      )
      .where(eq(meetRelayResultSplits.resultId, id));

    for (const row of splitSwimmers) {
      creditedSwimmerIds.add(row.swimmerId);
    }

    return id;
  });

  return { resultId, creditedSwimmerIds: [...creditedSwimmerIds] };
}

export async function getMeetEventById(eventId: string, meetId: string) {
  const [event] = await db
    .select()
    .from(meetEvents)
    .where(and(eq(meetEvents.id, eventId), eq(meetEvents.meetId, meetId)))
    .limit(1);
  return event ?? null;
}

export async function countMeetEntriesForEvent(meetEventId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetEntries)
    .where(eq(meetEntries.meetEventId, meetEventId));
  return row?.count ?? 0;
}

export async function suggestMeetEventNumber(meetId: string): Promise<number> {
  const events = await getMeetEvents(meetId);
  const numbers = events
    .map((event) => event.eventNumber)
    .filter((n): n is number => n != null);
  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}

export async function updateMeetEvent(
  eventId: string,
  meetId: string,
  data: {
    eventNumber?: number | null;
    stroke?: string;
    distance?: number;
    gender?: string;
    ageGroup?: string | null;
    eventKey?: string;
    qualifyingTimeMs?: number | null;
    course?: "SCY" | "SCM" | "LCM";
  },
) {
  const patch: Record<string, unknown> = { ...data };
  delete patch.course;
  if (data.gender) {
    patch.gender = parseEventGender(data.gender);
  }
  if (data.eventKey) {
    const [current] = await db
      .select({
        distance: meetEvents.distance,
        stroke: meetEvents.stroke,
        gender: meetEvents.gender,
      })
      .from(meetEvents)
      .where(and(eq(meetEvents.id, eventId), eq(meetEvents.meetId, meetId)))
      .limit(1);
    if (current) {
      await ensureSwimEvent({
        eventKey: data.eventKey,
        distance: data.distance ?? current.distance,
        stroke: data.stroke ?? current.stroke,
        gender: data.gender ? parseEventGender(data.gender) : current.gender,
        course: data.course ?? "SCY",
      });
    }
  }
  await db
    .update(meetEvents)
    .set(patch)
    .where(and(eq(meetEvents.id, eventId), eq(meetEvents.meetId, meetId)));
}

export async function deleteMeetEvent(eventId: string, meetId: string) {
  await db
    .delete(meetEvents)
    .where(and(eq(meetEvents.id, eventId), eq(meetEvents.meetId, meetId)));
}

export async function deleteMeetEntriesForEvent(meetEventId: string) {
  await db.delete(meetEntries).where(eq(meetEntries.meetEventId, meetEventId));
}

export async function deleteMeetRelayLegsForEvent(
  meetId: string,
  meetEventId: string,
) {
  await db
    .delete(meetRelayLegs)
    .where(
      and(
        eq(meetRelayLegs.meetId, meetId),
        eq(meetRelayLegs.meetEventId, meetEventId),
      ),
    );
  await db
    .delete(meetRelayTeams)
    .where(
      and(
        eq(meetRelayTeams.meetId, meetId),
        eq(meetRelayTeams.meetEventId, meetEventId),
      ),
    );
}
