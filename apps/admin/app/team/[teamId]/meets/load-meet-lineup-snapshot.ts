import { db } from "@lane4hq/db/client";
import {
  getMeetById,
  getMeetCommitments,
  getMeetEntries,
  getMeetEvents,
  getMeetRelayLegs,
  getMeetRelayTeams,
  getMeetResults,
} from "@lane4hq/db/queries/meets";
import { getTeamExportContact } from "@lane4hq/db/queries/members";
import { getRoster } from "@lane4hq/db/queries/roster";
import { organization } from "@lane4hq/db/schema";
import { parseEventGender } from "@lane4hq/swim-core/events";
import {
  buildMeetLineupSnapshot,
  type MeetLineupMember,
  type MeetLineupSnapshot,
} from "@lane4hq/swim-core/meet-lineup-snapshot";
import { parseClassYear } from "@lane4hq/swim-core/team-types";
import { formatTime } from "@lane4hq/swim-core/times";
import type { ParsedMeet } from "@lane4hq/swim-formats";
import { eq } from "drizzle-orm";

export type LoadedMeetLineup = {
  snapshot: MeetLineupSnapshot;
  members: MeetLineupMember[];
  results: Awaited<ReturnType<typeof getMeetResults>>;
};

function hostPackSeedTime(ms: number | null | undefined): string | undefined {
  if (ms == null || ms <= 0) return undefined;
  const formatted = formatTime(ms);
  return formatted === "NT" ? undefined : formatted;
}

export async function loadMeetLineupSnapshot(
  teamId: string,
  meetId: string,
): Promise<LoadedMeetLineup | null> {
  const meet = await getMeetById(meetId, teamId);
  if (!meet) return null;

  const [
    events,
    entries,
    relayLegs,
    relayTeams,
    commitments,
    roster,
    results,
    orgRows,
    contact,
  ] = await Promise.all([
    getMeetEvents(meetId),
    getMeetEntries(meetId),
    getMeetRelayLegs(meetId),
    getMeetRelayTeams(meetId),
    getMeetCommitments(meetId),
    getRoster(teamId),
    getMeetResults(meetId),
    db
      .select({
        name: organization.name,
        teamCode: organization.teamCode,
        lscCode: organization.lscCode,
        teamType: organization.teamType,
        addressLine1: organization.addressLine1,
        addressLine2: organization.addressLine2,
        city: organization.city,
        region: organization.region,
        postalCode: organization.postalCode,
        country: organization.country,
      })
      .from(organization)
      .where(eq(organization.id, teamId))
      .limit(1),
    getTeamExportContact(teamId),
  ]);

  const org = orgRows[0];
  const members: MeetLineupMember[] = roster.map((row) => ({
    membershipId: row.membershipId,
    swimmerId: row.swimmerId,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    governingBodyId: row.governingBodyId,
    classYear: row.classYear,
    eligibilityStatus: row.eligibilityStatus,
  }));

  const snapshot = buildMeetLineupSnapshot({
    meet: {
      name: meet.name,
      startDate: meet.startDate,
      endDate: meet.endDate,
      course: meet.course,
      location: meet.location,
      opponents: meet.opponents,
    },
    team: {
      name: org?.name,
      teamCode: org?.teamCode,
      lscCode: org?.lscCode,
      teamType: org?.teamType,
      addressLine1: org?.addressLine1,
      addressLine2: org?.addressLine2,
      city: org?.city,
      region: org?.region,
      postalCode: org?.postalCode,
      country: org?.country,
      contactName: contact?.name,
      contactEmail: contact?.email,
    },
    events: events.map((event) => ({
      id: event.id,
      eventNumber: event.eventNumber,
      eventSuffix: event.eventSuffix,
      stroke: event.stroke,
      distance: event.distance,
      gender: event.gender,
      ageGroup: event.ageGroup,
      eventKey: event.eventKey,
      eventKind: event.eventKind,
      diveCount: event.diveCount,
    })),
    entries: entries.map((entry) => ({
      id: entry.id,
      meetEventId: entry.meetEventId,
      membershipId: entry.membershipId,
      seedTimeMs: entry.seedTimeMs,
      exhibition: entry.exhibition,
      entryNotes: entry.entryNotes,
      status: entry.status,
    })),
    relayLegs: relayLegs.map((leg) => ({
      meetEventId: leg.meetEventId,
      relayLetter: leg.relayLetter,
      legOrder: leg.legOrder,
      membershipId: leg.membershipId,
    })),
    relayTeams: relayTeams.map((team) => ({
      meetEventId: team.meetEventId,
      relayLetter: team.relayLetter,
      seedTimeMs: team.seedTimeMs,
    })),
    commitments: commitments.map((commitment) => ({
      membershipId: commitment.membershipId,
      status: commitment.status,
      relayOnly: commitment.relayOnly,
    })),
    members,
  });

  return { snapshot, members, results };
}

