import { formatDateOnly, parseDateOnly } from "./calendar-date";
import { isRelayStroke } from "./entry-limits";
import { formatEventName, formatGenderLabel } from "./events";
import {
  blocksMeetEntryForAttendance,
  indexMeetCommitments,
  type MeetCommitmentMaps,
} from "./meet-attendance";
import { deriveRelayLetter } from "./relay-legs";
import { blocksMeetEntries, parseTeamType } from "./team-types";
import { formatTime } from "./times";

export type MeetLineupCourse = "SCY" | "SCM" | "LCM";

export type MeetLineupMember = {
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  governingBodyId?: string | null;
  classYear?: string | null;
  eligibilityStatus?: string | null;
};

export type MeetLineupEventInput = {
  id: string;
  eventNumber: number | null;
  eventSuffix?: string | null;
  stroke: string;
  distance: number;
  gender: string;
  ageGroup?: string | null;
  eventKey: string;
  eventKind?: "swim" | "dive";
  diveCount?: number | null;
};

export type MeetLineupEntryInput = {
  id: string;
  meetEventId: string;
  membershipId: string;
  seedTimeMs: number | null;
  exhibition: boolean;
  entryNotes?: string | null;
  status: string;
};

export type MeetLineupRelayLegInput = {
  meetEventId: string;
  relayLetter?: string | null;
  legOrder: number;
  membershipId: string;
};

export type MeetLineupRelayTeamInput = {
  meetEventId: string;
  relayLetter: string;
  seedTimeMs: number | null;
};

export type MeetLineupCommitmentInput = {
  membershipId: string;
  status: string;
  relayOnly?: boolean;
};

/** Host-pack / roster relay-only: explicit flag or relay assignment without individuals. */
export function isRelayOnlyMeetAthlete(input: {
  explicitRelayOnly: boolean;
  onRelayAssignment: boolean;
  hasRacingIndividual: boolean;
}): boolean {
  if (input.hasRacingIndividual) return false;
  return input.explicitRelayOnly || input.onRelayAssignment;
}

function explicitRelayOnlyIds(
  commitments: MeetLineupCommitmentInput[] | undefined,
): Set<string> {
  return new Set(
    (commitments ?? [])
      .filter(
        (commitment) =>
          commitment.relayOnly &&
          !blocksMeetEntryForAttendance(commitment.status),
      )
      .map((commitment) => commitment.membershipId),
  );
}

export type MeetLineupTeamInput = {
  name?: string | null;
  teamCode?: string | null;
  lscCode?: string | null;
  teamType?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

export type BuildMeetLineupSnapshotInput = {
  meet: {
    name: string;
    startDate: Date | string;
    endDate?: Date | string | null;
    course: MeetLineupCourse;
    location?: string | null;
    opponents?: string | null;
  };
  team?: MeetLineupTeamInput;
  events: MeetLineupEventInput[];
  entries: MeetLineupEntryInput[];
  relayLegs: MeetLineupRelayLegInput[];
  relayTeams?: MeetLineupRelayTeamInput[];
  commitments?: MeetLineupCommitmentInput[];
  members: MeetLineupMember[];
};

export type LineupInclusion = {
  scratched: boolean;
  notGoing: boolean;
  pending: boolean;
  meetNotEligible: boolean;
  ineligible: boolean;
  missingFromRoster: boolean;
};

/** Host packs omit these people; paper review keeps them. */
export function isHostPackExcluded(inclusion: LineupInclusion): boolean {
  return (
    inclusion.notGoing ||
    inclusion.pending ||
    inclusion.meetNotEligible ||
    inclusion.ineligible ||
    inclusion.missingFromRoster
  );
}

export type MeetLineupEvent = MeetLineupEventInput & {
  isRelay: boolean;
};

export type MeetLineupIndividual = {
  id: string;
  meetEventId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  seedTimeMs: number | null;
  exhibition: boolean;
  entryNotes: string | null;
  status: string;
  gender: string | null;
  classYear: string | null;
  inclusion: LineupInclusion;
};

export type MeetLineupRelayLeg = {
  membershipId: string;
  firstName: string;
  lastName: string;
  legOrder: number;
  classYear: string | null;
  inclusion: LineupInclusion;
};

export type MeetLineupRelayTeam = {
  meetEventId: string;
  letter: string;
  seedTimeMs: number | null;
  legs: MeetLineupRelayLeg[];
};

export type MeetLineupAthlete = {
  membershipId: string;
  swimmerId: string | null;
  name: string;
  usaMemberId?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
  classYear?: string;
  relayOnly: boolean;
  inclusion: LineupInclusion;
};

export type MeetLineupSnapshot = {
  meet: {
    name: string;
    startDate: string;
    endDate?: string;
    course: MeetLineupCourse;
    location?: string;
    opponents?: string;
  };
  team: {
    name?: string;
    teamCode?: string;
    lscCode?: string;
    teamKind?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    contactName?: string;
    contactEmail?: string;
  };
  events: MeetLineupEvent[];
  individuals: MeetLineupIndividual[];
  relayTeams: MeetLineupRelayTeam[];
  athletes: MeetLineupAthlete[];
};

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return formatDateOnly(value);
  const parsed = parseDateOnly(value.trim().slice(0, 10));
  return parsed ? formatDateOnly(parsed) : value.trim().slice(0, 10);
}

