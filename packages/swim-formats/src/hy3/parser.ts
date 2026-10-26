import { normalizeMeetEndDate } from "@lane4hq/swim-core/calendar-date";
import {
  buildEventKey,
  type Course,
  type EventGender,
  parseEventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { formatTime as formatMs } from "@lane4hq/swim-core/times";
import { parseDobFromUsaMemberId } from "../roster/utils";
import type {
  ParsedAthlete,
  ParsedEntry,
  ParsedEvent,
  ParsedMeet,
  ParsedRelayEntry,
  ParsedRelayResult,
  ParsedResult,
} from "../types";

/** 1-based extract matching hytek-parser's `extract`. */
function extract(line: string, start: number, length: number): string {
  const from = start - 1;
  return line.slice(from, from + length).trim();
}

function safeInt(raw: string, fallback = 0): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeFloat(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseMmDdYyyy(raw: string): string | undefined {
  const cleaned = raw.trim();
  if (!/^\d{8}$/.test(cleaned)) return undefined;
  const month = cleaned.slice(0, 2);
  const day = cleaned.slice(2, 4);
  const year = cleaned.slice(4, 8);
  return `${year}-${month}-${day}`;
}

type ResultKind = "prelim" | "swimoff" | "finals";

const STROKE_CODES: Record<string, string> = {
  A: "free",
  B: "back",
  C: "breast",
  D: "fly",
  E: "im",
  "1": "free",
  "2": "back",
  "3": "breast",
  "4": "fly",
  "5": "im",
};

const COURSE_CODES: Record<string, Course> = {
  Y: "SCY",
  "2": "SCY",
  S: "SCM",
  M: "SCM",
  "1": "SCM",
  L: "LCM",
  "3": "LCM",
};

const DQ_TIME_CODES = new Set(["Q", "F", "D"]);
/** Hy-Tek time code R is a no-swim (CL2 `NS`), not a disqualification. */

type Hy3Swimmer = {
  meetId: number;
  firstName: string;
  lastName: string;
  nickName?: string;
  middleInitial?: string;
  practiceGroup?: string;
  practiceSubgroup?: string;
  usaMemberId?: string;
  /** YYYY-MM-DD from D1 cols 89–96 when present. */
  dateOfBirth?: string;
  gender: EventGender;
  age?: number;
  classYear?: string;
  teamCode?: string;
};

type Hy3Entry = {
  eventNumber?: number;
  meetId?: number;
  relay: boolean;
  seedSeconds?: number;
  seedCourse?: Course;
  exhibition: boolean;
  meetDivision?: string;
  entryMark?: string;
  eventSuffix?: string;
  teamCode?: string;
  relayLetter?: string;
  legSwimmers: Map<number, number>;
  prelim?: RoundResult;
  swimoff?: RoundResult;
  finals?: RoundResult;
};

type RoundResult = {
  timeSeconds?: number;
  timeCode?: string;
  dqCode?: string;
  heat?: number;
  lane?: number;
  heatPlace?: number;
  overallPlace?: number;
  splits: Map<number, number>;
};

type Hy3Event = {
  number: string;
  eventNumber?: number;
  distance: number;
  stroke: string;
  course: Course;
  gender: EventGender;
  ageMin?: number;
  ageMax?: number;
  relay: boolean;
  suffix?: string;
};

type ParseState = {
  meet: ParsedMeet;
  swimmers: Map<number, Hy3Swimmer>;
  events: Map<string, Hy3Event>;
  entries: Hy3Entry[];
  lastTeamCode?: string;
  lastEventKey?: string;
  lastEntry?: Hy3Entry;
  endDate?: string;
  ageUpDate?: string;
  altitude?: number;
  sanctionNumber?: string;
  notes?: string;
};

function mapStroke(code: string, isRelay: boolean): string {
  const base = STROKE_CODES[code.toUpperCase()] ?? "free";
  if (!isRelay) return base;
  return base === "im" ? "medley_relay" : "free_relay";
}

function mapCourse(code: string, fallback: Course = "SCY"): Course {
  return COURSE_CODES[code.toUpperCase()] ?? fallback;
}

function formatAgeGroup(
  ageMin: number | undefined,
  ageMax: number | undefined,
): string | undefined {
  if (ageMin == null && ageMax == null) return undefined;
  const low = ageMin ?? 0;
  const high = ageMax ?? 109;
  if (low <= 0 && high >= 99) return undefined;
  if (ageMin != null && ageMax != null) return `${ageMin}-${ageMax}`;
  if (ageMin != null) return `${ageMin}&O`;
  return `${ageMax}&U`;
}

function swimmerDisplayName(swimmer: Hy3Swimmer): string {
  const first = swimmer.nickName || swimmer.firstName;
  return `${first} ${swimmer.lastName}`.trim();
}

function secondsToTimeString(seconds: number | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return formatMs(Math.round(seconds * 1000));
}

/**
 * Team-level text such as JV. SwimTopia (and Team Manager entry lines)
 * leave columns 77–78 blank and put `0.00` in the next field, which a
 * 3-column read turns into the division `"0"`.
 */
function divisionCode(raw: string): string | undefined {
  const token = raw.trim();
  return /^[A-Za-z]{1,3}$/.test(token) ? token : undefined;
}

/** HY3 cols 39–42. Team Manager leaves column 42 blank. SwimTopia writes the multi-age letter there (`42A`). */
function splitEventToken(raw: string): {
  eventNumber?: number;
  eventSuffix?: string;
} {
  const token = raw.trim();
  const letter = /[A-Za-z]$/.test(token)
    ? token.slice(-1).toUpperCase()
    : undefined;
  const digits = token.replace(/\D/g, "");
  return {
    eventNumber: digits ? Number.parseInt(digits, 10) : undefined,
    eventSuffix: letter,
  };
}

function parseTimeField(raw: string): number | undefined {
  const cleaned = raw.trim();
  if (!cleaned || /^[A-Z]+$/i.test(cleaned)) return undefined;
  return safeFloat(cleaned);
}

function ensureEvent(
  state: ParseState,
  key: string,
  event: Hy3Event,
): Hy3Event {
  const existing = state.events.get(key);
  if (existing) return existing;
  state.events.set(key, event);
  return event;
}

function applyRound(
  entry: Hy3Entry,
  kind: ResultKind,
  result: RoundResult,
): void {
  entry[kind] = result;
}

function parseResultKind(code: string): ResultKind | undefined {
  if (code === "P") return "prelim";
  if (code === "S") return "swimoff";
  if (code === "F") return "finals";
  return undefined;
}

/** Emit every scored round (prelim / swimoff / finals), not only the best. */
function allRoundResults(
  entry: Hy3Entry,
): Array<{ kind: ResultKind; result: RoundResult }> {
  const rounds: Array<{ kind: ResultKind; result: RoundResult }> = [];
  for (const kind of ["prelim", "swimoff", "finals"] as const) {
    const result = entry[kind];
    if (result && (result.timeSeconds != null || result.timeCode)) {
      rounds.push({ kind, result });
    }
  }
  return rounds;
}

function scoredRound(round: RoundResult): {
  time: string;
  isDq: boolean;
  noSwim: boolean;
} | null {
  if (round.timeCode === "R") {
    return { time: "NS", isDq: false, noSwim: true };
  }
  const isDq =
    !!round.dqCode ||
    DQ_TIME_CODES.has(round.timeCode ?? "") ||
    round.timeCode === "Q";
  const time = secondsToTimeString(round.timeSeconds);
  if (!time && !isDq) return null;
  return { time: time ?? "DQ", isDq, noSwim: false };
}

function pushResultFromRound(
  results: ParsedResult[],
  entry: Hy3Entry,
  swimmer: Hy3Swimmer,
  kind: ResultKind,
  round: RoundResult,
): void {
  const scored = scoredRound(round);
  if (!scored) return;
  results.push({
    eventNumber: entry.eventNumber,
    swimmerName: swimmerDisplayName(swimmer),
    time: scored.time,
    place: round.overallPlace,
    isDq: scored.isDq,
    ...(scored.noSwim ? { noSwim: true } : {}),
    usaMemberId: swimmer.usaMemberId,
    dateOfBirth: swimmer.dateOfBirth,
    eventSuffix: entry.eventSuffix,
    gender:
      swimmer.gender === "male" || swimmer.gender === "female"
        ? swimmer.gender
        : undefined,
    teamCode: swimmer.teamCode,
    resultType: kind,
    heat: round.heat,
    lane: round.lane,
    dqCode: scored.noSwim ? undefined : round.dqCode,
    exhibition: entry.exhibition,
    splitsMs:
      round.splits.size > 0
        ? [...round.splits.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, seconds]) => Math.round(seconds * 1000))
        : undefined,
  });
}

