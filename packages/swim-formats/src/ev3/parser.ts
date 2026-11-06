import { normalizeMeetEndDate } from "@lane4hq/swim-core/calendar-date";
import {
  buildEventKey,
  type Course,
  type EventGender,
  parseEventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { parseTime } from "@lane4hq/swim-core/times";
import type { ParsedEvent, ParsedMeet } from "../types";

const STROKE_CODES: Record<string, string> = {
  "1": "free",
  "2": "back",
  "3": "breast",
  "4": "fly",
  "5": "im",
  A: "free",
  B: "back",
  C: "breast",
  D: "fly",
  E: "im",
  FR: "free",
  BK: "back",
  BR: "breast",
  FL: "fly",
  IM: "im",
};

/** Hy-Tek dive stroke codes (EV3 uses `F`, HYV uses `6`). */
const DIVE_STROKE_CODES = new Set(["6", "F", "DV", "DIVE"]);

export interface Ev3ParseOptions {
  /**
   * Include diving events as `ParsedEvent` with `eventKind: 'dive'` instead
   * of skipping them. Defaults to `true`.
   */
  includeDiveEvents?: boolean;
}

const HYTEK_TIME_RE = /^\d{1,2}:\d{2}\.\d{1,2}$|^\d{1,2}\.\d{1,2}$/;

function mapStroke(code: string): string {
  return STROKE_CODES[code.toUpperCase()] ?? STROKE_CODES[code] ?? "free";
}

function isDiveStrokeCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return DIVE_STROKE_CODES.has(normalized);
}

/** Map Hy-Tek gender codes (G/F/B/M/X) → EventGender. eventKey still uses m/f/x. */
function mapGender(code: string): EventGender {
  return parseEventGender(code);
}

/** Remap individual stroke to relay stroke when the event is a relay. */
function mapRelayStroke(stroke: string, isRelay: boolean): string {
  if (!isRelay) return stroke;
  return stroke === "im" ? "medley_relay" : "free_relay";
}

function formatAgeGroup(ageLow: string, ageHigh: string): string | undefined {
  const low = ageLow.trim();
  const high = ageHigh.trim();
  const lowNumber = Number.parseInt(low, 10);
  const highNumber = Number.parseInt(high, 10);
  if (
    Number.isFinite(lowNumber) &&
    Number.isFinite(highNumber) &&
    lowNumber <= 0 &&
    (highNumber === 0 || highNumber >= 99)
  ) {
    return undefined;
  }
  if (low && high) return `${low}-${high}`;
  return low || undefined;
}

function positiveInt(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatAddress(header: string[]): string | undefined {
  const street = header[24]?.trim();
  const city = header[26]?.trim();
  const state = header[27]?.trim();
  const postalCode = header[28]?.trim();
  const country = header[29]?.trim();
  const region = [state, postalCode].filter(Boolean).join(" ");
  const cityLine = [city, region].filter(Boolean).join(", ");
  return [street, cityLine, country].filter(Boolean).join(", ") || undefined;
}

function parseMmDdYyyy(raw: string): string | undefined {
  const cleaned = raw.trim();
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m?.[1] || !m[2] || !m[3]) return undefined;
  const month = m[1];
  const day = m[2];
  const year = m[3];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function eventKeyFor(
  distance: number,
  stroke: string,
  course: Course,
  gender: EventGender,
): string {
  return buildEventKey(
    distance,
    stroke as Stroke | RelayStroke,
    course,
    gender,
  );
}

/** First non-empty Hy-Tek time among candidates → milliseconds. */
function firstQualifyingTimeMs(
  ...candidates: Array<string | undefined>
): number | undefined {
  for (const raw of candidates) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (!trimmed || !HYTEK_TIME_RE.test(trimmed)) continue;
    const ms = parseTime(trimmed);
    if (ms > 0) return ms;
  }
  return undefined;
}

