import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import {
  buildEventKey,
  type Course,
  formatGenderLabel,
  formatStrokeLabel,
  type Gender,
  parseEventKey,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import {
  individualEventKeyForRelayLeg,
  RELAY_PRIMARY_LEG_COUNT,
  RELAY_TEAM_LETTERS,
  relayLegRoleLabel,
} from "@lane4hq/swim-core/relay-legs";
import { formatTime } from "@lane4hq/swim-core/times";
import {
  formatCourseLabel,
  formatMeetDateCompact,
} from "../meet-entries/build";
import type {
  TeamBestTimesGenderSection,
  TeamBestTimesMatrixColumn,
  TeamBestTimesMatrixRow,
  TeamBestTimesRelaySuggestion,
  TeamBestTimesReport,
  TeamBestTimesReportInput,
  TeamBestTimesTimeRow,
} from "../types";

const SHORT_STROKE: Record<string, string> = {
  free: "Free",
  back: "Back",
  breast: "Breast",
  fly: "Fly",
  im: "IM",
  free_relay: "Free Relay",
  medley_relay: "Medley Relay",
};

const STROKE_SORT_ORDER: Record<string, number> = {
  free: 1,
  back: 2,
  breast: 3,
  fly: 4,
  im: 5,
};

/** SCY relay distances we attempt when individual PRs can fill an A team. */
const RELAY_CANDIDATES = [
  { distance: 200, stroke: "free_relay" as const },
  { distance: 400, stroke: "free_relay" as const },
  { distance: 200, stroke: "medley_relay" as const },
  { distance: 400, stroke: "medley_relay" as const },
] as const;

function compactEventTitle(distance: number, stroke: string): string {
  const short = SHORT_STROKE[stroke] ?? formatStrokeLabel(stroke);
  return `${distance} ${short}`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function sortColumns(columns: TeamBestTimesMatrixColumn[]): void {
  columns.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    const aOrder = STROKE_SORT_ORDER[a.stroke] ?? 99;
    const bOrder = STROKE_SORT_ORDER[b.stroke] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.stroke.localeCompare(b.stroke);
  });
}

function buildGenderSection(
  gender: Gender,
  times: TeamBestTimesTimeRow[],
): TeamBestTimesGenderSection | null {
  const genderTimes = times.filter((row) => row.gender === gender);
  if (genderTimes.length === 0) return null;

  const columnMap = new Map<string, TeamBestTimesMatrixColumn>();
  const swimmerMap = new Map<
    string,
    { name: string; timesByEventKey: Record<string, number | null> }
  >();

  for (const row of genderTimes) {
    if (isRelayStroke(row.stroke, row.eventKey)) continue;
    if (row.timeMs <= 0) continue;

    if (!columnMap.has(row.eventKey)) {
      columnMap.set(row.eventKey, {
        eventKey: row.eventKey,
        label: compactEventTitle(row.distance, row.stroke),
        distance: row.distance,
        stroke: row.stroke,
      });
    }

    let swimmer = swimmerMap.get(row.swimmerId);
    if (!swimmer) {
      swimmer = { name: row.swimmerName, timesByEventKey: {} };
      swimmerMap.set(row.swimmerId, swimmer);
    }
    const existing = swimmer.timesByEventKey[row.eventKey];
    if (existing == null || row.timeMs < existing) {
      swimmer.timesByEventKey[row.eventKey] = row.timeMs;
    }
  }

  const columns = [...columnMap.values()];
  if (columns.length === 0 || swimmerMap.size === 0) return null;
  sortColumns(columns);

  const rows: TeamBestTimesMatrixRow[] = [...swimmerMap.entries()]
    .map(([swimmerId, value]) => ({
      swimmerId,
      swimmerName: value.name,
      timesByEventKey: Object.fromEntries(
        columns.map((col) => [
          col.eventKey,
          value.timesByEventKey[col.eventKey] ?? null,
        ]),
      ),
    }))
    .sort((a, b) => a.swimmerName.localeCompare(b.swimmerName));

  return {
    gender,
    genderLabel: formatGenderLabel(gender),
    columns,
    rows,
  };
}

type SplitCandidate = {
  swimmerId: string;
  swimmerName: string;
  timeMs: number;
};