function optionalDateOnly(
  value: Date | string | null | undefined,
): string | undefined {
  if (value == null || value === "") return undefined;
  return toDateOnly(value);
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function displayGender(
  value: string | null | undefined,
): "male" | "female" | undefined {
  return value === "male" || value === "female" ? value : undefined;
}

function sortEvents(a: MeetLineupEvent, b: MeetLineupEvent): number {
  const an = a.eventNumber ?? Number.MAX_SAFE_INTEGER;
  const bn = b.eventNumber ?? Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  return a.id.localeCompare(b.id);
}

function memberName(member: MeetLineupMember | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!member) return { firstName: "Unknown", lastName: "" };
  return { firstName: member.firstName, lastName: member.lastName };
}

function inclusionFor(
  membershipId: string,
  member: MeetLineupMember | undefined,
  maps: MeetCommitmentMaps,
  scratched: boolean,
): LineupInclusion {
  const profileIneligible = blocksMeetEntries(member?.eligibilityStatus);
  const meetNotEligible = maps.meetNotEligibleIds.has(membershipId);
  return {
    scratched,
    notGoing: maps.notGoingIds.has(membershipId),
    pending: maps.pendingIds.has(membershipId),
    meetNotEligible,
    ineligible: profileIneligible || meetNotEligible,
    missingFromRoster: !member,
  };
}

function athleteFromMember(
  membershipId: string,
  member: MeetLineupMember | undefined,
  inclusion: LineupInclusion,
  relayOnly: boolean,
): MeetLineupAthlete {
  const { firstName, lastName } = memberName(member);
  return {
    membershipId,
    swimmerId: member?.swimmerId ?? null,
    name: `${firstName} ${lastName}`.trim(),
    usaMemberId: member?.governingBodyId ?? undefined,
    dateOfBirth: member?.dateOfBirth ?? undefined,
    gender: displayGender(member?.gender),
    classYear: optionalText(member?.classYear),
    relayOnly,
    inclusion,
  };
}

/**
 * Visiting-team lineup for one meet. Status stays on the snapshot;
 * host packs apply {@link hostPackLineup} instead of rebuilding.
 */