/** Hy-Tek round letter, shared by EV3 and HYV. Blank means not stated. */
function parseRoundCode(raw: string): ParsedEvent["roundType"] {
  const code = raw.trim().toUpperCase();
  if (!code) return undefined;
  if (code === "P") return "prelim";
  if (code === "S") return "swimoff";
  if (code === "X") return "time_trial";
  return "finals";
}

/** Parse Hy-Tek Meet Manager EV3 event template files. */
export function parseEv3(
  content: string,
  options: Ev3ParseOptions = {},
): ParsedMeet {
  const includeDiveEvents = options.includeDiveEvents ?? true;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const meet: ParsedMeet = {
    name: "Imported Events",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
  };

  const firstLine = lines[0];
  if (!firstLine) return meet;

  const header = firstLine.split(";");
  meet.name = header[0]?.trim() || meet.name;
  meet.location = header[1]?.trim() || undefined;
  meet.address = formatAddress(header);
  const start = parseMmDdYyyy(header[2] || "");
  if (start) meet.startDate = start;
  const end = normalizeMeetEndDate(start, parseMmDdYyyy(header[3] || ""));
  if (end) meet.endDate = end;
  // EV3 meet header: [23]=host entry deadline (entries due to meet host).
  const entryDeadline = parseMmDdYyyy(header[23] || "");
  if (entryDeadline) meet.entryDeadline = entryDeadline;
  // EV3 meet header: [18]=combined, [19]=individual, [20]=relay.
  const maxCombinedEntries = positiveInt(header[18]);
  const maxIndividualEntries = positiveInt(header[19]);
  const maxRelayEntries = positiveInt(header[20]);
  if (
    maxIndividualEntries !== undefined ||
    maxRelayEntries !== undefined ||
    maxCombinedEntries !== undefined
  ) {
    meet.entryLimits = {
      maxIndividualEntries,
      maxRelayEntries,
      maxCombinedEntries,
    };
  }

  const courseHint = (header[5] || "").trim().toUpperCase();
  // Meet Manager writes extended yard codes such as `YLS`; checking whether
  // the field merely contains "L" incorrectly turns those into long course
  // meters. The leading course code is authoritative.
  if (courseHint.startsWith("Y")) meet.course = "SCY";
  else if (courseHint.startsWith("L")) meet.course = "LCM";
  else if (courseHint.startsWith("S") || courseHint === "M")
    meet.course = "SCM";
  else meet.course = "SCY";

  for (const line of lines.slice(1)) {
    if (!line.includes(";")) continue;
    const parts = line.replace(/\*>\s*$/, "").split(";");
    if (parts.length < 10) continue;

    const eventNumber = Number.parseInt(parts[0] || "", 10);
    if (!Number.isFinite(eventNumber)) continue;

    // EV3: [2]=round F/P, [4]=I/R, [5]=gender G/B, [6-7]=age, [8]=distance, [9]=stroke, [10]=dive count
    const gender = mapGender(parts[5] || "B");
    const isRelay = (parts[4] || "I").toUpperCase() === "R";
    const ageGroup = formatAgeGroup(parts[6] || "", parts[7] || "");
    // Primary entry QT slots [19]/[20] (match HYV [8]/[9]).
    const qualifyingTimeMs = firstQualifyingTimeMs(parts[19], parts[20]);
    const roundType = parseRoundCode(parts[2]!);

    if (isDiveStrokeCode(parts[9]!)) {
      if (!includeDiveEvents) {
        meet.skippedDiveEvents = (meet.skippedDiveEvents ?? 0) + 1;
        continue;
      }
      const diveCount = Number.parseInt(parts[10] || "", 10);
      meet.events.push({
        eventNumber,
        distance: 0,
        stroke: "dive",
        gender,
        ageGroup,
        eventKey: `dive-${eventNumber}`,
        eventKind: "dive",
        ...(roundType ? { roundType } : {}),
        ...(Number.isFinite(diveCount) && diveCount > 0 ? { diveCount } : {}),
        ...(qualifyingTimeMs != null ? { qualifyingTimeMs } : {}),
      });
      continue;
    }

    const distance = Number.parseInt(parts[8] || "0", 10) || 0;
    const stroke = mapRelayStroke(mapStroke(parts[9] || "1"), isRelay);

    const event: ParsedEvent = {
      eventNumber,
      distance,
      stroke,
      gender,
      ageGroup,
      eventKey: eventKeyFor(distance, stroke, meet.course, gender),
      ...(roundType ? { roundType } : {}),
      ...(qualifyingTimeMs != null ? { qualifyingTimeMs } : {}),
    };
    meet.events.push(event);
  }

  return meet;
}

