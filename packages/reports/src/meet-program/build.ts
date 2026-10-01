/**
 * Meet-manager print reports built from a running meet: the heat sheet
 * (psych program for the deck and the stands) and the results book.
 */
import { finalsEventFor } from "@lane4hq/meet-engine/finals";
import {
  displayTime,
  eventTitle,
  finalLabel,
  indexMeet,
  markLabel,
} from "@lane4hq/meet-engine/labels";
import type { Athlete, Meet, MeetEvent } from "@lane4hq/meet-engine/model";
import { heatsForEvent } from "@lane4hq/meet-engine/seeding";
import { eventStandings, teamScores } from "@lane4hq/meet-engine/standings";
import {
  formatCourseLabel,
  formatMeetDateCompact,
} from "../meet-entries/build";

export type MeetReportChrome = {
  reportTitle: string;
  meetName: string;
  /** "12-Sep-26", or a range for multi-day meets. */
  meetDateLabel: string | null;
  courseLabel: string;
  location: string | null;
  generatedAtLabel: string;
};

export type MeetReportEventKind = "individual" | "relay" | "dive";

export type HeatSheetRow = {
  /** Lane, or place in the dive order. */
  lane: number;
  name: string;
  age: number | null;
  team: string;
  seed: string;
  exhibition: boolean;
  /** Relays: swimmers in leg order. */
  legs: string[];
};

export type HeatSheetHeat = {
  /** "Heat 2 of 3", "A Final", or "Dive order". */
  label: string;
  rows: HeatSheetRow[];
};

export type HeatSheetEvent = {
  eventId: string;
  number: number;
  title: string;
  kind: MeetReportEventKind;
  heats: HeatSheetHeat[];
};

export type HeatSheetReport = MeetReportChrome & { events: HeatSheetEvent[] };

export type ResultRow = {
  /** "1", "2", … or "--" for unplaced swims. */
  place: string;
  name: string;
  age: number | null;
  team: string;
  seed: string;
  /** Time, dive points, or DQ/NS/DNF. */
  mark: string;
  /** Points, blank when none. */
  points: string;
  exhibition: boolean;
  /** DQ code or other note. */
  note: string | null;
  /** Cumulative splits. */
  splits: string[];
  legs: string[];
};

export type ResultSection = {
  /** "A Final", … for finals; null for one ranked list. */
  label: string | null;
  rows: ResultRow[];
};

export type ResultsEvent = {
  eventId: string;
  number: number;
  title: string;
  kind: MeetReportEventKind;
  /** Column header for the mark: Finals / Prelims / Score. */
  markLabel: string;
  sections: ResultSection[];
};

export type TeamScoreRow = { rank: number; team: string; points: string };

export type MeetResultsReport = MeetReportChrome & {
  events: ResultsEvent[];
  teamScores: TeamScoreRow[];
};

export type MeetReportOptions = {
  /** Limit to these events, e.g. one session or the event just finished. */
  eventIds?: string[];
  generatedAt?: Date;
};

/** Age on the meet's first day, from `YYYY-MM-DD`. */
export function ageOn(
  dateOfBirth: string | undefined,
  on: string | undefined,
): number | null {
  const dob = dateOfBirth?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const day = on?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dob || !day) return null;
  let age = Number(day[1]) - Number(dob[1]);
  const before =
    Number(day[2]) < Number(dob[2]) ||
    (Number(day[2]) === Number(dob[2]) && Number(day[3]) < Number(dob[3]));
  if (before) age--;
  return age >= 0 && age < 120 ? age : null;
}