/** Thin adapter: snapshot fields onto ParsedMeet. Does not regroup. */
export function parsedMeetFromLineup(
  snapshot: MeetLineupSnapshot,
  results: LoadedMeetLineup["results"],
  members: MeetLineupMember[],
): ParsedMeet {
  const eventNumberById = new Map(
    snapshot.events.map((event) => [event.id, event.eventNumber] as const),
  );
  const eventSuffixById = new Map(
    snapshot.events.map(
      (event) => [event.id, event.eventSuffix || undefined] as const,
    ),
  );
  const athleteByMembershipId = new Map(
    snapshot.athletes.map(
      (athlete) => [athlete.membershipId, athlete] as const,
    ),
  );
  const memberBySwimmerId = new Map(
    members.map((member) => [member.swimmerId, member] as const),
  );

  return {
    name: snapshot.meet.name,
    startDate: snapshot.meet.startDate,
    endDate: snapshot.meet.endDate,
    course: snapshot.meet.course,
    location: snapshot.meet.location,
    teamCode: snapshot.team.teamCode,
    lscCode: snapshot.team.lscCode,
    teamName: snapshot.team.name,
    teamKind: snapshot.team.teamKind,
    teamAddressLine1: snapshot.team.addressLine1,
    teamAddressLine2: snapshot.team.addressLine2,
    teamCity: snapshot.team.city,
    teamRegion: snapshot.team.region,
    teamPostalCode: snapshot.team.postalCode,
    teamCountry: snapshot.team.country,
    teamContactName: snapshot.team.contactName,
    teamContactEmail: snapshot.team.contactEmail,
    events: snapshot.events.map((event) => ({
      eventNumber: event.eventNumber ?? undefined,
      eventSuffix: event.eventSuffix || undefined,
      stroke: event.stroke,
      distance: event.distance,
      gender: parseEventGender(event.gender),
      ageGroup: event.ageGroup ?? undefined,
      eventKey: event.eventKey,
      eventKind: event.eventKind,
      diveCount: event.diveCount ?? undefined,
    })),
    entries: snapshot.individuals.map((entry) => ({
      eventNumber: eventNumberById.get(entry.meetEventId) ?? undefined,
      eventSuffix: eventSuffixById.get(entry.meetEventId),
      swimmerName: `${entry.firstName} ${entry.lastName}`.trim(),
      seedTime: hostPackSeedTime(entry.seedTimeMs),
      usaMemberId: athleteByMembershipId.get(entry.membershipId)?.usaMemberId,
      dateOfBirth: athleteByMembershipId.get(entry.membershipId)?.dateOfBirth,
      gender: athleteByMembershipId.get(entry.membershipId)?.gender,
      exhibition: entry.exhibition,
      classYear: parseClassYear(entry.classYear) ?? undefined,
    })),
    results: results.map((result) => {
      const swimmer = memberBySwimmerId.get(result.swimmerId);
      return {
        eventNumber: eventNumberById.get(result.meetEventId) ?? undefined,
        eventSuffix: eventSuffixById.get(result.meetEventId),
        swimmerName: swimmer
          ? `${swimmer.firstName} ${swimmer.lastName}`
          : "Unknown",
        time: hostPackSeedTime(result.timeMs) ?? "NT",
        place: result.place ?? undefined,
        isDq: result.isDq,
        resultType: result.round ?? undefined,
        heat: result.heat ?? undefined,
        lane: result.lane ?? undefined,
        exhibition: result.exhibition,
        dqCode: result.dqCode ?? undefined,
        dateOfBirth: swimmer?.dateOfBirth ?? undefined,
        gender:
          swimmer?.gender === "male" || swimmer?.gender === "female"
            ? swimmer.gender
            : undefined,
        usaMemberId: swimmer?.governingBodyId ?? undefined,
        splitsMs: Array.isArray(result.splitTimes)
          ? (result.splitTimes as number[])
          : undefined,
      };
    }),
    athletes: snapshot.athletes.map((athlete) => ({
      name: athlete.name,
      usaMemberId: athlete.usaMemberId,
      dateOfBirth: athlete.dateOfBirth,
      gender: athlete.gender,
      classYear: parseClassYear(athlete.classYear) ?? undefined,
      relayOnly: athlete.relayOnly,
    })),
    relays:
      snapshot.relayTeams.length === 0
        ? undefined
        : snapshot.relayTeams.map((team) => ({
            eventNumber: eventNumberById.get(team.meetEventId) ?? undefined,
            eventSuffix: eventSuffixById.get(team.meetEventId),
            relayLetter: team.letter,
            seedTime: hostPackSeedTime(team.seedTimeMs),
            swimmerNames: team.legs.map((leg) =>
              `${leg.firstName} ${leg.lastName}`.trim(),
            ),
            teamCode: snapshot.team.teamCode,
          })),
  };
}
