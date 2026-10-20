import {
  buildEventKey,
  type Course,
  type EventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { parseResultRoundType, parseSdifHeatLane } from "../g0-meta";
import { parseCl2Roster } from "../roster/cl2";
import {
  genderFromEventCode,
  parseAusaBirthDate,
  parseLastFirstName,
  parseSdifBirthDate,
  parseUsaMemberIdFromLine,
} from "../roster/utils";
import type { ParsedMeet, ParsedRelayEntry, ParsedResult } from "../types";

import { parseCl2D3Fields } from "./d3";
import { type Cl2FileKind, detectCl2FileKind } from "./kind";

const STROKE_DIGIT: Record<string, string> = {
  "1": "free",
  "2": "back",
  "3": "breast",
  "4": "fly",
  "5": "im",
};

const RELAY_STROKE_DIGIT: Record<string, string> = {
  "6": "free_relay",
  "7": "medley_relay",
  "8": "medley_relay",
};

const TIME_RE = /(\d{0,2}:?\d{1,2}\.\d{2}|NT|DQ|NS|SCR|DNF)([YSL])?/gi;

function parseMmDdYyyy(raw: string): string {
  // Callers only pass `\d{8}` matches from B1 date scanning.
  const digits = raw.replace(/\D/g, "");
  return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
}

function courseFromSuffix(suffix: string): Course {
  const c = suffix.toUpperCase();
  if (c === "L") return "LCM";
  if (c === "S") return "SCM";
  return "SCY";
}

/** SDIF course letter at a 1-based column: Y yards, S short-course meters, L long course. */
function courseAt(line: string, col: number): Course | undefined {
  const ch = line[col - 1]?.toUpperCase();
  if (ch === "Y") return "SCY";
  if (ch === "S") return "SCM";
  if (ch === "L") return "LCM";
  return undefined;
}

function firstCourse(
  line: string,
  cols: readonly number[],
): Course | undefined {
  for (const col of cols) {
    const course = courseAt(line, col);
    if (course) return course;
  }
  return undefined;
}

/** D0 seed / prelim / swim-off / finals course columns. */
const D0_COURSE_COLS = [97, 106, 115, 124] as const;
/** E0 seed / prelim / swim-off / finals course columns. */
const E0_COURSE_COLS = [54, 63, 72, 81] as const;

const CLASS_YEAR = /^(FR|SO|JR|SR)$/;

function decodeEventCode(code: string): {
  eventNumber: number;
  distance?: number;
  stroke?: string;
  relay?: boolean;
} | null {
  const digits = code.replace(/\D/g, "");
  // extractD0Event / relay parsers only pass digit strings.
  const eventNumber = Number.parseInt(digits, 10);
  if (!Number.isFinite(eventNumber) || eventNumber <= 0) return null;

  const strokeDigit = digits.slice(-1);
  const distanceRaw = digits.slice(0, -1);
  const distance = Number.parseInt(distanceRaw, 10);
  if (!Number.isFinite(distance) || distance <= 0) {
    return { eventNumber };
  }

  if (RELAY_STROKE_DIGIT[strokeDigit]) {
    return {
      eventNumber,
      distance,
      stroke: RELAY_STROKE_DIGIT[strokeDigit],
      relay: true,
    };
  }

  const stroke = STROKE_DIGIT[strokeDigit];
  if (!stroke) return { eventNumber };
  return { eventNumber, distance, stroke, relay: false };
}

function genderFromLine(line: string): EventGender | undefined {
  if (/\bFF\b/.test(line) || /\d{2}FF\b/.test(line)) return "female";
  if (/\bMM\b/.test(line) || /\d{2}MM\b/.test(line)) return "male";
  if (/\bX[XF]\b|\bMixed\b/i.test(line)) return "mixed";
  return undefined;
}

/** Hy-Tek D0 packs DOB+age+sex as `MMDDYYYY{age}MM|FF` (e.g. `1115198912MM`). */
function parseAthleteIdentity(line: string): {
  dateOfBirth?: string;
  gender?: "male" | "female";
} {
  const packed = line.match(/\b(\d{8})\d{0,2}(MM|FF)\b/);
  if (packed) {
    return {
      dateOfBirth: parseSdifBirthDate(packed[1]!),
      gender: genderFromEventCode(packed[2]!),
    };
  }

  const eventGender =
    line.match(/(FF|MM)\s+\d/) ?? line.match(/\d{2}(FF|MM)\s/);
  const gender = eventGender ? genderFromEventCode(eventGender[1]!) : undefined;
  const sdifDobMatch = line.match(/\b(\d{8})\d?\s+[MF]\b/);
  const dateOfBirth =
    parseAusaBirthDate(line) ??
    (sdifDobMatch ? parseSdifBirthDate(sdifDobMatch[1]!) : undefined);

  return { dateOfBirth, gender };
}

/**
 * SDIF C1 team id is cols 12–17: 2-char LSC + up to 4-char team (`AZMARI`).
 * Cols 4–5 repeat the LSC on Hy-Tek meet-entry files. The bare team code is
 * the id with that LSC prefix removed (`MARI`).
 */
function parseCl2TeamIdentity(line: string): {
  lsc?: string;
  teamCode?: string;
  /** On-file 6-character id, kept so relay rows still match each other. */
  fileTeamId?: string;
  teamName?: string;
  teamShortName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
} {
  const lscRaw = line.slice(3, 5).trim().toUpperCase();
  const lsc = /^[A-Z]{2}$/.test(lscRaw) ? lscRaw : undefined;
  const fileTeamId = line.slice(11, 17).trim().toUpperCase() || undefined;
  let teamCode = fileTeamId;
  if (lsc && fileTeamId?.startsWith(lsc) && fileTeamId.length > lsc.length) {
    const rest = fileTeamId.slice(lsc.length);
    if (rest.length >= 2) teamCode = rest;
  }
  if (!teamCode) {
    const m = line.match(/^C1\d?[A-Z0-9]{0,2}\s+([A-Z0-9]{2,8})/);
    teamCode = m?.[1];
  }
  const teamName = line.slice(17, 47).trim() || undefined;
  const teamShortName = line.slice(47, 63).trim() || undefined;
  const address1 = line.slice(63, 85).trim() || undefined;
  const address2 = line.slice(85, 107).trim() || undefined;
  const city = line.slice(107, 127).trim() || undefined;
  const region = line.slice(127, 129).trim().toUpperCase() || undefined;
  const postal = line.slice(129, 139).trim() || undefined;
  const country = line.slice(139, 142).trim().toUpperCase() || undefined;
  return {
    lsc,
    teamCode,
    fileTeamId,
    teamName,
    teamShortName,
    address1,
    address2,
    city,
    region: region && /^[A-Z]{2}$/.test(region) ? region : undefined,
    postal,
    country: country && /^[A-Z]{3}$/.test(country) ? country : undefined,
  };
}

type AthleteIdentityCache = {
  dateOfBirth?: string;
  gender?: "male" | "female";
  usaMemberId?: string;
  teamCode?: string;
};

/** Extract "Last, First …" from Hy-Tek D0/G0 name field (cols 11–51-ish). */
function parseHytekSwimmerName(line: string): {
  swimmerName: string;
  usaMemberId?: string;
} {
  const nameRegion = line.length > 11 ? line.substring(11, 55) : line;
  const commaMatch = nameRegion.match(
    /([A-Za-z][^,]{0,30}),\s*([A-Za-z][A-Za-z.\-']*(?:\s+[A-Za-z][A-Za-z.\-']*)?)/,
  );
  if (commaMatch) {
    const parsed = parseLastFirstName(`${commaMatch[1]}, ${commaMatch[2]}`);
    // Trailing single-letter exhibition flags (A/X) are not middle names.
    const middle =
      parsed.middleName && parsed.middleName.length > 1
        ? ` ${parsed.middleName}`
        : "";
    return {
      swimmerName: `${parsed.firstName}${middle} ${parsed.lastName}`.trim(),
      usaMemberId: parseUsaMemberIdFromLine(line),
    };
  }

  const last = line.substring(11, 31).trim();
  const first = line.substring(31, 51).trim();
  if (last || first) {
    return {
      swimmerName: `${first} ${last}`.trim(),
      usaMemberId:
        line.substring(51, 65).trim() || parseUsaMemberIdFromLine(line),
    };
  }

  return { swimmerName: "", usaMemberId: parseUsaMemberIdFromLine(line) };
}