function bestByEventKey(
  times: TeamBestTimesTimeRow[],
  gender: Gender,
): Map<string, SplitCandidate[]> {
  const map = new Map<string, Map<string, SplitCandidate>>();
  for (const row of times) {
    if (row.gender !== gender) continue;
    if (isRelayStroke(row.stroke, row.eventKey)) continue;
    if (row.timeMs <= 0) continue;
    let bySwimmer = map.get(row.eventKey);
    if (!bySwimmer) {
      bySwimmer = new Map();
      map.set(row.eventKey, bySwimmer);
    }
    const existing = bySwimmer.get(row.swimmerId);
    if (!existing || row.timeMs < existing.timeMs) {
      bySwimmer.set(row.swimmerId, {
        swimmerId: row.swimmerId,
        swimmerName: row.swimmerName,
        timeMs: row.timeMs,
      });
    }
  }
  const ranked = new Map<string, SplitCandidate[]>();
  for (const [eventKey, bySwimmer] of map) {
    ranked.set(
      eventKey,
      [...bySwimmer.values()].sort((a, b) => a.timeMs - b.timeMs),
    );
  }
  return ranked;
}

export function suggestFreeRelayTeams(
  eventKey: string,
  title: string,
  gender: Gender,
  ranked: Map<string, SplitCandidate[]>,
): TeamBestTimesRelaySuggestion[] {
  const legKey = individualEventKeyForRelayLeg({
    relayEventKey: eventKey,
    legOrder: 1,
    swimmerGender: gender,
  });
  if (!legKey) return [];
  const pool = [...(ranked.get(legKey) ?? [])];
  if (pool.length < RELAY_PRIMARY_LEG_COUNT) return [];

  const suggestions: TeamBestTimesRelaySuggestion[] = [];
  for (
    let teamIndex = 0;
    teamIndex < RELAY_TEAM_LETTERS.length &&
    pool.length >= RELAY_PRIMARY_LEG_COUNT;
    teamIndex += 1
  ) {
    const legs = pool.splice(0, RELAY_PRIMARY_LEG_COUNT);
    const seedTimeMs = legs.reduce((sum, leg) => sum + leg.timeMs, 0);
    suggestions.push({
      eventKey,
      title,
      gender,
      genderLabel: formatGenderLabel(gender),
      letter: RELAY_TEAM_LETTERS[teamIndex]!,
      seedTimeMs,
      seedLabel: formatTime(seedTimeMs),
      legs: legs.map((leg, index) => ({
        legOrder: index + 1,
        roleLabel: relayLegRoleLabel("free_relay", index + 1),
        swimmerId: leg.swimmerId,
        swimmerName: leg.swimmerName,
        splitTimeMs: leg.timeMs,
        splitLabel: formatTime(leg.timeMs),
      })),
    });
  }
  return suggestions;
}

export function suggestMedleyRelayTeams(
  eventKey: string,
  title: string,
  gender: Gender,
  ranked: Map<string, SplitCandidate[]>,
): TeamBestTimesRelaySuggestion[] {
  const legKeys: string[] = [];
  for (let leg = 1; leg <= RELAY_PRIMARY_LEG_COUNT; leg += 1) {
    const key = individualEventKeyForRelayLeg({
      relayEventKey: eventKey,
      legOrder: leg,
      swimmerGender: gender,
    });
    if (!key) return [];
    legKeys.push(key);
  }

  const pools = legKeys.map((key) => [...(ranked.get(key) ?? [])]);
  if (pools.some((pool) => pool.length === 0)) return [];

  const suggestions: TeamBestTimesRelaySuggestion[] = [];
  const used = new Set<string>();

  for (
    let teamIndex = 0;
    teamIndex < RELAY_TEAM_LETTERS.length;
    teamIndex += 1
  ) {
    const picked: SplitCandidate[] = [];
    const teamUsed = new Set<string>();
    let ok = true;

    for (let leg = 0; leg < RELAY_PRIMARY_LEG_COUNT; leg += 1) {
      const candidate = pools[leg]!.find(
        (c) => !used.has(c.swimmerId) && !teamUsed.has(c.swimmerId),
      );
      if (!candidate) {
        ok = false;
        break;
      }
      picked.push(candidate);
      teamUsed.add(candidate.swimmerId);
    }

    if (!ok) break;

    for (const leg of picked) used.add(leg.swimmerId);
    const seedTimeMs = picked.reduce((sum, leg) => sum + leg.timeMs, 0);
    suggestions.push({
      eventKey,
      title,
      gender,
      genderLabel: formatGenderLabel(gender),
      letter: RELAY_TEAM_LETTERS[teamIndex]!,
      seedTimeMs,
      seedLabel: formatTime(seedTimeMs),
      legs: picked.map((leg, index) => ({
        legOrder: index + 1,
        roleLabel: relayLegRoleLabel("medley_relay", index + 1),
        swimmerId: leg.swimmerId,
        swimmerName: leg.swimmerName,
        splitTimeMs: leg.timeMs,
        splitLabel: formatTime(leg.timeMs),
      })),
    });
  }

  return suggestions;
}