function parseA1(line: string, state: ParseState): void {
  const title = extract(line, 3, 30).toLowerCase();
  if (title.includes("result")) state.meet.importKind = "results";
  else if (title.includes("entries") || title.includes("entry")) {
    state.meet.importKind = "entries";
  } else if (title.includes("roster")) state.meet.importKind = "roster";
  const publisher = extract(line, 30, 15);
  if (publisher) state.meet.hy3Publisher = publisher;
  const software = extract(line, 45, 14);
  if (software) state.meet.hy3Software = software;
  const created = parseMmDdYyyy(extract(line, 59, 8));
  if (created) state.meet.hy3CreatedOn = created;
  const createdTime = line.slice(66, 75);
  if (createdTime.trim()) state.meet.hy3CreatedTime = createdTime;
  const licensee = line.slice(75, 128).trimEnd();
  if (licensee.trim()) state.meet.hy3Licensee = licensee;
}

function parseB1(line: string, state: ParseState): void {
  const name = extract(line, 3, 45);
  const facility = extract(line, 48, 45);
  const start = parseMmDdYyyy(extract(line, 93, 8));
  const end = parseMmDdYyyy(extract(line, 101, 8));
  const ageUp = parseMmDdYyyy(extract(line, 109, 8));
  const altitudeRaw = extract(line, 117, 5);
  if (name) state.meet.name = name;
  if (facility) state.meet.location = facility;
  if (start) state.meet.startDate = start;
  if (end) state.endDate = end;
  if (ageUp) state.ageUpDate = ageUp;
  const altitude = safeInt(altitudeRaw, -1);
  if (altitude >= 0) state.altitude = altitude;
}

