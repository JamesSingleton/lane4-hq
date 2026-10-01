import { normalizePersonName } from "@lane4hq/swim-core/people";
import { parseTime } from "@lane4hq/swim-core/times";
import type { ParsedMeet } from "@lane4hq/swim-formats";
import { touch } from "./create";
import {
  type Athlete,
  type Entry,
  type IdFactory,
  type Meet,
  randomId,
  type Team,
} from "./model";

export function parsePersonName(name: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const comma = trimmed.indexOf(",");
  if (comma !== -1) {
    return {
      lastName: trimmed.slice(0, comma).trim(),
      firstName: trimmed.slice(comma + 1).trim(),
    };
  }
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: parts[0]! };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

const FILE_TEAM = /^([A-Z0-9]{2,5})-([A-Z]{2})-/i;

/**
 * Best guess at the team an entry pack belongs to. Team Manager packs don't
 * always carry C1 in a form the parser surfaces, so fall back to the TM file
 * stem (`MARI-AZ-Entries-…`). The operator confirms before import.
 */
export function detectTeam(parsed: ParsedMeet, filename?: string): Team {
  const fromFile = filename?.split(/[\\/]/).pop()?.match(FILE_TEAM);
  const code = (
    parsed.teamCode ??
    parsed.relays?.find((r) => r.teamCode)?.teamCode ??
    parsed.results.find((r) => r.teamCode)?.teamCode ??
    fromFile?.[1] ??
    ""
  )
    .trim()
    .toUpperCase();
  return {
    code,
    name: parsed.teamName?.trim() || code,
    lsc: (parsed.lscCode ?? fromFile?.[2])?.toUpperCase(),
  };
}

function seedMs(seed: string | undefined): number | null {
  if (!seed || /^(NT|NS)$/i.test(seed.trim())) return null;
  const ms = parseTime(seed.replace(/[A-Z]+$/i, ""));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function identityKey(a: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}): string {
  return `${normalizePersonName(`${a.firstName} ${a.lastName}`)}|${a.dateOfBirth ?? ""}`;
}

export type MergeSummary = {
  team: Team;
  added: number;
  replaced: number;
  kept: number;
  athletes: number;
  /** Entries for event numbers the meet doesn't have. */
  skipped: Array<{
    eventNumber: number | undefined;
    name: string;
    reason: string;
  }>;
  /** Heats that lost a lane because an entry was replaced; reseed them. */
  heatsNeedingReseed: string[];
};

/**
 * Merge one team's entry pack (HY3/CL2/SD3/ZIP) into the meet. Re-importing
 * a team replaces its entries, except ones that already have results.
 */