function extractTimes(line: string): Array<{ time: string; course?: Course }> {
  const out: Array<{ time: string; course?: Course }> = [];
  for (const match of line.matchAll(TIME_RE)) {
    const raw = match[1]!.toUpperCase();
    const suffix = match[2];
    out.push({
      time: raw,
      course: suffix ? courseFromSuffix(suffix) : undefined,
    });
  }
  return out;
}

function isNoTime(time: string): boolean {
  return /^(NT|NS|SCR|DNF|DQ)?$/i.test(time.trim()) || time.trim() === "";
}

function isDqTime(time: string, line: string): boolean {
  return /^(DQ|NS|SCR|DNF)$/i.test(time.trim()) || /\bDQ\b/i.test(line);
}

/**
 * SDIF round-time slots. Each is an 8-character field immediately before
 * its course letter (D0 courses 106/115/124, E0 courses 63/72/81).
 * Confirmed on the scrubbed tunas AAA and Reno results.
 */
const D0_ROUND_SLOTS = [
  { start: 97, resultType: "prelim" },
  { start: 106, resultType: "swimoff" },
  { start: 115, resultType: "finals" },
] as const;

const E0_ROUND_SLOTS = [
  { start: 54, resultType: "prelim" },
  { start: 63, resultType: "swimoff" },
  { start: 72, resultType: "finals" },
] as const;

