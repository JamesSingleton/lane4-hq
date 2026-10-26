import {
  buildEventKey,
  type Course,
  type EventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { formatTime, parseTime } from "@lane4hq/swim-core/times";
import { parseResultRoundType, parseSdifHeatLane } from "../g0-meta";
import { parseCl2Roster } from "../roster/cl2";
import {
  genderFromEventCode,
  parseAusaBirthDate,
  parseLastFirstName,
  parseSdifBirthDate,
  parseUsaMemberIdFromLine,
} from "../roster/utils";
import type {
  ParsedEntry,
  ParsedMeet,
  ParsedRelayEntry,
  ParsedRelayLegSplit,
  ParsedResult,
} from "../types";

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

const CLASS_YEAR = /^(FR|SO|JR|SR|\d{2})$/;

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
  return /^(DQ|SCR|DNF)$/i.test(time.trim()) || /\bDQ\b/i.test(line);
}

function isNoSwimTime(time: string): boolean {
  return time.trim().toUpperCase() === "NS";
}

/**
 * SDIF round-time slots. Each is an 8-character field immediately before
 * its course letter (D0 courses 106/115/124, E0 courses 63/72/81).
 * D0 prelim/finals and E0 finals are on azsi-results.cl2. CTCC finals
 * sit in the same D0 columns but that file has no G0, so the legacy
 * reader takes the time. Swim-off uses the same width; these files
 * leave it blank. Layout matches the tunas SDIF notes.
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
): { time: string; isDq: boolean; noSwim: boolean } | undefined {
  const raw = field.trim();
  if (!raw) return undefined;
  if (/^\d{0,2}:?\d{1,2}\.\d{2}$/.test(raw)) {
    return { time: raw, isDq: false, noSwim: false };
  }
  const upper = raw.toUpperCase();
  if (upper === "NS") return { time: "NS", isDq: false, noSwim: true };
  if (/^(DQ|SCR|DNF)$/i.test(raw)) {
    return { time: upper, isDq: true, noSwim: false };
  }
  return undefined;
}

function fixedRoundResults(
  line: string,
  slots: readonly RoundSlot[],
): Array<{
  time: string;
  isDq: boolean;
  noSwim: boolean;
  resultType: RoundSlot["resultType"];
}> {
  const out: Array<{
    time: string;
    isDq: boolean;
    noSwim: boolean;
    resultType: RoundSlot["resultType"];
  }> = [];
  for (const slot of slots) {
    const parsed = parseFixedTimeField(line.slice(slot.start, slot.start + 8));
    if (!parsed) continue;
    out.push({
      time: parsed.time,
      isDq: parsed.isDq,
      noSwim: parsed.noSwim,
      resultType: slot.resultType,
    });
  }
  return out;
}

/**
 * Identity used to skip a D0 round time that a G0 line already recorded.
 * Event number is part of the identity so two no-swims (both time `NS`)
 * in different events are both kept.
 */
function roundResultKey(result: ParsedResult): string {
  return [
    result.swimmerName.trim().toLowerCase(),
    String(result.eventNumber ?? ""),
    result.time.trim().toUpperCase(),
    String(result.resultType),
  ].join("\0");
}

function looksLikeHytekStrokeCode(code: string): boolean {
  // A split time fragment such as ".42" is not a stroke code. decodeEventCode
  // would strip the dot and read it as a 4-yard backstroke.
  if (/[.:]/.test(code)) return false;
  const decoded = decodeEventCode(code);
  return Boolean(decoded?.distance && decoded.stroke);
}

function parsePositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  // parseInt("3:00") is 3. A time fragment must not become an event number.
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return n > 0 ? n : undefined;
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

function rememberRelayLeg(
  relay: ParsedRelayEntry,
  swimmerName: string,
  line: string,
  legOrder: number | undefined,
): number {
  const order = legOrder ?? relay.swimmerNames.length + 1;
  relay.swimmerNames.push(swimmerName);
  const names = relay.cl2LegNameFields ?? [];
  names.push(line.slice(22, 62));
  relay.cl2LegNameFields = names;
  const extras = relay.cl2LegExtras ?? [];
  const extra = line.slice(92, 112);
  extras.push(extra.trim() ? extra : "");
  relay.cl2LegExtras = extras;
  const identities = relay.cl2LegIdentity ?? [];
  const identity = line.slice(65, 79);
  identities.push(identity.trim() ? identity : "");
  relay.cl2LegIdentity = identities;
  return order;
}

