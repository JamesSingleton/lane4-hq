/**
 * Results files for teams to import into their team manager (Hy-Tek Team
 * Manager, TeamUnify, SwimTopia, Commit Swimming). One pack per team, since
 * each Hy-Tek file carries a single team.
 */
import {
  buildEventKey,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import type {
  ParsedAthlete,
  ParsedEntry,
  ParsedEvent,
  ParsedMeet,
  ParsedRelayEntry,
  ParsedResult,
} from "@lane4hq/swim-formats";
import { exportHy3 } from "@lane4hq/swim-formats/export";
import { strToU8, zipSync } from "fflate";
import {
  athleteName,
  displayTime,
  eventTitle,
  indexMeet,
  markLabel,
  toHundredths,
} from "./labels";
import type { Entry, Meet, MeetEvent } from "./model";
import { eventStandings } from "./standings";

function parsedEvent(event: MeetEvent, meet: Meet): ParsedEvent {
  return {
    eventNumber: event.number,
    distance: event.distance,
    stroke: event.stroke,
    gender: event.gender,
    ageGroup: event.ageGroup,
    eventKey: buildEventKey(
      event.distance,
      event.stroke as Stroke | RelayStroke,
      meet.course,
      event.gender,
    ),
    roundType: event.round === "prelim" ? "prelim" : undefined,
  };
}

function resultTime(timeMs: number | null): string {
  return timeMs == null ? "" : displayTime(toHundredths(timeMs));
}
/** One team's slice of the meet, shaped for the swim-formats exporters. */
export function teamResultsMeet(meet: Meet, teamCode: string): ParsedMeet {
  const index = indexMeet(meet);
  const team = meet.teams.find((t) => t.code === teamCode);
  const teamEntries = meet.entries.filter((e) => e.teamCode === teamCode);
  const eventIds = new Set(teamEntries.map((e) => e.eventId));
  const events = meet.events.filter(
    (e) => eventIds.has(e.id) && e.kind === "swim",
  );
  // Hy-Tek files carry prelims and finals under one event number.
  const fileEvents = events.filter(
    (e) =>
      e.round !== "final" ||
      !events.some((p) => p.number === e.number && p.round !== "final"),
  );
  const heatOf = new Map<string, { heat: number; lane: number }>();
  for (const heat of meet.heats) {
    for (const l of heat.lanes)
      heatOf.set(l.entryId, { heat: heat.number, lane: l.lane });
  }

  const places = new Map<string, number | null>();
  for (const event of events) {
    for (const row of eventStandings(meet, event.id))
      places.set(row.entry.id, row.place);
  }
  const resultByEntry = new Map(meet.results.map((r) => [r.entryId, r]));

  const entries: ParsedEntry[] = [];
  const results: ParsedResult[] = [];
  const relays: ParsedRelayEntry[] = [];
  const individualAthletes = new Set<string>();

  const relayByEntry = new Map<string, ParsedRelayEntry>();
  const entryIds = new Set(teamEntries.map((e) => e.id));
  const isFinalsOf = (entry: Entry) =>
    entry.sourceEntryId != null && entryIds.has(entry.sourceEntryId);
  const ordered = [
    ...teamEntries.filter((e) => !isFinalsOf(e)),
    ...teamEntries.filter(isFinalsOf),
  ];

  for (const entry of ordered) {
    const event = index.event(entry.eventId);
    if (event?.kind !== "swim") continue;
    const seat = heatOf.get(entry.id);
    const result = resultByEntry.get(entry.id);
    const swam = result && (result.status === "ok" || result.status === "dq");
    const round = event.round === "prelim" ? "prelim" : "finals";
    const finalsOf = isFinalsOf(entry) ? entry.sourceEntryId : undefined;

    if (entry.relay && finalsOf) {
      if (swam) {
        relayByEntry.get(finalsOf)?.results?.push({
          time: resultTime(result.timeMs),
          place: places.get(entry.id) ?? undefined,
          isDq: result.status === "dq",
          dqCode: result.dqCode,
          heat: result.heat,
          lane: result.lane,
          resultType: round,
          exhibition: entry.exhibition,
        });
      }
      continue;
    }

    if (entry.relay) {
      const relay: ParsedRelayEntry = {
        eventNumber: event.number,
        swimmerNames: entry.relay.legAthleteIds.map((id) => {
          const a = index.athlete(id);
          return a ? athleteName(a) : "";
        }),
        seedTime: entry.seedTimeMs ? displayTime(entry.seedTimeMs) : undefined,
        teamCode,
        relayLetter: entry.relay.letter,
        results: swam
          ? [
              {
                time: resultTime(result.timeMs),
                place: places.get(entry.id) ?? undefined,
                isDq: result.status === "dq",
                dqCode: result.dqCode,
                heat: result.heat,
                lane: result.lane,
                resultType: round,
                exhibition: entry.exhibition,
              },
            ]
          : [],
      };
      relays.push(relay);
      relayByEntry.set(entry.id, relay);
      continue;
    }

    const athlete = entry.athleteId
      ? index.athlete(entry.athleteId)
      : undefined;
    if (!athlete) continue;
    individualAthletes.add(athlete.id);
    const swimmerName = athleteName(athlete);
    if (!finalsOf) {
      entries.push({
        eventNumber: event.number,
        swimmerName,
        seedTime: entry.seedTimeMs ? displayTime(entry.seedTimeMs) : undefined,
        usaMemberId: athlete.usaMemberId,
        dateOfBirth: athlete.dateOfBirth,
        gender: athlete.gender,
        exhibition: entry.exhibition,
        heat: seat?.heat,
        lane: seat?.lane,
      });
    }
    if (swam) {
      results.push({
        eventNumber: event.number,
        swimmerName,
        time: resultTime(result.timeMs),
        place: places.get(entry.id) ?? undefined,
        isDq: result.status === "dq",
        dqCode: result.dqCode,
        usaMemberId: athlete.usaMemberId,
        dateOfBirth: athlete.dateOfBirth,
        gender: athlete.gender,
        teamCode,
        resultType: round,
        heat: result.heat,
        lane: result.lane,
        exhibition: entry.exhibition,
        splitsMs: result.splitsMs.length > 1 ? result.splitsMs : undefined,
      });
    }
  }

  const athletes: ParsedAthlete[] = meet.athletes
    .filter((a) => a.teamCode === teamCode)
    .map((a) => ({
      name: athleteName(a),
      usaMemberId: a.usaMemberId,
      dateOfBirth: a.dateOfBirth,
      gender: a.gender,
      relayOnly: !individualAthletes.has(a.id),
    }));

  return {
    name: meet.name,
    startDate: meet.startDate,
    endDate: meet.endDate,
    course: meet.course,
    location: meet.location,
    events: fileEvents.map((e) => parsedEvent(e, meet)),
    entries,
    results,
    relays,
    athletes,
    importKind: "results",
    teamCode,
    lscCode: team?.lsc,
    teamName: team?.name,
  };
}

function safeStem(text: string): string {
  return (
    text
      .replace(/[/\\?%*:|"<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Meet"
  );
}

function ddMmmYyyy(date: string | undefined): string {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  const mon = months.slice((Number(m[2]) - 1) * 3, Number(m[2]) * 3);
  return `${m[3]}${mon}${m[1]}`;
}

/** TM-style stem: `MARI-AZ-Results-2026 Croswhite Invite-12Sep2026-001`. */
export function teamResultsStem(meet: Meet, teamCode: string): string {
  const team = meet.teams.find((t) => t.code === teamCode);
  const prefix = team?.lsc ? `${teamCode}-${team.lsc}` : teamCode;
  const date = ddMmmYyyy(meet.startDate);
  return `${prefix}-Results-${safeStem(meet.name)}${date ? `-${date}` : ""}-001`;
}

export type ExportFile = { filename: string; bytes: Uint8Array };

/**
 * Only HY3 goes in the pack: it round-trips exactly (times, places, DQ codes,
 * relays). The swim-formats CL2 and SD3 result writers don't yet re-import
 * cleanly (CL2 G0 drops the event number; SD3 D0/G0 columns disagree with
 * the parser), so they stay out until they have golden round-trip coverage.
 */
function teamFiles(
  meet: Meet,
  teamCode: string,
  dir = "",
): Record<string, Uint8Array> {
  const parsed = teamResultsMeet(meet, teamCode);
  const stem = teamResultsStem(meet, teamCode);
  return { [`${dir}${stem}.hy3`]: strToU8(exportHy3(parsed)) };
}

/** One team's results, zipped the way Team Manager expects. */
export function exportTeamResults(meet: Meet, teamCode: string): ExportFile {
  return {
    filename: `${teamResultsStem(meet, teamCode)}.zip`,
    bytes: zipSync(teamFiles(meet, teamCode), { level: 6 }),
  };
}

/** Every team's results pack in one ZIP, one folder per team. */
export function exportAllTeamResults(meet: Meet): ExportFile {
  const files: Record<string, Uint8Array> = {};
  for (const team of meet.teams) {
    if (!meet.entries.some((e) => e.teamCode === team.code)) continue;
    Object.assign(files, teamFiles(meet, team.code, `${team.code}/`));
  }
  const date = ddMmmYyyy(meet.startDate);
  return {
    filename: `Results-${safeStem(meet.name)}${date ? `-${date}` : ""}.zip`,
    bytes: zipSync(files, { level: 6 }),
  };
}

/** Plain CSV of every result, for spreadsheets and anything else. */
export function exportResultsCsv(meet: Meet): ExportFile {
  const index = indexMeet(meet);
  const rows = [
    [
      "Event",
      "Event name",
      "Heat",
      "Lane",
      "Place",
      "Team",
      "Swimmer",
      "Time",
      "Status",
      "Splits",
    ],
  ];
  for (const event of meet.events) {
    for (const row of eventStandings(meet, event.id)) {
      rows.push([
        String(event.number),
        eventTitle(event),
        String(row.result.heat),
        String(row.result.lane),
        row.place == null ? "" : String(row.place),
        row.entry.teamCode,
        index.entryLabel(row.entry),
        markLabel(row.result),
        row.result.status.toUpperCase(),
        row.result.splitsMs.map((s) => displayTime(s)).join(" "),
      ]);
    }
  }
  const csv = rows
    .map((r) =>
      r
        .map((cell) =>
          /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell,
        )
        .join(","),
    )
    .join("\r\n");
  return {
    filename: `${safeStem(meet.name)} Results.csv`,
    bytes: strToU8(`${csv}\r\n`),
  };
}