function parseB2(line: string, state: ParseState): void {
  const notes = extract(line, 3, 45);
  const course = mapCourse(extract(line, 99, 1), state.meet.course);
  const sanction = extract(line, 109, 20);
  const entrySetup = line.slice(102, 108);
  state.meet.course = course;
  if (notes) state.notes = notes;
  if (sanction) state.sanctionNumber = sanction;
  if (entrySetup.trim()) state.meet.hy3EntrySetup = entrySetup;
}

function parseC1(line: string, state: ParseState): void {
  const code = extract(line, 3, 5);
  if (code) {
    state.lastTeamCode = code;
    state.meet.teamCode = code;
  }
  const teamName = extract(line, 8, 30);
  const shortName = extract(line, 38, 16);
  const lsc = extract(line, 54, 2);
  const contact = extract(line, 56, 30);
  const contact2 = extract(line, 86, 30);
  const kind = extract(line, 121, 2);
  if (teamName) state.meet.teamName = teamName;
  if (shortName) state.meet.teamShortName = shortName;
  if (lsc) state.meet.lscCode = lsc;
  if (contact) state.meet.teamContactName = contact;
  if (contact2 && contact2 !== contact) state.meet.teamContactName2 = contact2;
  if (kind) state.meet.teamKind = kind;
}

function parseC2(line: string, state: ParseState): void {
  const address1 = extract(line, 3, 30);
  const address2 = extract(line, 33, 30);
  const city = extract(line, 63, 30);
  const region = extract(line, 93, 2);
  const postal = extract(line, 95, 10);
  const country = extract(line, 105, 3);
  if (address1) state.meet.teamAddressLine1 = address1;
  if (address2) state.meet.teamAddressLine2 = address2;
  if (city) state.meet.teamCity = city;
  if (region) state.meet.teamRegion = region;
  if (postal) state.meet.teamPostalCode = postal;
  if (country) state.meet.teamCountry = country;
  const org = extract(line, 109, 3);
  if (org) state.meet.teamOrgCode = org;
}