function chrome(
  meet: Meet,
  reportTitle: string,
  generatedAt: Date,
): MeetReportChrome {
  let meetDateLabel: string | null = null;
  if (meet.startDate) {
    meetDateLabel = formatMeetDateCompact(meet.startDate);
    if (meet.endDate && meet.endDate !== meet.startDate) {
      meetDateLabel += ` to ${formatMeetDateCompact(meet.endDate)}`;
    }
  }
  return {
    reportTitle,
    meetName: meet.name,
    meetDateLabel,
    courseLabel: formatCourseLabel(meet.course),
    location: meet.location ?? null,
    generatedAtLabel: generatedAt.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function kindOf(event: MeetEvent): MeetReportEventKind {
  if (event.kind === "dive") return "dive";
  return event.isRelay ? "relay" : "individual";
}

function eventsFor(meet: Meet, options: MeetReportOptions): MeetEvent[] {
  if (!options.eventIds) return meet.events;
  const wanted = new Set(options.eventIds);
  return meet.events.filter((e) => wanted.has(e.id));
}

function lastFirst(a: Athlete | undefined): string {
  if (!a) return "Unknown";
  return a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName;
}

function describer(meet: Meet) {
  const index = indexMeet(meet);
  return (entryId: string) => {
    const entry = index.entry(entryId)!;
    const team = index.teamName(entry.teamCode);
    if (entry.relay) {
      return {
        entry,
        name: `${team} '${entry.relay.letter}'`,
        age: null,
        team: entry.teamCode,
        legs: entry.relay.legAthleteIds.map((id) => {
          const a = index.athlete(id);
          const age = ageOn(a?.dateOfBirth, meet.startDate);
          return `${lastFirst(a)}${age == null ? "" : ` ${age}`}`;
        }),
      };
    }
    const athlete = entry.athleteId
      ? index.athlete(entry.athleteId)
      : undefined;
    return {
      entry,
      name: lastFirst(athlete),
      age: ageOn(athlete?.dateOfBirth, meet.startDate),
      team,
      legs: [],
    };
  };
}

function seedLabel(event: MeetEvent, seedTimeMs: number | null): string {
  if (event.kind === "dive") return "";
  return displayTime(seedTimeMs);
}

export function buildHeatSheetReport(
  meet: Meet,
  options: MeetReportOptions = {},
): HeatSheetReport {
  const describe = describer(meet);
  const events: HeatSheetEvent[] = [];
  for (const event of eventsFor(meet, options)) {
    const heats = heatsForEvent(meet, event.id).filter(
      (h) => h.lanes.length > 0,
    );
    if (heats.length === 0) continue;
    events.push({
      eventId: event.id,
      number: event.number,
      title: eventTitle(event),
      kind: kindOf(event),
      heats: heats.map((heat) => ({
        label:
          event.kind === "dive"
            ? "Dive order"
            : (finalLabel(event, heat.number) ??
              `Heat ${heat.number} of ${heats.length}`),
        rows: heat.lanes.map(({ lane, entryId }) => {
          const d = describe(entryId);
          return {
            lane,
            name: d.name,
            age: d.age,
            team: d.team,
            seed: seedLabel(event, d.entry.seedTimeMs),
            exhibition: d.entry.exhibition,
            legs: d.legs,
          };
        }),
      })),
    });
  }
  return {
    ...chrome(meet, "Heat sheet", options.generatedAt ?? new Date()),
    events,
  };
}

function pointsLabel(points: number): string {
  if (!points) return "";
  return Number.isInteger(points) ? String(points) : points.toFixed(2);
}

export function buildMeetResultsReport(
  meet: Meet,
  options: MeetReportOptions = {},
): MeetResultsReport {
  const describe = describer(meet);
  const events: ResultsEvent[] = [];
  for (const event of eventsFor(meet, options)) {
    const standings = eventStandings(meet, event.id);
    if (standings.length === 0) continue;
    const finals =
      event.round === "prelim" ? finalsEventFor(meet, event.id) : undefined;
    const qualified = new Set(
      meet.entries.flatMap((e) =>
        finals && e.eventId === finals.id && !e.scratched && e.sourceEntryId
          ? [e.sourceEntryId]
          : [],
      ),
    );
    const sections = new Map<string | null, ResultSection>();
    for (const row of standings) {
      const label = finalLabel(event, row.result.heat);
      let section = sections.get(label);
      if (!section) {
        section = { label, rows: [] };
        sections.set(label, section);
      }
      const d = describe(row.entry.id);
      const { result } = row;
      section.rows.push({
        place: row.place == null ? "--" : String(row.place),
        name: d.name,
        age: d.age,
        team: d.team,
        seed: seedLabel(event, row.entry.seedTimeMs),
        mark:
          result.status === "ok"
            ? markLabel(result)
            : result.status.toUpperCase(),
        points: pointsLabel(row.points),
        exhibition: row.entry.exhibition,
        note:
          result.status === "dq"
            ? (result.dqCode ?? null)
            : qualified.has(row.entry.id)
              ? "q"
              : null,
        splits:
          result.splitsMs.length > 1
            ? result.splitsMs.map((s) => displayTime(s))
            : [],
        legs: d.legs,
      });
    }
    events.push({
      eventId: event.id,
      number: event.number,
      title: eventTitle(event),
      kind: kindOf(event),
      markLabel:
        event.kind === "dive"
          ? "Score"
          : event.round === "prelim"
            ? "Prelims"
            : "Finals",
      sections: [...sections.values()].sort((a, b) =>
        (a.label ?? "").localeCompare(b.label ?? ""),
      ),
    });
  }
  const names = new Map(meet.teams.map((t) => [t.code, t.name]));
  const scored = meet.scoring.individual.length > 0;
  return {
    ...chrome(meet, "Results", options.generatedAt ?? new Date()),
    events,
    teamScores: scored
      ? teamScores(meet).map((s, i) => ({
          rank: i + 1,
          team: names.get(s.teamCode) ?? s.teamCode,
          points: pointsLabel(s.points) || "0",
        }))
      : [],
  };
}