export function mergeTeamEntries(
  meet: Meet,
  parsed: ParsedMeet,
  team: Team,
  options: { newId?: IdFactory; now?: Date } = {},
): { meet: Meet; summary: MergeSummary } {
  const newId = options.newId ?? randomId;
  const code = team.code.trim().toUpperCase();
  if (!code) throw new Error("Choose a team code before importing entries.");

  const eventsByNumber = new Map(meet.events.map((e) => [e.number, e]));
  const fileEvents = new Map(
    parsed.events
      .filter((e) => e.eventNumber != null)
      .map((e) => [e.eventNumber!, e]),
  );
  const skipped: MergeSummary["skipped"] = [];

  function meetEventFor(eventNumber: number | undefined, name: string) {
    const event =
      eventNumber == null ? undefined : eventsByNumber.get(eventNumber);
    if (!event) {
      skipped.push({ eventNumber, name, reason: "Event isn't in this meet" });
      return null;
    }
    const fileEvent = fileEvents.get(eventNumber!);
    if (
      fileEvent &&
      (fileEvent.distance !== event.distance ||
        fileEvent.stroke !== event.stroke ||
        fileEvent.gender !== event.gender)
    ) {
      skipped.push({
        eventNumber,
        name,
        reason: `File's event ${eventNumber} is a different race`,
      });
      return null;
    }
    return event;
  }

  // Reuse athlete ids for swimmers already on this team.
  const athletes = [...meet.athletes];
  const byKey = new Map<string, Athlete>();
  const byUsaId = new Map<string, Athlete>();
  const byName = new Map<string, Athlete>();
  for (const a of athletes) {
    if (a.teamCode !== code) continue;
    byKey.set(identityKey(a), a);
    if (a.usaMemberId) byUsaId.set(a.usaMemberId, a);
    byName.set(normalizePersonName(`${a.firstName} ${a.lastName}`), a);
  }
  let athleteCount = 0;
  const touched = new Set<string>();

  function athleteFor(
    name: string,
    details: Pick<Athlete, "gender" | "dateOfBirth" | "usaMemberId">,
  ): Athlete {
    const { firstName, lastName } = parsePersonName(name);
    const probe = { firstName, lastName, dateOfBirth: details.dateOfBirth };
    const existing =
      (details.usaMemberId ? byUsaId.get(details.usaMemberId) : undefined) ??
      byKey.get(identityKey(probe)) ??
      (details.dateOfBirth
        ? undefined
        : byName.get(normalizePersonName(`${firstName} ${lastName}`)));
    if (existing) {
      if (!touched.has(existing.id)) {
        touched.add(existing.id);
        athleteCount++;
      }
      // Fill in anything this file knows that the meet didn't.
      const merged: Athlete = {
        ...existing,
        gender: existing.gender ?? details.gender,
        dateOfBirth: existing.dateOfBirth ?? details.dateOfBirth,
        usaMemberId: existing.usaMemberId ?? details.usaMemberId,
      };
      athletes[athletes.indexOf(existing)] = merged;
      byKey.set(identityKey(merged), merged);
      byName.set(normalizePersonName(`${firstName} ${lastName}`), merged);
      if (merged.usaMemberId) byUsaId.set(merged.usaMemberId, merged);
      return merged;
    }
    const athlete: Athlete = {
      id: newId(),
      teamCode: code,
      firstName,
      lastName,
      ...details,
    };
    athletes.push(athlete);
    touched.add(athlete.id);
    athleteCount++;
    byKey.set(identityKey(athlete), athlete);
    byName.set(normalizePersonName(`${firstName} ${lastName}`), athlete);
    if (athlete.usaMemberId) byUsaId.set(athlete.usaMemberId, athlete);
    return athlete;
  }

  for (const a of parsed.athletes ?? []) {
    athleteFor(a.name, {
      gender: a.gender,
      dateOfBirth: a.dateOfBirth,
      usaMemberId: a.usaMemberId,
    });
  }

  const incoming: Entry[] = [];
  for (const entry of parsed.entries) {
    const event = meetEventFor(entry.eventNumber, entry.swimmerName);
    if (!event) continue;
    if (event.isRelay) {
      skipped.push({
        eventNumber: entry.eventNumber,
        name: entry.swimmerName,
        reason: "Individual entry in a relay event",
      });
      continue;
    }
    const athlete = athleteFor(entry.swimmerName, {
      gender: entry.gender,
      dateOfBirth: entry.dateOfBirth,
      usaMemberId: entry.usaMemberId,
    });
    incoming.push({
      id: newId(),
      eventId: event.id,
      teamCode: code,
      seedTimeMs: seedMs(entry.seedTime),
      exhibition: entry.exhibition ?? false,
      scratched: false,
      athleteId: athlete.id,
    });
  }
  for (const relay of parsed.relays ?? []) {
    const label = `${code} ${relay.relayLetter ?? "A"}`;
    const event = meetEventFor(relay.eventNumber, label);
    if (!event) continue;
    if (!event.isRelay) {
      skipped.push({
        eventNumber: relay.eventNumber,
        name: label,
        reason: "Relay entry in an individual event",
      });
      continue;
    }
    incoming.push({
      id: newId(),
      eventId: event.id,
      teamCode: code,
      seedTimeMs: seedMs(relay.seedTime),
      exhibition: false,
      scratched: false,
      relay: {
        letter: (relay.relayLetter ?? "A").toUpperCase(),
        legAthleteIds: relay.swimmerNames.map((n) => athleteFor(n, {}).id),
      },
    });
  }

  // Drop this team's previous entries unless they already have results.
  const withResults = new Set(meet.results.map((r) => r.entryId));
  const previous = meet.entries.filter((e) => e.teamCode === code);
  const kept = previous.filter((e) => withResults.has(e.id));
  const removed = new Set(
    previous.filter((e) => !withResults.has(e.id)).map((e) => e.id),
  );
  const keptKeys = new Set(kept.map((e) => entryKey(e)));
  const added = incoming.filter((e) => !keptKeys.has(entryKey(e)));

  const heatsNeedingReseed = new Set<string>();
  const heats = meet.heats.map((heat) => {
    const lanes = heat.lanes.filter((l) => !removed.has(l.entryId));
    if (lanes.length !== heat.lanes.length)
      heatsNeedingReseed.add(heat.eventId);
    return lanes.length === heat.lanes.length ? heat : { ...heat, lanes };
  });

  const teams = meet.teams.some((t) => t.code === code)
    ? meet.teams.map((t) => (t.code === code ? { ...t, ...team, code } : t))
    : [...meet.teams, { ...team, code }];

  const next = touch(
    {
      ...meet,
      teams: teams.sort((a, b) => a.code.localeCompare(b.code)),
      athletes,
      entries: [...meet.entries.filter((e) => !removed.has(e.id)), ...added],
      heats,
    },
    options.now,
  );
  return {
    meet: next,
    summary: {
      team: { ...team, code },
      added: added.length,
      replaced: removed.size,
      kept: kept.length,
      athletes: athleteCount,
      skipped,
      heatsNeedingReseed: [...heatsNeedingReseed],
    },
  };
}