function parseC3(line: string, state: ParseState): void {
  const phone = extract(line, 33, 20);
  const phone2 = extract(line, 53, 20);
  const fax = extract(line, 73, 20);
  const email = extract(line, 93, 36);
  if (phone) state.meet.teamPhone = phone;
  if (phone2) state.meet.teamPhone2 = phone2;
  if (fax) state.meet.teamFax = fax;
  if (email) state.meet.teamContactEmail = email;
}

/** C6 is an extra contact line. The body is kept whole and re-checksummed. */
function parseC6(line: string, state: ParseState): void {
  const body = line.slice(0, 128).padEnd(128, " ");
  const lines = state.meet.hy3ContactLines ?? [];
  lines.push(body);
  state.meet.hy3ContactLines = lines;
}

/** C4 is not in the SwimComm or Maricopa corpora. Keep the text so it is not dropped. */
function parseC4(line: string, state: ParseState): void {
  const extra = extract(line, 3, 120);
  if (extra) state.meet.teamExtra = extra;
}

function resolveSwimmerDob(
  lineDob: string | undefined,
  usaMemberId: string | undefined,
): string | undefined {
  if (lineDob) return lineDob;
  if (usaMemberId) return parseDobFromUsaMemberId(usaMemberId);
  return undefined;
}

function parseD1(line: string, state: ParseState): void {
  const meetId = safeInt(extract(line, 4, 5), -1);
  if (meetId < 0) return;
  const gender = parseEventGender(extract(line, 3, 1));
  const lastName = extract(line, 9, 20);
  const firstName = extract(line, 29, 20);
  const nickName = extract(line, 49, 20) || undefined;
  const middleInitial = extract(line, 69, 1) || undefined;
  const practiceGroup = extract(line, 106, 2) || undefined;
  const practiceSubgroup = extract(line, 109, 3) || undefined;
  const usaMemberId = extract(line, 70, 14) || undefined;
  // Match hytek-parser d1_parser: DOB at cols 89–96 (MMDDYYYY).
  const dateOfBirth = resolveSwimmerDob(
    parseMmDdYyyy(extract(line, 89, 8)),
    usaMemberId,
  );
  const age = safeInt(extract(line, 97, 3), -1);
  const classYear = extract(line, 100, 2) || undefined;

  state.swimmers.set(meetId, {
    meetId,
    firstName,
    lastName,
    nickName,
    middleInitial,
    practiceGroup,
    practiceSubgroup,
    usaMemberId,
    dateOfBirth,
    gender,
    age: age >= 0 ? age : undefined,
    classYear,
    teamCode: state.lastTeamCode,
  });
}

function relayResultFromRound(
  entry: Hy3Entry,
  kind: ResultKind,
  round: RoundResult,
): ParsedRelayResult | null {
  const scored = scoredRound(round);
  if (!scored) return null;
  return {
    time: scored.time,
    place: round.overallPlace,
    isDq: scored.isDq,
    ...(scored.noSwim ? { noSwim: true } : {}),
    resultType: kind,
    heat: round.heat,
    lane: round.lane,
    dqCode: scored.noSwim ? undefined : round.dqCode,
    exhibition: entry.exhibition,
  };
}

function parseE1(line: string, state: ParseState): void {
  const meetId = safeInt(extract(line, 4, 5), -1);
  const eventGender = parseEventGender(extract(line, 14, 1));
  const distance = safeInt(extract(line, 16, 6));
  const strokeCode = extract(line, 22, 1);
  const ageMin = safeInt(extract(line, 23, 3), -1);
  const ageMax = safeInt(extract(line, 26, 3), -1);
  const eventNumberRaw = extract(line, 39, 4);
  const eventCourse = mapCourse(extract(line, 51, 1), state.meet.course);
  const seedSeconds = parseTimeField(extract(line, 52, 8));
  const seedCourse = mapCourse(extract(line, 60, 1), eventCourse);
  const meetDivision =
    divisionCode(line.slice(76, 78)) || divisionCode(extract(line, 92, 2));
  const entryMark = extract(line, 92, 1) || undefined;
  const exhibition = extract(line, 84, 1).toUpperCase() === "X";
  const stroke = mapStroke(strokeCode, false);
  const token = splitEventToken(eventNumberRaw);
  const eventNumber = token.eventNumber;
  const eventKey = eventNumberRaw || `${distance}-${stroke}-${eventGender}`;

  ensureEvent(state, eventKey, {
    number: eventKey,
    eventNumber,
    distance,
    stroke,
    course: eventCourse,
    gender: eventGender,
    ageMin: ageMin >= 0 ? ageMin : undefined,
    ageMax: ageMax >= 0 ? ageMax : undefined,
    relay: false,
    suffix: token.eventSuffix,
  });

  const entry: Hy3Entry = {
    eventNumber,
    meetId: meetId >= 0 ? meetId : undefined,
    relay: false,
    seedSeconds,
    seedCourse,
    exhibition,
    meetDivision,
    entryMark,
    eventSuffix: token.eventSuffix,
    legSwimmers: new Map(),
  };
  state.entries.push(entry);
  state.lastEventKey = eventKey;
  state.lastEntry = entry;
}