export function buildMeetLineupSnapshot(
  input: BuildMeetLineupSnapshotInput,
): MeetLineupSnapshot {
  const membersById = new Map(
    input.members.map((member) => [member.membershipId, member] as const),
  );
  const commitmentMaps = indexMeetCommitments(input.commitments);
  const declaredRelayOnlyIds = explicitRelayOnlyIds(input.commitments);
  const eventById = new Map(input.events.map((event) => [event.id, event]));

  const events = input.events
    .map((event) => ({
      ...event,
      isRelay: isRelayStroke(event.stroke, event.eventKey),
    }))
    .slice()
    .sort(sortEvents);

  const individuals: MeetLineupIndividual[] = [];
  for (const entry of input.entries) {
    const event = eventById.get(entry.meetEventId);
    if (!event || isRelayStroke(event.stroke, event.eventKey)) continue;
    const member = membersById.get(entry.membershipId);
    const { firstName, lastName } = memberName(member);
    individuals.push({
      id: entry.id,
      meetEventId: entry.meetEventId,
      membershipId: entry.membershipId,
      firstName,
      lastName,
      seedTimeMs: entry.seedTimeMs,
      exhibition: entry.exhibition,
      entryNotes: entry.entryNotes ?? null,
      status: entry.status,
      gender: member?.gender ?? event.gender,
      classYear: optionalText(member?.classYear) ?? null,
      inclusion: inclusionFor(
        entry.membershipId,
        member,
        commitmentMaps,
        entry.status === "scratched",
      ),
    });
  }

  const seedByKey = new Map(
    (input.relayTeams ?? []).map((team) => {
      const letter = deriveRelayLetter(team.relayLetter, 1);
      return [`${team.meetEventId}:${letter}`, team.seedTimeMs] as const;
    }),
  );

  const groups = new Map<
    string,
    { meetEventId: string; letter: string; legs: MeetLineupRelayLeg[] }
  >();
  for (const leg of input.relayLegs) {
    const letter = deriveRelayLetter(leg.relayLetter, leg.legOrder);
    const key = `${leg.meetEventId}:${letter}`;
    const member = membersById.get(leg.membershipId);
    const { firstName, lastName } = memberName(member);
    const group = groups.get(key) ?? {
      meetEventId: leg.meetEventId,
      letter,
      legs: [],
    };
    group.legs.push({
      membershipId: leg.membershipId,
      firstName,
      lastName,
      legOrder: leg.legOrder,
      classYear: optionalText(member?.classYear) ?? null,
      inclusion: inclusionFor(leg.membershipId, member, commitmentMaps, false),
    });
    groups.set(key, group);
  }

  const relayTeams: MeetLineupRelayTeam[] = [...groups.values()]
    .map((group) => ({
      meetEventId: group.meetEventId,
      letter: group.letter,
      seedTimeMs: seedByKey.get(`${group.meetEventId}:${group.letter}`) ?? null,
      legs: [...group.legs].sort((a, b) => a.legOrder - b.legOrder),
    }))
    .sort((a, b) => {
      if (a.meetEventId !== b.meetEventId) {
        return a.meetEventId.localeCompare(b.meetEventId);
      }
      return a.letter.localeCompare(b.letter);
    });

  const racingIndividualIds = new Set(
    individuals
      .filter((entry) => !entry.inclusion.scratched)
      .map((entry) => entry.membershipId),
  );
  const athleteIds = new Set<string>([
    ...individuals.map((entry) => entry.membershipId),
    ...relayTeams.flatMap((team) => team.legs.map((leg) => leg.membershipId)),
    ...declaredRelayOnlyIds,
  ]);

  const athletes: MeetLineupAthlete[] = [...athleteIds].map((membershipId) => {
    const member = membersById.get(membershipId);
    const onRelay = relayTeams.some((team) =>
      team.legs.some((leg) => leg.membershipId === membershipId),
    );
    const explicitRelayOnly = declaredRelayOnlyIds.has(membershipId);
    const anyIndividual = individuals.find(
      (entry) => entry.membershipId === membershipId,
    );
    const inclusion = inclusionFor(
      membershipId,
      member,
      commitmentMaps,
      Boolean(anyIndividual?.inclusion.scratched) && !onRelay,
    );
    return athleteFromMember(
      membershipId,
      member,
      inclusion,
      isRelayOnlyMeetAthlete({
        explicitRelayOnly,
        onRelayAssignment: onRelay,
        hasRacingIndividual: racingIndividualIds.has(membershipId),
      }),
    );
  });

  const team = input.team ?? {};
  const teamType = parseTeamType(team.teamType);

  return {
    meet: {
      name: input.meet.name,
      startDate: toDateOnly(input.meet.startDate),
      endDate: optionalDateOnly(input.meet.endDate),
      course: input.meet.course,
      location: optionalText(input.meet.location),
      opponents: optionalText(input.meet.opponents),
    },
    team: {
      name: optionalText(team.name),
      teamCode: optionalText(team.teamCode),
      lscCode: optionalText(team.lscCode),
      teamKind: teamType === "high_school" ? "HS" : undefined,
      addressLine1: optionalText(team.addressLine1),
      addressLine2: optionalText(team.addressLine2),
      city: optionalText(team.city),
      region: optionalText(team.region),
      postalCode: optionalText(team.postalCode),
      country: optionalText(team.country),
      contactName: optionalText(team.contactName),
      contactEmail: optionalText(team.contactEmail),
    },
    events,
    individuals,
    relayTeams,
    athletes,
  };
}