/** Team Manager F0 leg number, columns 78–79 (`SRM  3`). 1–8, else append order. */
function f0LegOrder(line: string): number | undefined {
  const raw = line.slice(77, 79).trim();
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 8) return undefined;
  return n;
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
  const legOrder = f0LegOrder(line);
  if (/^[A-Za-z].*,\s*[A-Za-z]/.test(nameField)) {
    const parsed = parseLastFirstName(nameField);
    return {
      teamCode: teamCode || undefined,
      relayLetter: relayLetter || undefined,
      swimmerName: `${parsed.firstName} ${parsed.lastName}`.trim(),
      legOrder,
    };
  }

  const name = parseHytekSwimmerName(line);
  if (!name.swimmerName) return null;
  return { swimmerName: name.swimmerName, legOrder };
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
  const noSwim = isNoSwimTime(time);
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
    isDq: noSwim ? false : isDqTime(time, line),
    ...(noSwim ? { noSwim: true } : {}),
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
    const noSwim = isNoSwimTime(finalTime.time);

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
      isDq: noSwim ? false : isDqTime(finalTime.time, line),
      ...(noSwim ? { noSwim: true } : {}),
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
        ...(round.noSwim ? { noSwim: true } : {}),
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
 * Team Manager G0 checkpoint lines (`1 2  50C 31.93 1:10.19`) are splits.
 * A line without that marker is still an official result.
 */
const SPLIT_CHECKPOINT = /\d+\s+\d+\s+50[CSYL]/i;

type SplitRound = NonNullable<ParsedResult["resultType"]>;

type LegCumulative = {
  legOrder: number;
  resultType?: SplitRound;
  cumulativeMs: number;
};

type OpenSplits =
  | { kind: "relay"; relay: ParsedRelayEntry; legOrder: number }
  | { kind: "individual"; pending: ParsedResult[] };

function isSplitCheckpoint(line: string): boolean {
  return SPLIT_CHECKPOINT.test(line);
}

/** Swim times on a G0, in file order. Cumulative from the start of the race. */
function checkpointMs(line: string): number[] {
  const out: number[] = [];
  for (const found of extractTimes(line)) {
    if (isNoTime(found.time)) continue;
    const ms = parseTime(found.time);
    if (ms > 0) out.push(ms);
  }
  return out;
}

function attachIndividualSplits(
  pending: ParsedResult[],
  checkpoints: number[],
  resultType: SplitRound | undefined,
): void {
  if (checkpoints.length === 0) return;
  const targets =
    resultType != null
      ? pending.filter((row) => row.resultType === resultType)
      : pending.length === 1
        ? pending
        : [];
  for (const row of targets) {
    row.splitsMs = checkpoints;
  }
}

/**
 * The lead-off leg is the only official relay split. Later legs are flying
 * starts. A disqualified or no-swim relay does not keep the lead-off either.
 * The time is the cumulative at the end of leg 1, which is that swimmer's
 * own leg because the relay starts at zero.
 */
function leadOffSplit(rows: LegCumulative[]): ParsedRelayLegSplit[] {
  let cumulativeMs: number | undefined;
  for (const row of rows) {
    if (row.legOrder !== 1) continue;
    cumulativeMs = row.cumulativeMs;
  }
  if (cumulativeMs == null) return [];
  return [{ legOrder: 1, time: formatTime(cumulativeMs) }];
}