type RoundSlot = {
  start: number;
  resultType: "prelim" | "swimoff" | "finals";
};

function parseFixedTimeField(
  field: string,
): { time: string; isDq: boolean } | undefined {
  const raw = field.trim();
  if (!raw) return undefined;
  if (/^\d{0,2}:?\d{1,2}\.\d{2}$/.test(raw)) {
    return { time: raw, isDq: false };
  }
  if (/^(DQ|NS|SCR|DNF)$/i.test(raw)) {
    return { time: raw.toUpperCase(), isDq: true };
  }
  return undefined;
}

function fixedRoundResults(
  line: string,
  slots: readonly RoundSlot[],
): Array<{
  time: string;
  isDq: boolean;
  resultType: RoundSlot["resultType"];
}> {
  const out: Array<{
    time: string;
    isDq: boolean;
    resultType: RoundSlot["resultType"];
  }> = [];
  for (const slot of slots) {
    const parsed = parseFixedTimeField(line.slice(slot.start, slot.start + 8));
    if (!parsed) continue;
    out.push({
      time: parsed.time,
      isDq: parsed.isDq,
      resultType: slot.resultType,
    });
  }
  return out;
}

function sameRoundResult(a: ParsedResult, b: ParsedResult): boolean {
  return (
    a.swimmerName.trim().toLowerCase() === b.swimmerName.trim().toLowerCase() &&
    a.time.trim().toUpperCase() === b.time.trim().toUpperCase() &&
    a.resultType === b.resultType
  );
}

function looksLikeHytekStrokeCode(code: string): boolean {
  const decoded = decodeEventCode(code);
  return Boolean(decoded?.distance && decoded.stroke);
}