function parseE2(line: string, state: ParseState): void {
  const entry = state.lastEntry;
  if (!entry) return;
  const kind = parseResultKind(extract(line, 3, 1));
  if (!kind) return;

  const timeSeconds = parseTimeField(extract(line, 4, 8));
  const timeCode = extract(line, 13, 1) || undefined;
  const dqCode = DQ_TIME_CODES.has(timeCode ?? "")
    ? extract(line, 14, 2) || undefined
    : undefined;
  const heat = safeInt(extract(line, 21, 3), -1);
  const lane = safeInt(extract(line, 24, 3), -1);
  const heatPlace = safeInt(extract(line, 27, 3), -1);
  const overallPlace = safeInt(extract(line, 30, 4), -1);

  applyRound(entry, kind, {
    timeSeconds,
    timeCode,
    dqCode,
    heat: heat >= 0 ? heat : undefined,
    lane: lane >= 0 ? lane : undefined,
    heatPlace: heatPlace >= 0 ? heatPlace : undefined,
    overallPlace: overallPlace >= 0 ? overallPlace : undefined,
    splits: new Map(),
  });
}

function parseF1(line: string, state: ParseState): void {
  const teamCode = extract(line, 3, 5);
  const relayLetter = extract(line, 8, 1);
  const eventGender = parseEventGender(extract(line, 14, 1));
  const distance = safeInt(extract(line, 16, 6));
  const strokeCode = extract(line, 22, 1);
  const ageMin = safeInt(extract(line, 23, 3), -1);
  const ageMax = safeInt(extract(line, 26, 3), -1);
  const eventNumberRaw = extract(line, 39, 4);
  const eventCourse = mapCourse(extract(line, 51, 1), state.meet.course);
  const seedSeconds = parseTimeField(extract(line, 52, 8));
  const seedCourse = mapCourse(extract(line, 60, 1), eventCourse);
  const stroke = mapStroke(strokeCode, true);
  const token = splitEventToken(eventNumberRaw);
  const eventNumber = token.eventNumber;
  const eventKey = eventNumberRaw || `${distance}-${stroke}-${eventGender}-R`;

  ensureEvent(state, eventKey, {
    number: eventKey,
    eventNumber,
    distance,
    stroke,
    course: eventCourse,
    gender: eventGender,
    ageMin: ageMin >= 0 ? ageMin : undefined,
    ageMax: ageMax >= 0 ? ageMax : undefined,
    relay: true,
    suffix: token.eventSuffix,
  });

  const entry: Hy3Entry = {
    eventNumber,
    relay: true,
    seedSeconds,
    seedCourse,
    exhibition: false,
    teamCode,
    relayLetter,
    eventSuffix: token.eventSuffix,
    legSwimmers: new Map(),
  };
  state.entries.push(entry);
  state.lastEventKey = eventKey;
  state.lastEntry = entry;
}

function parseF2(line: string, state: ParseState): void {
  parseE2(line, state);
}

function parseF3(line: string, state: ParseState): void {
  const entry = state.lastEntry;
  if (!entry?.relay) return;
  for (let x = 0; x < 8; x++) {
    const offset = x * 13;
    const meetIdRaw = extract(line, 4 + offset, 5);
    if (!meetIdRaw) break;
    const meetId = safeInt(meetIdRaw, -1);
    if (meetId < 0) break;
    const leg = safeInt(extract(line, 15 + offset, 1), x + 1);
    entry.legSwimmers.set(leg, meetId);
  }
}