/** Parse Hy-Tek HYV event/qualifying-time files. */
export function parseHyv(
  content: string,
  options: Ev3ParseOptions = {},
): ParsedMeet {
  const includeDiveEvents = options.includeDiveEvents ?? true;
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const meet: ParsedMeet = {
    name: "Imported Events",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
  };

  const firstLine = lines[0];
  if (!firstLine) return meet;

  const header = firstLine.split(";");
  meet.name = header[0]?.trim() || meet.name;
  const start = parseMmDdYyyy(header[1] || "");
  if (start) meet.startDate = start;
  const end = normalizeMeetEndDate(start, parseMmDdYyyy(header[2] || ""));
  if (end) meet.endDate = end;

  const courseCode = (header[4] || "").trim().toUpperCase();
  if (courseCode === "L" || courseCode === "LCM") meet.course = "LCM";
  else if (courseCode === "S" || courseCode === "M" || courseCode === "SCM")
    meet.course = "SCM";
  else meet.course = "SCY";

  meet.location = header[5]?.trim() || undefined;

  for (const line of lines.slice(1)) {
    const parts = line.split(";");
    if (parts.length < 8) continue;

    const eventToken = parts[0] || "";
    const eventNumber = Number.parseInt(eventToken.replace(/\D/g, ""), 10);
    if (!Number.isFinite(eventNumber)) continue;

    const roundType = parseRoundCode(parts[1] || "F");

    // HYV: [1]=round, [2]=gender F/M, [3]=I/R, [4-5]=age, [6]=distance, [7]=stroke
    // Dive events use stroke code 6. Meet Manager writes `1` in [6] even when
    // the paired EV3 has 11 dives, so it isn't a dive count. HYV has none.
    if (isDiveStrokeCode(parts[7]!)) {
      if (!includeDiveEvents) {
        meet.skippedDiveEvents = (meet.skippedDiveEvents ?? 0) + 1;
        continue;
      }
      const diveGender = mapGender(parts[2] || "M");
      const diveAgeGroup = formatAgeGroup(parts[4] || "", parts[5] || "");
      meet.events.push({
        eventNumber,
        distance: 0,
        stroke: "dive",
        gender: diveGender,
        ageGroup: diveAgeGroup,
        eventKey: `dive-${eventNumber}`,
        eventKind: "dive",
        roundType,
      });
      continue;
    }

    const gender = mapGender(parts[2] || "M");
    const isRelay = (parts[3] || "I").toUpperCase() === "R";
    const distance = Number.parseInt(parts[6] || "0", 10) || 0;
    const stroke = mapRelayStroke(mapStroke(parts[7] || "1"), isRelay);
    const ageLow = Number.parseInt(parts[4] || "", 10);
    const ageHigh = Number.parseInt(parts[5] || "", 10);
    const openAge =
      Number.isFinite(ageLow) &&
      ageLow === 0 &&
      (ageHigh === 0 || ageHigh === 109);
    const ageGroup = openAge
      ? undefined
      : formatAgeGroup(parts[4] || "", parts[5] || "");
    // Primary QT: first non-empty of [8]/[9].
    const qualifyingTimeMs = firstQualifyingTimeMs(parts[8], parts[9]);

    meet.events.push({
      eventNumber,
      distance,
      stroke,
      gender,
      ageGroup,
      eventKey: eventKeyFor(distance, stroke, meet.course, gender),
      roundType,
      ...(qualifyingTimeMs != null ? { qualifyingTimeMs } : {}),
    });
  }

  return meet;
}