function applyRelayLegSplits(
  relay: ParsedRelayEntry,
  rows: LegCumulative[],
): void {
  if (!relay.results?.length || rows.length === 0) return;
  const resultCount = relay.results.length;
  for (const result of relay.results) {
    if (result.isDq || result.noSwim) continue;
    const matched = rows.filter((row) =>
      row.resultType ? row.resultType === result.resultType : resultCount === 1,
    );
    const splits = leadOffSplit(matched);
    if (splits.length > 0) result.legSplits = splits;
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
      if (title && !/^hy-tek\b/i.test(title)) meet.name = title;
      const fileCode = line.slice(11, 13);
      const publisher = (
        fileCode === "02" ? line.slice(43, 63) : line.slice(43, 69)
      ).trim();
      if (publisher) meet.cl2Publisher = publisher;
      const publisher2 = line.slice(73, 93).trim();
      if (publisher2) meet.cl2Publisher2 = publisher2;
      const software =
        fileCode === "02" ? line.slice(63, 73) : line.slice(69, 73);
      if (software.trim()) meet.cl2Software = software;
      const phone = line.slice(93, 105).trim();
      if (phone) meet.cl2VendorPhone = phone;
      const created = line.slice(105, 113);
      if (/^\d{8}$/.test(created)) meet.cl2CreatedOn = parseMmDdYyyy(created);
      const tail = line.slice(149, 153).trim();
      if (tail) meet.cl2Tail = tail;
    }
    if (type === "B1") {
      const tmStart = line.slice(121, 129);
      const tmLayout = /^\d{8}$/.test(tmStart);
      const name = (tmLayout ? line.slice(11, 85) : line.slice(11, 41)).trim();
      const loc = (tmLayout ? line.slice(85, 121) : line.slice(41, 71)).trim();
      if (name) meet.name = name;
      if (loc) meet.location = loc;
      if (tmLayout) {
        meet.startDate = parseMmDdYyyy(tmStart);
        const tmEnd = line.slice(129, 137);
        if (/^\d{8}$/.test(tmEnd)) meet.endDate = parseMmDdYyyy(tmEnd);
        const altitude = Number.parseInt(line.slice(137, 141).trim(), 10);
        if (Number.isFinite(altitude) && altitude >= 0)
          meet.altitude = altitude;
      } else {
        const dateMatches = line.substring(40).match(/(\d{8})/g) ?? [];
        if (dateMatches[0]) {
          meet.startDate = parseMmDdYyyy(dateMatches[0]);
        }
        if (dateMatches[1]) {
          meet.endDate = parseMmDdYyyy(dateMatches[1]);
        }
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
  const entriesByName = new Map<string, ParsedEntry[]>();
  const resultsByName = new Map<string, ParsedResult[]>();
  const pendingRoundResults: ParsedResult[] = [];
  const relayCumulatives = new Map<ParsedRelayEntry, LegCumulative[]>();
  let openSplits: OpenSplits | null = null;
  let lastTeamCode: string | undefined;
  let lastSwimmerKey: string | undefined;

  function rememberRow<T extends { swimmerName: string }>(
    index: Map<string, T[]>,
    row: T,
  ): void {
    const key = row.swimmerName.toLowerCase();
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }

  function applyD3(nameKey: string): void {
    const extra = d3ByName.get(nameKey);
    if (!extra) return;
    // applyD3 runs only after the new D0 row is stored under nameKey.
    for (const entry of entriesByName.get(nameKey) as ParsedEntry[]) {
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
    for (const result of resultsByName.get(nameKey) ?? []) {
      if (!result.usaMemberId && extra.usaMemberId) {
        result.usaMemberId = extra.usaMemberId;
      }
    }
  }

  for (const line of lines) {
    const type = line.substring(0, 2);
    if (type === "C1") {
      openSplits = null;
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
      const entriesBefore = meet.entries.length;
      const resultsBefore = meet.results.length;
      const pendingBefore = pendingRoundResults.length;
      parseD0Athlete(
        line,
        kind,
        hasG0,
        meet,
        lastTeamCode,
        identityByName,
        pendingRoundResults,
      );
      for (let i = entriesBefore; i < meet.entries.length; i++) {
        rememberRow(entriesByName, meet.entries[i]!);
      }
      for (let i = resultsBefore; i < meet.results.length; i++) {
        rememberRow(resultsByName, meet.results[i]!);
      }
      const added = meet.entries[meet.entries.length - 1];
      if (meet.entries.length > entriesBefore && added) {
        added.cl2NameField = line.slice(11, 51);
        lastSwimmerKey = added.swimmerName.toLowerCase();
        applyD3(lastSwimmerKey);
      }
      openSplits = {
        kind: "individual",
        pending: pendingRoundResults.slice(pendingBefore),
      };
    } else if (type === "G0" && kind !== "meet_entries") {
      if (isSplitCheckpoint(line)) {
        const checkpoints = checkpointMs(line);
        if (openSplits?.kind === "relay") {
          const cumulativeMs = checkpoints[checkpoints.length - 1];
          if (cumulativeMs != null) {
            const list = relayCumulatives.get(openSplits.relay) ?? [];
            list.push({
              legOrder: openSplits.legOrder,
              cumulativeMs,
              resultType: parseResultRoundType(line),
            });
            relayCumulatives.set(openSplits.relay, list);
          }
        } else if (openSplits?.kind === "individual") {
          attachIndividualSplits(
            openSplits.pending,
            checkpoints,
            parseResultRoundType(line),
          );
        }
        continue;
      }
      openSplits = null;
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
        rememberRow(resultsByName, result);
      }
    } else if (type === "E0") {
      openSplits = null;
      const relay = parseRelayTeamLine(line);
      if (relay) {
        relay.seedCourse = firstCourse(line, E0_COURSE_COLS);
        const rounds = fixedRoundResults(line, E0_ROUND_SLOTS);
        if (rounds.length > 0) {
          relay.results = rounds.map((round) => ({
            time: round.time,
            isDq: round.isDq,
            ...(round.noSwim ? { noSwim: true } : {}),
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
      openSplits = null;
      const leg = parseRelayLegLine(line);
      if (!leg) continue;
      let attached = false;
      for (let i = relays.length - 1; i >= 0; i--) {
        const r = relays[i]!;
        const teamOk = !leg.teamCode || r.teamCode === leg.teamCode;
        const letterOk = !leg.relayLetter || r.relayLetter === leg.relayLetter;
        if (teamOk && letterOk) {
          const order = rememberRelayLeg(
            r,
            leg.swimmerName,
            line,
            leg.legOrder,
          );
          openSplits = { kind: "relay", relay: r, legOrder: order };
          attached = true;
          break;
        }
      }
      if (!attached && relays.length > 0) {
        const relay = relays[relays.length - 1]!;
        const order = rememberRelayLeg(
          relay,
          leg.swimmerName,
          line,
          leg.legOrder,
        );
        openSplits = { kind: "relay", relay, legOrder: order };
      }
    }
  }

  const seenRoundResults = new Set<string>();
  for (const result of meet.results) {
    seenRoundResults.add(roundResultKey(result));
  }
  for (const candidate of pendingRoundResults) {
    const key = roundResultKey(candidate);
    if (seenRoundResults.has(key)) continue;
    seenRoundResults.add(key);
    meet.results.push(candidate);
  }

  for (const relay of relays) {
    applyRelayLegSplits(relay, relayCumulatives.get(relay) ?? []);
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