function entryKey(entry: Entry): string {
  return entry.relay
    ? `${entry.eventId}|relay|${entry.relay.letter}`
    : `${entry.eventId}|${entry.athleteId}`;
}

export function scratchEntry(
  meet: Meet,
  entryId: string,
  scratched = true,
  now?: Date,
): Meet {
  return touch(
    {
      ...meet,
      entries: meet.entries.map((e) =>
        e.id === entryId ? { ...e, scratched } : e,
      ),
    },
    now,
  );
}

export function setSeedTime(
  meet: Meet,
  entryId: string,
  seedTimeMs: number | null,
  now?: Date,
): Meet {
  return touch(
    {
      ...meet,
      entries: meet.entries.map((e) =>
        e.id === entryId ? { ...e, seedTimeMs } : e,
      ),
    },
    now,
  );
}

/** Deck entry: a swimmer added at the meet. */
export function addIndividualEntry(
  meet: Meet,
  input: {
    eventId: string;
    teamCode: string;
    firstName: string;
    lastName: string;
    gender?: "male" | "female";
    seedTimeMs?: number | null;
    athleteId?: string;
  },
  options: { newId?: IdFactory; now?: Date } = {},
): Meet {
  const newId = options.newId ?? randomId;
  const code = input.teamCode.trim().toUpperCase();
  let athletes = meet.athletes;
  let athleteId = input.athleteId;
  if (!athleteId) {
    const athlete: Athlete = {
      id: newId(),
      teamCode: code,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      gender: input.gender,
    };
    athletes = [...athletes, athlete];
    athleteId = athlete.id;
  }
  const teams = meet.teams.some((t) => t.code === code)
    ? meet.teams
    : [...meet.teams, { code, name: code }];
  return touch(
    {
      ...meet,
      teams,
      athletes,
      entries: [
        ...meet.entries,
        {
          id: newId(),
          eventId: input.eventId,
          teamCode: code,
          seedTimeMs: input.seedTimeMs ?? null,
          exhibition: false,
          scratched: false,
          athleteId,
        },
      ],
    },
    options.now,
  );
}