function parseG1(line: string, state: ParseState): void {
  const entry = state.lastEntry;
  if (!entry) return;
  const kind = parseResultKind(extract(line, 3, 1));
  if (!kind) return;
  const round = entry[kind] ?? {
    splits: new Map(),
  };
  let linePos = 4;
  while (linePos < 124 && line[linePos] != null && line[linePos] !== " ") {
    const splitNum = safeInt(extract(line, linePos, 2), -1);
    const splitTime = safeFloat(extract(line, linePos + 2, 8));
    if (splitNum >= 0 && splitTime != null) {
      round.splits.set(splitNum, splitTime);
    }
    linePos += 11;
  }
  entry[kind] = round;
}

function parseH1(line: string, state: ParseState): void {
  const entry = state.lastEntry;
  if (!entry) return;
  const dqCode = extract(line, 3, 2) || undefined;
  const target =
    entry.finals?.dqCode != null
      ? entry.finals
      : entry.swimoff?.dqCode != null
        ? entry.swimoff
        : entry.prelim;
  if (target && dqCode) target.dqCode = dqCode;
}

function parseH2(_line: string, _state: ParseState): void {
  // Detail string not flattened into ParsedMeet yet.
}

function flatten(state: ParseState): ParsedMeet {
  const events: ParsedEvent[] = [];

  for (const event of state.events.values()) {
    const gender = event.gender;
    const stroke = event.stroke;
    const course = event.course;
    const eventKey = buildEventKey(
      event.distance,
      stroke as Stroke | RelayStroke,
      course,
      gender,
    );
    const ageGroup = formatAgeGroup(event.ageMin, event.ageMax);
    events.push({
      eventNumber: event.eventNumber,
      distance: event.distance,
      stroke,
      gender,
      ageGroup,
      eventKey,
      eventSuffix: event.suffix,
    });
  }

  const entries: ParsedEntry[] = [];
  const results: ParsedResult[] = [];
  const relays: ParsedRelayEntry[] = [];
  const individualMeetIds = new Set<number>();

  for (const entry of state.entries) {
    if (entry.relay) {
      const names = [...entry.legSwimmers.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, id]) => state.swimmers.get(id))
        .filter((s): s is Hy3Swimmer => !!s)
        .map(swimmerDisplayName);
      const relayResults = allRoundResults(entry)
        .map(({ kind, result }) => relayResultFromRound(entry, kind, result))
        .filter((result): result is ParsedRelayResult => result != null);
      relays.push({
        eventNumber: entry.eventNumber,
        swimmerNames: names,
        seedTime: secondsToTimeString(entry.seedSeconds),
        seedCourse: entry.seedCourse,
        teamCode: entry.teamCode,
        relayLetter: entry.relayLetter,
        eventSuffix: entry.eventSuffix,
        results: relayResults.length > 0 ? relayResults : undefined,
      });
      continue;
    }

    if (entry.meetId == null) continue;
    const swimmer = state.swimmers.get(entry.meetId);
    if (!swimmer) continue;
    individualMeetIds.add(entry.meetId);
    const swimmerName = swimmerDisplayName(swimmer);

    entries.push({
      eventNumber: entry.eventNumber,
      swimmerName,
      seedTime: secondsToTimeString(entry.seedSeconds),
      usaMemberId: swimmer.usaMemberId,
      dateOfBirth: swimmer.dateOfBirth,
      gender:
        swimmer.gender === "male" || swimmer.gender === "female"
          ? swimmer.gender
          : undefined,
      classYear: swimmer.classYear,
      meetSwimmerId: swimmer.meetId,
      preferredName: swimmer.nickName,
      legalFirstName: swimmer.firstName,
      middleInitial: swimmer.middleInitial,
      practiceGroup: swimmer.practiceGroup,
      practiceSubgroup: swimmer.practiceSubgroup,
      seedCourse: entry.seedCourse,
      exhibition: entry.exhibition,
      meetDivision: entry.meetDivision,
      hy3EntryMark: entry.entryMark,
      eventSuffix: entry.eventSuffix,
    });

    const rounds = allRoundResults(entry);
    if (rounds.length === 0) continue;
    for (const { kind, result } of rounds) {
      pushResultFromRound(results, entry, swimmer, kind, result);
    }
  }

  const athletes: ParsedAthlete[] = [];
  for (const swimmer of state.swimmers.values()) {
    const name = swimmerDisplayName(swimmer);
    if (!name) continue;
    athletes.push({
      name,
      usaMemberId: swimmer.usaMemberId,
      dateOfBirth: swimmer.dateOfBirth,
      gender:
        swimmer.gender === "male" || swimmer.gender === "female"
          ? swimmer.gender
          : undefined,
      classYear: swimmer.classYear,
      meetSwimmerId: swimmer.meetId,
      preferredName: swimmer.nickName,
      legalFirstName: swimmer.firstName,
      middleInitial: swimmer.middleInitial,
      practiceGroup: swimmer.practiceGroup,
      practiceSubgroup: swimmer.practiceSubgroup,
      relayOnly: !individualMeetIds.has(swimmer.meetId),
    });
  }

  return {
    name: state.meet.name,
    startDate: state.meet.startDate,
    endDate: normalizeMeetEndDate(state.meet.startDate, state.endDate),
    course: state.meet.course,
    location: state.meet.location,
    altitude: state.altitude,
    sanctionNumber: state.sanctionNumber,
    notes: state.notes,
    importKind: state.meet.importKind,
    ageUpDate: state.ageUpDate,
    teamCode: state.meet.teamCode,
    lscCode: state.meet.lscCode,
    teamName: state.meet.teamName,
    teamShortName: state.meet.teamShortName,
    teamKind: state.meet.teamKind,
    teamAddressLine1: state.meet.teamAddressLine1,
    teamAddressLine2: state.meet.teamAddressLine2,
    teamCity: state.meet.teamCity,
    teamRegion: state.meet.teamRegion,
    teamPostalCode: state.meet.teamPostalCode,
    teamCountry: state.meet.teamCountry,
    teamContactName: state.meet.teamContactName,
    teamContactName2: state.meet.teamContactName2,
    teamContactEmail: state.meet.teamContactEmail,
    teamPhone: state.meet.teamPhone,
    teamPhone2: state.meet.teamPhone2,
    teamFax: state.meet.teamFax,
    teamExtra: state.meet.teamExtra,
    teamOrgCode: state.meet.teamOrgCode,
    hy3Publisher: state.meet.hy3Publisher,
    hy3Software: state.meet.hy3Software,
    hy3CreatedOn: state.meet.hy3CreatedOn,
    hy3CreatedTime: state.meet.hy3CreatedTime,
    hy3Licensee: state.meet.hy3Licensee,
    hy3EntrySetup: state.meet.hy3EntrySetup,
    hy3ContactLines: state.meet.hy3ContactLines,
    events,
    entries,
    results,
    relays: relays.length > 0 ? relays : undefined,
    athletes: athletes.length > 0 ? athletes : undefined,
  };
}

const LINE_PARSERS: Record<string, (line: string, state: ParseState) => void> =
  {
    A1: parseA1,
    B1: parseB1,
    B2: parseB2,
    C1: parseC1,
    C2: parseC2,
    C3: parseC3,
    C4: parseC4,
    C6: parseC6,
    D1: parseD1,
    E1: parseE1,
    E2: parseE2,
    F1: parseF1,
    F2: parseF2,
    F3: parseF3,
    G1: parseG1,
    H1: parseH1,
    H2: parseH2,
  };

/** Parse Hy-Tek Meet Manager .HY3 merge/entry/results exports. */
export function parseHy3(content: string): ParsedMeet {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const state: ParseState = {
    meet: {
      name: "HY-TEK Import",
      course: "SCY",
      events: [],
      entries: [],
      results: [],
    },
    swimmers: new Map(),
    events: new Map(),
    entries: [],
  };

  for (const line of lines) {
    if (line.length < 2) continue;
    const code = line.slice(0, 2);
    if (code === "Z0") break;
    const parser = LINE_PARSERS[code];
    if (parser) parser(line, state);
  }

  return flatten(state);
}