function buildRelaySuggestions(
  times: TeamBestTimesTimeRow[],
  course: Course,
): TeamBestTimesRelaySuggestion[] {
  const suggestions: TeamBestTimesRelaySuggestion[] = [];

  for (const gender of ["female", "male"] as const) {
    const ranked = bestByEventKey(times, gender);
    for (const candidate of RELAY_CANDIDATES) {
      const eventKey = buildEventKey(
        candidate.distance,
        candidate.stroke as Stroke | RelayStroke,
        course,
        gender,
      );
      const title = compactEventTitle(candidate.distance, candidate.stroke);
      const built =
        candidate.stroke === "free_relay"
          ? suggestFreeRelayTeams(eventKey, title, gender, ranked)
          : suggestMedleyRelayTeams(eventKey, title, gender, ranked);
      suggestions.push(...built);
    }
  }

  return suggestions;
}

function normalizeInputRows(
  rows: TeamBestTimesReportInput["times"],
  course: Course,
): TeamBestTimesTimeRow[] {
  const result: TeamBestTimesTimeRow[] = [];
  for (const row of rows) {
    if (row.course !== course) continue;
    if (row.gender !== "male" && row.gender !== "female") continue;
    const parsed = parseEventKey(row.eventKey);
    if (!parsed) continue;
    if (parsed.course !== course) continue;
    result.push({
      swimmerId: row.swimmerId,
      swimmerName: row.swimmerName,
      gender: row.gender,
      eventKey: row.eventKey,
      distance: parsed.distance,
      stroke: parsed.stroke,
      course: parsed.course,
      timeMs: row.timeMs,
    });
  }
  return result;
}

export function buildTeamBestTimesReport(
  input: TeamBestTimesReportInput,
): TeamBestTimesReport {
  const course: Course = "SCY";
  const times = normalizeInputRows(input.times, course);
  const generatedAt = input.generatedAt ?? new Date();
  const generatedAtLabel = generatedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const sections = (["female", "male"] as const)
    .map((gender) => buildGenderSection(gender, times))
    .filter(
      (section): section is TeamBestTimesGenderSection => section != null,
    );

  return {
    reportTitle: "Team Best Times",
    meetName: input.teamName,
    meetDateLabel: formatMeetDateCompact(generatedAt),
    courseLabel: formatCourseLabel(course),
    teamName: input.teamName,
    teamCode: input.teamCode ?? null,
    coachName: input.coachName ?? null,
    coachEmail: input.coachEmail ?? null,
    generatedAtLabel,
    course,
    sections,
    relaySuggestions: buildRelaySuggestions(times, course),
  };
}

export function formatTeamBestTimesCsv(report: TeamBestTimesReport): string {
  const lines: string[] = [];
  lines.push(
    csvEscape(`${report.teamName} — ${report.reportTitle} (${report.course})`),
  );
  lines.push(csvEscape(`Generated ${report.generatedAtLabel}`));
  lines.push("");

  for (const section of report.sections) {
    lines.push(csvEscape(section.genderLabel));
    lines.push(
      ["Swimmer", ...section.columns.map((c) => c.label)]
        .map(csvEscape)
        .join(","),
    );
    for (const row of section.rows) {
      lines.push(
        [
          row.swimmerName,
          ...section.columns.map((col) => {
            const ms = row.timesByEventKey[col.eventKey];
            return ms != null && ms > 0 ? formatTime(ms) : "";
          }),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    lines.push("");
  }

  if (report.relaySuggestions.length > 0) {
    lines.push(csvEscape("Relay suggestions"));
    lines.push(
      [
        "Gender",
        "Relay",
        "Team",
        "Seed",
        "Leg 1",
        "Leg 1 time",
        "Leg 2",
        "Leg 2 time",
        "Leg 3",
        "Leg 3 time",
        "Leg 4",
        "Leg 4 time",
      ]
        .map(csvEscape)
        .join(","),
    );
    for (const relay of report.relaySuggestions) {
      const cells = [
        relay.genderLabel,
        relay.title,
        relay.letter,
        relay.seedLabel,
      ];
      for (let i = 0; i < RELAY_PRIMARY_LEG_COUNT; i += 1) {
        const leg = relay.legs[i];
        cells.push(leg?.swimmerName ?? "", leg?.splitLabel ?? "");
      }
      lines.push(cells.map(csvEscape).join(","));
    }
  }

  return `${lines.join("\n")}\n`;
}