function parsePositiveInt(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * D0 packs `FF 1003 20` as stroke *code* then meet event number (cols 69–72 / 73–76).
 * 1001/501/2005 are Hy-Tek stroke codes, not program event numbers.
 */
function extractD0Event(line: string): {
  eventCode?: string;
  eventNumber?: number;
} {
  const colCode = line.slice(68, 72).trim();
  const colNum = parsePositiveInt(line.slice(72, 76));
  if (looksLikeHytekStrokeCode(colCode) && colNum != null) {
    return { eventCode: colCode, eventNumber: colNum };
  }

  const m =
    line.match(/\b(?:FF|MM|XF|FM|MF)\s+(\d{3,4})(?:\s+(\d{1,4}))?\b/) ??
    line.match(/\d{2}(?:FF|MM)\s+(\d{3,4})(?:\s+(\d{1,4}))?\b/);
  if (!m) return {};
  const first = m[1]!;
  const second = m[2] ? parsePositiveInt(m[2]) : undefined;
  if (looksLikeHytekStrokeCode(first) && second != null) {
    return { eventCode: first, eventNumber: second };
  }
  return {
    eventCode: first,
    eventNumber: parsePositiveInt(first),
  };
}

function ensureEvent(
  meet: ParsedMeet,
  eventNumber: number,
  opts: {
    distance?: number;
    stroke?: string;
    gender?: EventGender;
    course?: Course;
  },
): void {
  if (meet.events.some((e) => e.eventNumber === eventNumber)) return;
  /* v8 ignore start -- @preserve */
  const distance = opts.distance ?? 50;
  const stroke = opts.stroke ?? "free";
  const gender = opts.gender ?? "mixed";
  const course = opts.course ?? meet.course;
  /* v8 ignore stop -- @preserve */
  meet.events.push({
    eventNumber,
    distance,
    stroke,
    gender,
    eventKey: buildEventKey(
      distance,
      stroke as Stroke | RelayStroke,
      course,
      gender,
    ),
  });
}

function parseRelayTeamLine(line: string): ParsedRelayEntry | null {
  const letter = line.slice(11, 12).trim().toUpperCase();
  const teamCode = line.slice(12, 18).trim();
  const eventNumber = Number.parseInt(line.slice(26, 30).trim(), 10);
  const times = extractTimes(line);
  const seed = times.find((t) => !isNoTime(t.time) && t.time !== "NT");

  if (letter && teamCode && Number.isFinite(eventNumber) && eventNumber > 0) {
    return {
      eventNumber,
      swimmerNames: [],
      seedTime: seed?.time,
      teamCode,
      relayLetter: letter,
    };
  }

  // Vendor rows that are not column-aligned: letter, team, gender, code, meet event #.
  const m = line.match(
    /^E0\S*\s+([A-Z])\s*([A-Z0-9]+)\s+([A-Z])\s+(\d{3,4})\s+(\d{1,4})/i,
  );
  if (!m) return null;
  const fallbackNumber = Number.parseInt(m[5]!, 10);
  if (!Number.isFinite(fallbackNumber) || fallbackNumber <= 0) return null;
  return {
    eventNumber: fallbackNumber,
    swimmerNames: [],
    seedTime: seed?.time,
    teamCode: m[2],
    relayLetter: m[1]!.toUpperCase(),
  };
}

function relayEventFromLine(line: string): {
  eventNumber: number;
  distance?: number;
  stroke?: string;
  gender?: EventGender;
} | null {
  const eventCode = line.slice(22, 26).trim();
  const eventNumber = Number.parseInt(line.slice(26, 30).trim(), 10);
  if (!Number.isFinite(eventNumber) || eventNumber <= 0) return null;
  const decoded = eventCode ? decodeEventCode(eventCode) : null;
  const genderLetter = line.slice(20, 21).toUpperCase();
  const gender: EventGender | undefined =
    genderLetter === "F" ? "female" : genderLetter === "M" ? "male" : undefined;
  return {
    eventNumber,
    distance: decoded?.distance,
    stroke: decoded?.stroke,
    gender,
  };
}

/**
 * Team Manager F0 (SDIF): team code cols 16–21, relay letter col 22,
 * `Last, First` cols 23–62. TM writes these with no separators, so
 * `AZMARI` + `A` + `Chaturvedi, Orion` looks like `AZMARIAChaturvedi, Orion`.
 */
function parseRelayLegLine(line: string): {
  teamCode?: string;
  relayLetter?: string;
  swimmerName: string;
  legOrder?: number;
} | null {
  const teamCode = line.slice(15, 21).trim();
  const relayLetter = line.slice(21, 22).trim();
  const nameField = line.slice(22, 62).trim();
  if (/^[A-Za-z].*,\s*[A-Za-z]/.test(nameField)) {
    const parsed = parseLastFirstName(nameField);
    return {
      teamCode: teamCode || undefined,
      relayLetter: relayLetter || undefined,
      swimmerName: `${parsed.firstName} ${parsed.lastName}`.trim(),
    };
  }

  const name = parseHytekSwimmerName(line);
  if (!name.swimmerName) return null;
  return { swimmerName: name.swimmerName };
}

function parseG0Result(line: string): ParsedResult | null {
  const { swimmerName, usaMemberId } = parseHytekSwimmerName(line);
  const times = extractTimes(line);
  const swimTimes = times.filter((t) => !isNoTime(t.time));
  const special = times.find((t) => /^(DQ|NS|SCR|DNF)$/i.test(t.time));
  if (swimTimes.length === 0 && !special && !/\bDQ\b/i.test(line)) return null;

  const primary =
    swimTimes.find((t) => t.time.includes(":")) ??
    swimTimes[swimTimes.length - 1] ??
    swimTimes[0] ??
    special;

  const time = primary!.time;
  let eventNumber = extractD0Event(line).eventNumber;
  if (eventNumber == null) {
    const raw = line.substring(2, 6).trim();
    if (/^\d+$/.test(raw)) eventNumber = Number.parseInt(raw, 10);
  }

  let place: number | undefined;
  const placeMatch = line.match(
    /(?:\d{0,2}:?\d{1,2}\.\d{2})[YSL]?\s+(\d{1,3})\b/,
  );
  if (placeMatch) place = Number.parseInt(placeMatch[1]!, 10);
  else {
    const p = Number.parseInt(line.substring(82, 86).trim(), 10);
    if (Number.isFinite(p) && p > 0) place = p;
  }

  const { heat, lane } = parseSdifHeatLane(line);
  const resultType = parseResultRoundType(line);

  return {
    eventNumber: eventNumber && eventNumber > 0 ? eventNumber : undefined,
    swimmerName,
    time,
    place,
    isDq: isDqTime(time, line),
    usaMemberId: usaMemberId || undefined,
    ...(resultType ? { resultType } : {}),
    ...(heat != null ? { heat } : {}),
    ...(lane != null ? { lane } : {}),
  };
}

function parseD0Athlete(
  line: string,
  kind: Cl2FileKind,
  hasG0: boolean,
  meet: ParsedMeet,
  teamCode: string | undefined,
  identityByName: Map<string, AthleteIdentityCache>,
  pendingRoundResults: ParsedResult[],
): void {
  const { swimmerName, usaMemberId } = parseHytekSwimmerName(line);
  if (!swimmerName) return;

  const { eventCode, eventNumber } = extractD0Event(line);
  const decoded = eventCode ? decodeEventCode(eventCode) : null;
  const gender = genderFromLine(line);
  const times = extractTimes(line);
  const columnCourse = firstCourse(line, D0_COURSE_COLS);
  const course =
    columnCourse ?? times.find((t) => t.course)?.course ?? meet.course;
  const identity = parseAthleteIdentity(line);
  const rosterGender = identity.gender;
  const classRaw = line.slice(7, 9).trim().toUpperCase();
  const classYear = CLASS_YEAR.test(classRaw) ? classRaw : undefined;

  identityByName.set(swimmerName.toLowerCase(), {
    dateOfBirth: identity.dateOfBirth,
    gender: rosterGender,
    usaMemberId: usaMemberId || undefined,
    teamCode,
  });

  if (eventNumber && decoded?.distance && decoded.stroke && !decoded.relay) {
    ensureEvent(meet, eventNumber, {
      distance: decoded.distance,
      stroke: decoded.stroke,
      gender,
      course,
    });
  } else if (eventNumber) {
    ensureEvent(meet, eventNumber, { gender, course });
  }
  const swimTimes = times.filter((t) => !isNoTime(t.time) && t.time !== "NT");
  const special = times.find((t) => /^(DQ|NS|SCR|DNF)$/i.test(t.time));
  const seedTime = swimTimes[0]?.time;

  // Legacy Meet Results without G0: final time (or DQ/NS) on D0
  if (kind === "meet_results" && !hasG0) {
    const finalTime = swimTimes[swimTimes.length - 1] ?? special;
    if (!finalTime) return;

    let place: number | undefined;
    const placeMatch = line.match(
      /(?:\d{0,2}:?\d{1,2}\.\d{2})[YSL]?\s+(\d{1,3})\b/,
    );
    if (placeMatch) place = Number.parseInt(placeMatch[1]!, 10);

    meet.results.push({
      eventNumber,
      swimmerName,
      time: finalTime.time,
      place,
      isDq: isDqTime(finalTime.time, line),
      usaMemberId: usaMemberId || undefined,
      dateOfBirth: identity.dateOfBirth,
      gender: rosterGender,
      teamCode,
    });

    meet.entries.push({
      eventNumber,
      swimmerName,
      seedTime: swimTimes.length > 1 ? swimTimes[0]!.time : undefined,
      usaMemberId: usaMemberId || undefined,
    });

    const courseFromTimes = [...swimTimes]
      .reverse()
      .find((t) => t.course)?.course;
    if (courseFromTimes) meet.course = courseFromTimes;
    return;
  }

  meet.entries.push({
    eventNumber,
    swimmerName,
    seedTime,
    usaMemberId: usaMemberId || undefined,
    dateOfBirth: identity.dateOfBirth,
    gender: rosterGender,
    classYear,
    seedCourse: columnCourse,
  });

  // Meet-results files that also carry G0 splits leave the official
  // prelim / swim-off / finals time on the D0. The !hasG0 path above
  // already returned, so reaching this with meet_results means G0 exists.
  if (kind === "meet_results") {
    for (const round of fixedRoundResults(line, D0_ROUND_SLOTS)) {
      pendingRoundResults.push({
        eventNumber,
        swimmerName,
        time: round.time,
        isDq: round.isDq,
        resultType: round.resultType,
        usaMemberId: usaMemberId || undefined,
        dateOfBirth: identity.dateOfBirth,
        gender: rosterGender,
        teamCode,
      });
    }
  }
}

/**
 * Parse Hy-Tek CL2 meet results / entries.
 * Handles legacy D0-embedded results and modern G0 results; E0/F0 are relays.
 */
export function parseCl2Meet(content: string): ParsedMeet {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const kind = detectCl2FileKind(content);

  if (kind === "swimmers_only") {
    throw new Error(
      "This CL2 file is a Swimmers Only roster export, not a meet file. Import it from Roster import instead.",
    );
  }

  const hasG0 = lines.some((l) => l.startsWith("G0"));

  const meet: ParsedMeet = {
    name: "CL2 Import",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
    importKind:
      kind === "meet_results"
        ? "results"
        : kind === "meet_entries"
          ? "entries"
          : undefined,
  };

  for (const line of lines) {
    const type = line.substring(0, 2);
    if (type === "A0") {
      const fileType = line.substring(11, 30).trim().toLowerCase();
      if (fileType.includes("result")) meet.name = "Meet Results";
      else if (fileType.includes("entries")) meet.name = "Meet Entries";
      const title = line.substring(43, 73).trim();
      if (title) meet.name = title;
    }
    if (type === "B1") {
      const name = line.substring(11, 41).trim();
      if (name) meet.name = name;
      const loc = line.substring(41, 71).trim();
      if (loc) meet.location = loc;
      const dateMatches = line.substring(40).match(/(\d{8})/g) ?? [];
      if (dateMatches[0]) {
        meet.startDate = parseMmDdYyyy(dateMatches[0]);
      }
      if (dateMatches[1]) {
        meet.endDate = parseMmDdYyyy(dateMatches[1]);
      }
      // Hy-Tek writes the meet course at col 150 (Y/S/L). Cols 88–100 are
      // the facility/city ("Copper Sky") and must not decide the course.
      const columnCourse = courseAt(line, 150);
      if (columnCourse) {
        meet.course = columnCourse;
      } else {
        const courseFlag = line.substring(87, 100);
        if (courseFlag.includes("L") || /\bLCM\b/.test(line))
          meet.course = "LCM";
        else if (
          (courseFlag.includes("S") && !courseFlag.includes("Y")) ||
          /\bSCM\b/.test(line)
        ) {
          meet.course = "SCM";
        } else {
          meet.course = "SCY";
        }
      }
    }
  }

  const relays: ParsedRelayEntry[] = [];
  const identityByName = new Map<string, AthleteIdentityCache>();
  const d3ByName = new Map<string, ReturnType<typeof parseCl2D3Fields>>();
  const pendingRoundResults: ParsedResult[] = [];
  let lastTeamCode: string | undefined;
  let lastSwimmerKey: string | undefined;

  function applyD3(nameKey: string): void {
    const extra = d3ByName.get(nameKey);
    if (!extra) return;
    for (const entry of meet.entries) {
      if (entry.swimmerName.toLowerCase() !== nameKey) continue;
      if (!entry.usaMemberId && extra.usaMemberId) {
        entry.usaMemberId = extra.usaMemberId;
      }
      if (extra.preferredName) entry.preferredName = extra.preferredName;
      if (extra.ethnicity) entry.ethnicity = extra.ethnicity;
      if (extra.registrationFlags) {
        entry.registrationFlags = extra.registrationFlags;
      }
    }
    const cached = identityByName.get(nameKey);
    if (cached && !cached.usaMemberId && extra.usaMemberId) {
      cached.usaMemberId = extra.usaMemberId;
    }
    for (const result of meet.results) {
      if (result.swimmerName.toLowerCase() !== nameKey) continue;
      if (!result.usaMemberId && extra.usaMemberId) {
        result.usaMemberId = extra.usaMemberId;
      }
    }
  }

  for (const line of lines) {
    const type = line.substring(0, 2);
    if (type === "C1") {
      const identity = parseCl2TeamIdentity(line);
      if (identity.lsc) meet.lscCode = identity.lsc;
      if (identity.teamCode) meet.teamCode = identity.teamCode;
      if (identity.teamName) meet.teamName = identity.teamName;
      if (identity.teamShortName) meet.teamShortName = identity.teamShortName;
      if (identity.address1) meet.teamAddressLine1 = identity.address1;
      if (identity.address2) meet.teamAddressLine2 = identity.address2;
      if (identity.city) meet.teamCity = identity.city;
      if (identity.region) meet.teamRegion = identity.region;
      if (identity.postal) meet.teamPostalCode = identity.postal;
      if (identity.country) meet.teamCountry = identity.country;
      lastTeamCode = identity.fileTeamId ?? identity.teamCode ?? lastTeamCode;
    } else if (type === "D3") {
      const extra = parseCl2D3Fields(line);
      if (lastSwimmerKey) {
        d3ByName.set(lastSwimmerKey, extra);
        applyD3(lastSwimmerKey);
      }
    } else if (type === "D0" || type === "D1") {
      const before = meet.entries.length;
      parseD0Athlete(
        line,
        kind,
        hasG0,
        meet,
        lastTeamCode,
        identityByName,
        pendingRoundResults,
      );
      const added = meet.entries[meet.entries.length - 1];
      if (meet.entries.length > before && added) {
        lastSwimmerKey = added.swimmerName.toLowerCase();
        applyD3(lastSwimmerKey);
      }
    } else if (type === "G0" && kind !== "meet_entries") {
      const result = parseG0Result(line);
      if (result?.time) {
        const cached = identityByName.get(result.swimmerName.toLowerCase());
        if (cached) {
          result.dateOfBirth ??= cached.dateOfBirth;
          result.gender ??= cached.gender;
          result.usaMemberId ??= cached.usaMemberId;
          result.teamCode ??= cached.teamCode;
        } else if (lastTeamCode) {
          result.teamCode = lastTeamCode;
        }
        meet.results.push(result);
      }
    } else if (type === "E0") {
      const relay = parseRelayTeamLine(line);
      if (relay) {
        relay.seedCourse = firstCourse(line, E0_COURSE_COLS);
        const rounds = fixedRoundResults(line, E0_ROUND_SLOTS);
        if (rounds.length > 0) {
          relay.results = rounds.map((round) => ({
            time: round.time,
            isDq: round.isDq,
            resultType: round.resultType,
          }));
        }
        const event = relayEventFromLine(line);
        if (event) {
          ensureEvent(meet, event.eventNumber, {
            distance: event.distance,
            stroke: event.stroke,
            gender: event.gender,
            course: meet.course,
          });
        }
        relays.push(relay);
      }
    } else if (type === "F0") {
      const leg = parseRelayLegLine(line);
      if (!leg) continue;
      let attached = false;
      for (let i = relays.length - 1; i >= 0; i--) {
        const r = relays[i]!;
        const teamOk = !leg.teamCode || r.teamCode === leg.teamCode;
        const letterOk = !leg.relayLetter || r.relayLetter === leg.relayLetter;
        if (teamOk && letterOk) {
          r.swimmerNames.push(leg.swimmerName);
          attached = true;
          break;
        }
      }
      if (!attached && relays.length > 0) {
        relays[relays.length - 1]!.swimmerNames.push(leg.swimmerName);
      }
    }
  }

  for (const candidate of pendingRoundResults) {
    const already = meet.results.some((result) =>
      sameRoundResult(result, candidate),
    );
    if (already) continue;
    meet.results.push(candidate);
  }

  if (relays.length > 0) {
    meet.relays = relays.filter((r) => r.swimmerNames.length > 0 || r.teamCode);
  }

  if (
    kind === "meet_entries" &&
    meet.entries.length === 0 &&
    meet.results.length === 0
  ) {
    const roster = parseCl2Roster(content);
    for (const row of roster) {
      meet.entries.push({
        swimmerName: `${row.firstName} ${row.lastName}`,
        usaMemberId: row.usaMemberId,
      });
    }
  }

  return meet;
}

export { type Cl2FileKind, detectCl2FileKind } from "./kind";