/** Same snapshot, without people a host pack must omit. */
export function hostPackLineup(
  snapshot: MeetLineupSnapshot,
): MeetLineupSnapshot {
  const individuals = snapshot.individuals.filter(
    (entry) =>
      !entry.inclusion.scratched && !isHostPackExcluded(entry.inclusion),
  );
  const relayTeams = snapshot.relayTeams
    .map((team) => ({
      ...team,
      legs: team.legs.filter((leg) => !isHostPackExcluded(leg.inclusion)),
    }))
    .filter((team) => team.legs.length > 0);

  const athleteIds = new Set([
    ...individuals.map((entry) => entry.membershipId),
    ...relayTeams.flatMap((team) => team.legs.map((leg) => leg.membershipId)),
  ]);
  const racingIndividualIds = new Set(
    individuals.map((entry) => entry.membershipId),
  );
  const athletes = snapshot.athletes
    .filter(
      (athlete) =>
        !isHostPackExcluded(athlete.inclusion) &&
        (athleteIds.has(athlete.membershipId) ||
          (athlete.relayOnly &&
            !racingIndividualIds.has(athlete.membershipId))),
    )
    .map((athlete) => {
      const onRelay = relayTeams.some((team) =>
        team.legs.some((leg) => leg.membershipId === athlete.membershipId),
      );
      const wasRelayOnly = athlete.relayOnly;
      return {
        ...athlete,
        relayOnly: isRelayOnlyMeetAthlete({
          explicitRelayOnly: wasRelayOnly && !onRelay,
          onRelayAssignment: onRelay,
          hasRacingIndividual: racingIndividualIds.has(athlete.membershipId),
        }),
      };
    });

  return { ...snapshot, individuals, relayTeams, athletes };
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(cells: string[]): string {
  return cells.map(escapeCsv).join(",");
}

function eventLabel(event: MeetLineupEvent): string {
  const base = formatEventName(event.distance, event.stroke);
  const age = event.ageGroup ? ` (${event.ageGroup})` : "";
  return `${base}${age}`;
}

function seedCell(seedTimeMs: number | null): string {
  if (seedTimeMs == null || seedTimeMs <= 0) return "";
  return formatTime(seedTimeMs);
}

function swimmerName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Spreadsheet of the snapshot. Does not regroup relays. */
export function formatMeetLineupCsv(snapshot: MeetLineupSnapshot): string {
  const headers = [
    "Event #",
    "Event Name",
    "Type",
    "Gender",
    "Age Group",
    "Swimmer",
    "Seed Time",
    "Exhibition",
    "Leg 1",
    "Leg 2",
    "Leg 3",
    "Leg 4",
    "Notes",
  ];
  const rows: string[] = [rowToCsv(headers)];
  const teamsByEvent = new Map<string, MeetLineupRelayTeam[]>();
  for (const team of snapshot.relayTeams) {
    const list = teamsByEvent.get(team.meetEventId) ?? [];
    list.push(team);
    teamsByEvent.set(team.meetEventId, list);
  }

  for (const event of snapshot.events) {
    if (event.isRelay) {
      const teams = teamsByEvent.get(event.id) ?? [];
      for (const team of teams) {
        const legNames = [1, 2, 3, 4].map((order) => {
          const leg = team.legs.find((item) => item.legOrder === order);
          return leg ? swimmerName(leg.firstName, leg.lastName) : "";
        });
        rows.push(
          rowToCsv([
            event.eventNumber?.toString() ?? "",
            eventLabel(event),
            "Relay",
            formatGenderLabel(event.gender),
            event.ageGroup ?? "",
            `Relay ${team.letter}`,
            seedCell(team.seedTimeMs),
            "",
            ...legNames,
            "",
          ]),
        );
      }
      continue;
    }

    for (const entry of snapshot.individuals) {
      if (entry.meetEventId !== event.id || entry.inclusion.scratched) continue;
      rows.push(
        rowToCsv([
          event.eventNumber?.toString() ?? "",
          eventLabel(event),
          "Individual",
          formatGenderLabel(event.gender),
          event.ageGroup ?? "",
          swimmerName(entry.firstName, entry.lastName),
          seedCell(entry.seedTimeMs),
          entry.exhibition ? "Yes" : "",
          "",
          "",
          "",
          "",
          entry.entryNotes ?? "",
        ]),
      );
    }
  }

  return `${rows.join("\n")}\n`;
}
