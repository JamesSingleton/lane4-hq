import { eventGenderToCode, parseEventGender } from "@lane4hq/swim-core/events";
import { teamFilePrefix } from "@lane4hq/swim-core/team-codes";
import { formatTime, parseTime } from "@lane4hq/swim-core/times";
import { strToU8, zipSync } from "fflate";
import { cl2G0RoundSuffix, resultRoundCode } from "../g0-meta";
import type { ParsedEvent, ParsedMeet, ParsedResult } from "../types";

function pad(value: string, len: number): string {
  return value.slice(0, len).padEnd(len, " ");
}

function strokeCode(stroke: string): string {
  const map: Record<string, string> = {
    free: "FR ",
    back: "BK ",
    breast: "BR ",
    fly: "FL ",
    im: "IM ",
  };
  return map[stroke] ?? "FR ";
}

/** Compact M/F/X code for SDIF/HY3 event records. */
function exportGenderCode(gender: string): string {
  return eventGenderToCode(parseEventGender(gender)).toUpperCase();
}

/** "YYYY-MM-DD" → "M/D/YYYY" for Hy-Tek EV3/HYV headers. */
function toMmDdYyyySlash(date: string | undefined): string {
  if (!date) return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

function sdifAthleteLine(
  type: "D0" | "G0",
  fields: {
    eventNumber?: number;
    lastName: string;
    firstName: string;
    usaMemberId?: string;
    seedTime?: string;
    time?: string;
    place?: number;
    isDq?: boolean;
    resultType?: ParsedResult["resultType"];
    heat?: number;
    lane?: number;
  },
): string {
  const line = new FixedLine();
  line.set(1, 2, type);
  line.set(10, 4, String(fields.eventNumber ?? 0).padStart(4, "0"));
  line.set(49, 20, fields.lastName);
  line.set(69, 20, fields.firstName);
  if (type === "D0") {
    line.set(54, 12, fields.usaMemberId ?? "");
    line.set(100, 8, fields.seedTime ?? "");
  } else {
    if (fields.heat != null) line.set(94, 3, String(fields.heat));
    if (fields.lane != null) line.set(97, 3, String(fields.lane));
    line.set(100, 8, fields.time ?? "");
    if (fields.place != null) {
      line.set(114, 4, String(fields.place).padStart(4, "0"));
    }
    if (fields.isDq) line.set(117, 1, "D");
  }
  let out = line.toString();
  if (type === "G0") {
    const round = resultRoundCode(fields.resultType);
    if (round) out = `${out.padEnd(118, " ")}${round}`;
  }
  return out;
}

/** Export a meet (events + entries + results) as SDIF-ish text. */
export function exportSdif(meet: ParsedMeet): string {
  const lines: string[] = [];
  lines.push(`A01V3      02Meet Entries                  Lane4 HQ`);
  lines.push(
    new FixedLine()
      .set(1, 2, "B1")
      .set(12, 30, meet.name)
      .set(42, 30, meet.location ?? "")
      .set(72, 8, toMmDdYyyy(meet.startDate))
      .set(80, 8, toMmDdYyyy(meet.endDate))
      .set(88, 13, meet.course)
      .toString(),
  );

  for (const event of meet.events) {
    lines.push(
      new FixedLine()
        .set(1, 2, "E1")
        .set(10, 4, String(event.eventNumber ?? 0).padStart(4, "0"))
        .set(26, 1, exportGenderCode(event.gender))
        .set(27, 4, String(event.distance).padStart(4, "0"))
        .set(31, 3, strokeCode(event.stroke))
        .toString(),
    );
  }

  const entrySwimmerKeys = new Set(
    meet.entries.map((entry) => entry.swimmerName.trim().toLowerCase()),
  );
  for (const entry of meet.entries) {
    const { firstName, lastName } = splitName(entry.swimmerName);
    lines.push(
      sdifAthleteLine("D0", {
        eventNumber: entry.eventNumber,
        lastName,
        firstName,
        usaMemberId: entry.usaMemberId,
        seedTime: entry.seedTime,
      }),
    );
  }

  for (const athlete of meet.athletes ?? []) {
    if (!athlete.relayOnly) continue;
    const key = athlete.name.trim().toLowerCase();
    if (entrySwimmerKeys.has(key)) continue;
    entrySwimmerKeys.add(key);
    const { firstName, lastName } = splitName(athlete.name);
    lines.push(
      sdifAthleteLine("D0", {
        eventNumber: 0,
        lastName,
        firstName,
        usaMemberId: athlete.usaMemberId,
      }),
    );
  }

  for (const result of meet.results) {
    const { firstName, lastName } = splitName(result.swimmerName);
    lines.push(
      sdifAthleteLine("G0", {
        eventNumber: result.eventNumber,
        lastName,
        firstName,
        time: result.time,
        place: result.place,
        isDq: result.isDq,
        resultType: result.resultType,
        heat: result.heat,
        lane: result.lane,
      }),
    );
  }

  lines.push("Z0");
  return lines.join("\r\n");
}

/**
 * Fixed-width record builder using 1-based column offsets, matching the
 * `extract(line, start, length)` helper in `../hy3/parser.ts`. Values are
 * left-justified within their field; unset columns stay blank.
 */
class FixedLine {
  private chars: string[] = [];

  set(
    start: number,
    length: number,
    value: string | number | undefined | null,
  ): this {
    const str = value == null ? "" : String(value);
    const slice = str.slice(0, length);
    const end = start - 1 + length;
    if (this.chars.length < end) this.chars.length = end;
    for (let i = 0; i < slice.length; i++) {
      this.chars[start - 1 + i] = slice[i]!;
    }
    return this;
  }

  toString(): string {
    let out = "";
    for (let i = 0; i < this.chars.length; i++) out += this.chars[i] ?? " ";
    return out.replace(/\s+$/, "");
  }

  /** Right-align `value` in a fixed field (Hy-Tek meet IDs, seeds, event numbers). */
  setRight(start: number, length: number, value: string | number): this {
    return this.set(
      start,
      length,
      String(value).slice(0, length).padStart(length, " "),
    );
  }
}

const COURSE_LETTER: Record<ParsedMeet["course"], string> = {
  SCY: "Y",
  SCM: "S",
  LCM: "L",
};

const HY3_STROKE_LETTER: Record<string, string> = {
  free: "A",
  back: "B",
  breast: "C",
  fly: "D",
  im: "E",
};

function hy3StrokeLetter(stroke: string | undefined): string {
  if (!stroke) return "A";
  return HY3_STROKE_LETTER[stroke] ?? "A";
}

function hy3RelayStrokeLetter(stroke: string | undefined): string {
  return stroke === "medley_relay" ? "E" : "A";
}

/** Inverse of the HY3 parser's `formatAgeGroup` (e.g. "13-14", "15&O", "10&U"). */
function ageRangeFromGroup(ageGroup?: string): { min: number; max: number } {
  if (!ageGroup) return { min: 0, max: 109 };
  const over = ageGroup.match(/^(\d+)&O$/i);
  if (over) return { min: Number(over[1]), max: 109 };
  const under = ageGroup.match(/^(\d+)&U$/i);
  if (under) return { min: 0, max: Number(under[1]) };
  const range = ageGroup.match(/^(\d+)-(\d+)$/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return { min: 0, max: 109 };
}

/**
 * HY3 age fields as strings for E1/F1. Unspecified groups use TM's 0–109
 * open range (parser treats that as no age group). One-sided groups still
 * leave the other bound blank so formatAgeGroup reconstructs N&O / N&U.
 */
function ageFieldsFromGroup(ageGroup?: string): { min: string; max: string } {
  if (!ageGroup) return { min: "0", max: "109" };
  const over = ageGroup.match(/^(\d+)&O$/i);
  if (over) return { min: over[1]!, max: "" };
  const under = ageGroup.match(/^(\d+)&U$/i);
  if (under) return { min: "", max: under[1]! };
  const range = ageGroup.match(/^(\d+)-(\d+)$/);
  if (range) return { min: range[1]!, max: range[2]! };
  return { min: "0", max: "109" };
}

/** "YYYY-MM-DD" → "MMDDYYYY" (HY3 date fields); "" when unparseable. */
function toMmDdYyyy(date: string | undefined): string {
  if (!date) return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[2]}${m[3]}${m[1]}`;
}

/** Hy-Tek numeric time fields are plain decimal seconds (e.g. "65.00" for 1:05.00). */
function toHy3Seconds(time: string | undefined): string {
  if (!time) return "";
  const ms = parseTime(time);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return (ms / 1000).toFixed(2);
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

const HY3_LINE_WIDTH = 128;

function hy3Checksum(body: string): string {
  const padded = body.padEnd(HY3_LINE_WIDTH, " ").slice(0, HY3_LINE_WIDTH);
  let even = 0;
  let odd = 0;
  for (let i = 0; i < HY3_LINE_WIDTH; i++) {
    const code = padded.charCodeAt(i);
    if (i % 2 === 0) even += code;
    else odd += 2 * code;
  }
  const value = Math.floor((even + odd) / 21) + 205;
  const mod = value % 100;
  return `${mod % 10}${Math.floor(mod / 10)}`;
}

function hy3Line(line: FixedLine): string {
  const body = line
    .toString()
    .padEnd(HY3_LINE_WIDTH, " ")
    .slice(0, HY3_LINE_WIDTH);
  return `${body}${hy3Checksum(body)}`;
}

function resolveTeamCode(meet: ParsedMeet): string {
  const raw =
    meet.teamCode ??
    meet.results.find((r) => r.teamCode)?.teamCode ??
    meet.relays?.find((r) => r.teamCode)?.teamCode ??
    "TEAM";
  return raw.trim().toUpperCase().slice(0, 5) || "TEAM";
}

function ageYearsOnDate(
  dateOfBirth: string | undefined,
  onDate: string | undefined,
): number {
  const dob = dateOfBirth?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dob) return 0;
  const on = (onDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const year = on ? Number(on[1]) : new Date().getUTCFullYear();
  const month = on ? Number(on[2]) : 12;
  const day = on ? Number(on[3]) : 31;
  let age = year - Number(dob[1]);
  const dobMonth = Number(dob[2]);
  const dobDay = Number(dob[3]);
  if (month < dobMonth || (month === dobMonth && day < dobDay)) age -= 1;
  return age < 0 ? 0 : age;
}

function lastNameStub(lastName: string): string {
  return lastName
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 5)
    .padEnd(5, " ");
}

function toDdMmmYyyy(date: string | undefined): string {
  if (!date) return "";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m[2]) - 1];
  if (!month) return "";
  return `${m[3]}${month}${m[1]}`;
}

type Hy3SwimmerRec = {
  meetId: number;
  name: string;
  usaMemberId?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
  classYear?: string;
};

/**
 * Keyed by name only (not USA ID) so relay-leg lookups — which only have a
 * swimmer name to go on — always resolve to the same registry entry as the
 * individual-entry registration for that swimmer.
 */
function swimmerRegistryKey(name: string): string {
  return `name:${name.trim().toLowerCase()}`;
}

function resultGroupKey(eventNumber: number | undefined, name: string): string {
  return `${eventNumber ?? ""}|${name.trim().toLowerCase()}`;
}

/**
 * Export a meet (events + entries + results + relays) as a Hy-Tek Team
 * Manager–style HY3 file, using the same line families and 1-based column
 * layout the parser in `../hy3/parser.ts` expects (A1/B1/B2/C1/D1/E1/E2/F1/F3).
 */
export function exportHy3(meet: ParsedMeet): string {
  const lines: string[] = [];
  const courseLetter = COURSE_LETTER[meet.course];
  const teamCode = resolveTeamCode(meet);
  const lsc = (meet.lscCode ?? "").trim().toUpperCase().slice(0, 2);
  const teamName = meet.teamName ?? "";
  const teamShort = (meet.teamShortName ?? teamCode).slice(0, 16);

  const title =
    meet.importKind === "results"
      ? "Results From MM to TM"
      : meet.importKind === "roster"
        ? "Rosters Only"
        : meet.importKind === "entries"
          ? "Meet Entries"
          : meet.results.length > 0 && meet.entries.length === 0
            ? "Results From MM to TM"
            : "Meet Entries";
  lines.push(
    hy3Line(
      new FixedLine()
        .set(1, 2, "A1")
        .set(3, 30, title)
        .set(33, 30, "Lane4 HQ, Ltd    Win-TM 1.0"),
    ),
  );

  const startDigits = toMmDdYyyy(meet.startDate);
  const endDigits = toMmDdYyyy(meet.endDate) || startDigits;
  lines.push(
    hy3Line(
      new FixedLine()
        .set(1, 2, "B1")
        .set(3, 45, meet.name)
        .set(48, 45, meet.location)
        .set(93, 8, startDigits)
        .set(101, 8, endDigits)
        .set(109, 8, startDigits)
        .set(117, 5, meet.altitude),
    ),
  );

  lines.push(
    hy3Line(
      new FixedLine()
        .set(1, 2, "B2")
        .set(3, 45, meet.notes)
        .set(99, 1, courseLetter)
        .set(109, 20, meet.sanctionNumber),
    ),
  );

  const c1 = new FixedLine()
    .set(1, 2, "C1")
    .set(3, 5, teamCode)
    .set(8, 30, teamName)
    .set(38, 16, teamShort)
    .set(54, 2, lsc)
    .set(56, 30, meet.teamContactName);
  if (meet.teamKind) c1.set(121, 2, meet.teamKind.slice(0, 2));
  lines.push(hy3Line(c1));

  const street = [meet.teamAddressLine1, meet.teamAddressLine2]
    .filter(Boolean)
    .join(" ")
    .trim();
  const city = (meet.teamCity ?? "").trim();
  const region = (meet.teamRegion ?? "").trim().toUpperCase().slice(0, 2);
  const postal = (meet.teamPostalCode ?? "").trim();
  const country = (meet.teamCountry ?? (street || city ? "USA" : "")).trim();
  if (street || city || region || postal) {
    const c2 = new FixedLine()
      .set(1, 2, "C2")
      .set(3, 60, street)
      .set(63, 30, city)
      .set(93, 2, region)
      .set(95, 10, postal)
      .set(105, 3, country.slice(0, 3).toUpperCase());
    if (country.toUpperCase() === "USA") c2.set(109, 3, "USS");
    lines.push(hy3Line(c2));
  }
  if (meet.teamContactEmail) {
    lines.push(
      hy3Line(
        new FixedLine().set(1, 2, "C3").set(93, 36, meet.teamContactEmail),
      ),
    );
  }

  // --- Build the swimmer registry (D1 records) shared by entries + relays.
  const registry = new Map<string, Hy3SwimmerRec>();
  let nextMeetId = 1;
  function registerSwimmer(
    name: string,
    opts: {
      usaMemberId?: string;
      dateOfBirth?: string;
      gender?: "male" | "female";
      classYear?: string;
    },
  ): Hy3SwimmerRec {
    const key = swimmerRegistryKey(name);
    const existing = registry.get(key);
    if (existing) {
      existing.usaMemberId ??= opts.usaMemberId;
      existing.dateOfBirth ??= opts.dateOfBirth;
      existing.gender ??= opts.gender;
      existing.classYear ??= opts.classYear;
      return existing;
    }
    const rec: Hy3SwimmerRec = {
      meetId: nextMeetId++,
      name,
      usaMemberId: opts.usaMemberId,
      dateOfBirth: opts.dateOfBirth,
      gender: opts.gender,
      classYear: opts.classYear,
    };
    registry.set(key, rec);
    return rec;
  }

  // Entry "units" (one E1 per event+swimmer) come from explicit entries,
  // plus any results without a matching entry (results-only imports).
  type EntryUnit = {
    eventNumber?: number;
    swimmerName: string;
    seedTime?: string;
    exhibition?: boolean;
    usaMemberId?: string;
    dateOfBirth?: string;
    gender?: "male" | "female";
    classYear?: string;
  };
  const entryUnits: EntryUnit[] = [];
  const seenUnitKeys = new Set<string>();
  for (const entry of meet.entries) {
    entryUnits.push({ ...entry });
    seenUnitKeys.add(resultGroupKey(entry.eventNumber, entry.swimmerName));
  }
  for (const result of meet.results) {
    const key = resultGroupKey(result.eventNumber, result.swimmerName);
    if (seenUnitKeys.has(key)) continue;
    seenUnitKeys.add(key);
    entryUnits.push({
      eventNumber: result.eventNumber,
      swimmerName: result.swimmerName,
      usaMemberId: result.usaMemberId,
      dateOfBirth: result.dateOfBirth,
      gender: result.gender,
      exhibition: result.exhibition,
    });
  }

  for (const unit of entryUnits) {
    registerSwimmer(unit.swimmerName, {
      usaMemberId: unit.usaMemberId,
      dateOfBirth: unit.dateOfBirth,
      gender: unit.gender,
      classYear: unit.classYear,
    });
  }
  for (const relay of meet.relays ?? []) {
    for (const name of relay.swimmerNames) registerSwimmer(name, {});
  }
  for (const athlete of meet.athletes ?? []) {
    registerSwimmer(athlete.name, {
      usaMemberId: athlete.usaMemberId,
      dateOfBirth: athlete.dateOfBirth,
      gender: athlete.gender,
      classYear: athlete.classYear,
    });
  }

  const resultsByKey = new Map<string, ParsedResult[]>();
  for (const result of meet.results) {
    const key = resultGroupKey(result.eventNumber, result.swimmerName);
    const list = resultsByKey.get(key) ?? [];
    list.push(result);
    resultsByKey.set(key, list);
  }

  const eventByNumber = new Map<number, ParsedEvent>();
  for (const event of meet.events) {
    if (event.eventNumber != null) eventByNumber.set(event.eventNumber, event);
  }

  const unitsBySwimmer = new Map<string, EntryUnit[]>();
  for (const unit of entryUnits) {
    const key = swimmerRegistryKey(unit.swimmerName);
    const list = unitsBySwimmer.get(key) ?? [];
    list.push(unit);
    unitsBySwimmer.set(key, list);
  }

  for (const rec of [...registry.values()].sort(
    (a, b) => a.meetId - b.meetId,
  )) {
    const { firstName, lastName } = splitName(rec.name);
    const genderCode = rec.gender === "female" ? "F" : "M";
    const d1 = new FixedLine()
      .set(1, 2, "D1")
      .set(3, 1, genderCode)
      .setRight(4, 5, rec.meetId)
      .set(9, 20, lastName)
      .set(29, 20, firstName)
      .set(70, 14, rec.usaMemberId)
      .set(89, 8, toMmDdYyyy(rec.dateOfBirth))
      .setRight(97, 3, ageYearsOnDate(rec.dateOfBirth, meet.startDate));
    if (rec.classYear) d1.set(100, 2, rec.classYear.slice(0, 2).toUpperCase());
    lines.push(hy3Line(d1));

    for (const unit of unitsBySwimmer.get(swimmerRegistryKey(rec.name)) ?? []) {
      const event =
        unit.eventNumber != null
          ? eventByNumber.get(unit.eventNumber)
          : undefined;
      const ageFields = ageFieldsFromGroup(event?.ageGroup);
      const eventGender = exportGenderCode(
        event?.gender ?? rec.gender ?? "mixed",
      );
      const seed = toHy3Seconds(unit.seedTime) || "0.00";
      lines.push(
        hy3Line(
          new FixedLine()
            .set(1, 2, "E1")
            .set(3, 1, genderCode)
            .setRight(4, 5, rec.meetId)
            .set(9, 5, lastNameStub(lastName))
            .set(14, 1, eventGender)
            .set(15, 1, eventGender)
            .setRight(16, 6, event?.distance ?? 0)
            .set(22, 1, hy3StrokeLetter(event?.stroke))
            .setRight(23, 3, ageFields.min)
            .setRight(26, 3, ageFields.max)
            .setRight(
              39,
              4,
              unit.eventNumber != null ? String(unit.eventNumber) : "",
            )
            .set(51, 1, courseLetter)
            .setRight(52, 8, seed)
            .set(60, 1, courseLetter)
            .set(84, 1, unit.exhibition ? "X" : ""),
        ),
      );

      const results =
        resultsByKey.get(resultGroupKey(unit.eventNumber, unit.swimmerName)) ??
        [];
      for (const result of results) {
        const kindCode =
          result.resultType === "prelim"
            ? "P"
            : result.resultType === "swimoff"
              ? "S"
              : "F";
        lines.push(
          hy3Line(
            new FixedLine()
              .set(1, 2, "E2")
              .set(3, 1, kindCode)
              .set(4, 8, result.isDq ? "" : toHy3Seconds(result.time))
              .set(13, 1, result.isDq ? "D" : "")
              .set(
                14,
                2,
                result.isDq ? (result.dqCode ?? "DQ").slice(0, 2) : "",
              )
              .set(21, 3, result.heat != null ? String(result.heat) : "")
              .set(24, 3, result.lane != null ? String(result.lane) : "")
              .set(30, 4, result.place != null ? String(result.place) : ""),
          ),
        );
      }
    }
  }

  for (const relay of meet.relays ?? []) {
    const event =
      relay.eventNumber != null
        ? eventByNumber.get(relay.eventNumber)
        : undefined;
    const ageFields = ageFieldsFromGroup(event?.ageGroup);
    const eventGender = exportGenderCode(event?.gender ?? "mixed");
    const seed = toHy3Seconds(relay.seedTime) || "0.00";
    lines.push(
      hy3Line(
        new FixedLine()
          .set(1, 2, "F1")
          .set(3, 5, relay.teamCode ?? teamCode)
          .set(8, 1, relay.relayLetter ?? "A")
          .set(14, 1, eventGender)
          .set(15, 1, eventGender)
          .setRight(16, 6, event?.distance ?? 200)
          .set(22, 1, hy3RelayStrokeLetter(event?.stroke))
          .setRight(23, 3, ageFields.min)
          .setRight(26, 3, ageFields.max)
          .setRight(
            39,
            4,
            relay.eventNumber != null ? String(relay.eventNumber) : "",
          )
          .set(51, 1, courseLetter)
          .setRight(52, 8, seed)
          .set(60, 1, courseLetter),
      ),
    );

    for (const result of relay.results ?? []) {
      const kindCode =
        result.resultType === "prelim"
          ? "P"
          : result.resultType === "swimoff"
            ? "S"
            : "F";
      lines.push(
        hy3Line(
          new FixedLine()
            .set(1, 2, "F2")
            .set(3, 1, kindCode)
            .set(4, 8, result.isDq ? "" : toHy3Seconds(result.time))
            .set(13, 1, result.isDq ? "D" : "")
            .set(14, 2, result.isDq ? (result.dqCode ?? "DQ").slice(0, 2) : "")
            .set(21, 3, result.heat != null ? String(result.heat) : "")
            .set(24, 3, result.lane != null ? String(result.lane) : "")
            .set(30, 4, result.place != null ? String(result.place) : ""),
        ),
      );
    }

    const legLine = new FixedLine().set(1, 2, "F3");
    relay.swimmerNames.slice(0, 8).forEach((name, i) => {
      const rec = registry.get(swimmerRegistryKey(name))!;
      const { lastName } = splitName(rec.name);
      const offset = i * 13;
      const genderCode = rec.gender === "female" ? "F" : "M";
      legLine.set(3 + offset, 1, genderCode);
      legLine.setRight(4 + offset, 5, rec.meetId);
      legLine.set(9 + offset, 5, lastNameStub(lastName));
      legLine.set(14 + offset, 1, "F");
      legLine.set(15 + offset, 1, String(i + 1));
    });
    lines.push(hy3Line(legLine));
  }

  return lines.join("\r\n");
}

function cl2Field(value: string | undefined, len: number): string {
  return pad(value ?? "", len);
}

function cl2ChecksumLine(line: string): string {
  const body = line.padEnd(156, " ").slice(0, 156);
  let sum = 0;
  for (let i = 0; i < 156; i++) sum += body.charCodeAt(i);
  const value = Math.floor(sum / 19) + 211;
  const mod = value % 100;
  return `${body} N${mod % 10}${Math.floor(mod / 10)}`;
}

function cl2SeedDisplay(
  time: string | undefined,
  courseLetter: string,
): string {
  if (!time) return "NT";
  const ms = parseTime(time);
  if (!Number.isFinite(ms) || ms <= 0) return "NT";
  return `${formatTime(ms)}${courseLetter}`;
}

/** CL2 individual-event codes encode `${distance}${strokeDigit}` (decodeEventCode's convention). */
const CL2_STROKE_DIGIT: Record<string, string> = {
  free: "1",
  back: "2",
  breast: "3",
  fly: "4",
  im: "5",
};

function cl2GenderMarker(gender: "male" | "female" | undefined): "FF" | "MM" {
  return gender === "female" ? "FF" : "MM";
}

/** `${distance}${strokeDigit}` for individual events, decoded back by `decodeEventCode`. */
function cl2IndividualEventCode(
  event: ParsedEvent | undefined,
): string | undefined {
  if (!event) return undefined;
  const digit = CL2_STROKE_DIGIT[event.stroke] ?? "1";
  return `${event.distance}${digit}`;
}

/** `${distance}${6|8}` for relays — 6/7 decode to free_relay, 8 to medley_relay. */
function cl2RelayEventCode(event: ParsedEvent | undefined): string {
  const digit = event?.stroke === "medley_relay" ? "7" : "6";
  return `${event?.distance ?? 200}${digit}`;
}

/** `" FF 501"` / `" MM 1002"` — satisfies both `genderFromLine` and `extractD0Event`. */
function cl2EventToken(
  code: string | undefined,
  gender: "male" | "female" | undefined,
): string {
  if (!code) return "";
  return ` ${cl2GenderMarker(gender)} ${code}`;
}

/** `" 01011999FF"` packed DOB+gender — matched by `parseAthleteIdentity`'s primary regex. */
function cl2IdentityToken(
  dateOfBirth: string | undefined,
  gender: "male" | "female" | undefined,
): string {
  const mmddyyyy = toMmDdYyyy(dateOfBirth);
  if (!mmddyyyy) return "";
  return ` ${mmddyyyy}${cl2GenderMarker(gender)}`;
}

function cl2NameLine(
  type: "D0" | "G0" | "F0",
  swimmerName: string,
  extra: string,
): string {
  const { firstName, lastName } = splitName(swimmerName);
  return `${type}${" ".repeat(9)}${cl2Field(lastName, 20)}${cl2Field(firstName, 20)}${extra}`;
}

/**
 * Export a meet as an SDIF-style CL2 pack (A0/B1/C1/D0/E0/F0/G0), matching
 * the fixed name/ID columns and regex-based event-code/identity/relay
 * conventions `../cl2/parser.ts` looks for.
 */
export function exportCl2(meet: ParsedMeet): string {
  const lines: string[] = [];

  const label =
    meet.results.length > 0
      ? "Meet Results"
      : meet.importKind === "roster"
        ? "Swimmers Only"
        : "Meet Entries";
  lines.push(
    cl2ChecksumLine(`A0${" ".repeat(9)}${pad(label, 32)}${pad(meet.name, 30)}`),
  );

  const startDigits = toMmDdYyyy(meet.startDate).padEnd(8, "0");
  const endDigits = toMmDdYyyy(meet.endDate).padEnd(8, "0");
  const courseToken =
    meet.course === "LCM" ? "LCM" : meet.course === "SCM" ? "SCM" : "SCY";
  const courseLetter = COURSE_LETTER[meet.course];
  lines.push(
    cl2ChecksumLine(
      `B1${" ".repeat(9)}${pad(meet.name, 30)}${pad(meet.location ?? "", 30)}${startDigits}${endDigits}${pad(courseToken, 13)}`,
    ),
  );

  const teamCode = resolveTeamCode(meet);
  const lsc = (meet.lscCode ?? "").trim().toUpperCase().slice(0, 2);
  const cl2Id = `${lsc}${teamCode}`.slice(0, 8);
  const teamName = meet.teamName ?? "";
  const teamShort = (meet.teamShortName ?? teamCode).slice(0, 16);
  const c1 = new FixedLine()
    .set(1, 2, "C1")
    .set(3, 1, "1")
    .set(4, 2, lsc)
    .set(12, 8, cl2Id)
    .set(18, 30, teamName)
    .set(48, 16, teamShort)
    .set(108, 20, meet.teamCity)
    .set(128, 2, (meet.teamRegion ?? "").trim().toUpperCase().slice(0, 2))
    .set(130, 10, meet.teamPostalCode)
    .set(140, 3, (meet.teamCountry ?? "").trim().toUpperCase().slice(0, 3));
  lines.push(cl2ChecksumLine(c1.toString()));

  const eventByNumber = new Map<number, ParsedEvent>();
  for (const event of meet.events) {
    if (event.eventNumber != null) eventByNumber.set(event.eventNumber, event);
  }

  type SwimmerIdentity = {
    usaMemberId?: string;
    dateOfBirth?: string;
    gender?: "male" | "female";
    classYear?: string;
  };
  const identityByName = new Map<string, SwimmerIdentity>();
  function noteIdentity(name: string, identity: SwimmerIdentity): void {
    const key = name.trim().toLowerCase();
    const existing = identityByName.get(key) ?? {};
    identityByName.set(key, {
      usaMemberId: existing.usaMemberId ?? identity.usaMemberId,
      dateOfBirth: existing.dateOfBirth ?? identity.dateOfBirth,
      gender: existing.gender ?? identity.gender,
      classYear: existing.classYear ?? identity.classYear,
    });
  }
  for (const entry of meet.entries) {
    noteIdentity(entry.swimmerName, entry);
  }
  for (const result of meet.results) {
    noteIdentity(result.swimmerName, result);
  }
  for (const athlete of meet.athletes ?? []) {
    noteIdentity(athlete.name, athlete);
  }

  function writeCl2EntryD0(
    swimmerName: string,
    eventNumber: number | undefined,
    seedTime: string | undefined,
    classYear: string | undefined,
    gender: "male" | "female" | undefined,
  ): void {
    const event =
      eventNumber != null ? eventByNumber.get(eventNumber) : undefined;
    const identity = identityByName.get(swimmerName.trim().toLowerCase());
    const sex =
      event?.gender === "female" || event?.gender === "male"
        ? event.gender
        : (gender ?? identity?.gender);
    const { firstName, lastName } = splitName(swimmerName);
    const d0 = new FixedLine()
      .set(1, 2, "D0")
      .set(3, 1, "1")
      .set(4, 2, lsc)
      .set(
        8,
        2,
        (classYear ?? identity?.classYear ?? "").slice(0, 2).toUpperCase(),
      )
      .set(12, 40, `${lastName}, ${firstName}`.trim())
      .set(66, 2, cl2GenderMarker(sex))
      .setRight(69, 4, cl2IndividualEventCode(event) ?? "")
      .setRight(74, 2, eventNumber != null ? String(eventNumber) : "")
      .set(77, 4, "UNOV")
      .setRight(90, 8, cl2SeedDisplay(seedTime, courseLetter));
    lines.push(cl2ChecksumLine(d0.toString()));
  }

  const cl2D3Line = new FixedLine()
    .set(1, 2, "D3")
    .set(32, 1, "X")
    .set(34, 13, "FFFFFFFFFFFFF");

  // D0 + D3: first individual entry for a swimmer, then TM's extra-athlete
  // D3 flag, then remaining D0s. Result-only names get a bare D0 later.
  const entrySwimmerKeys = new Set<string>();
  const entriesBySwimmer: Array<{
    key: string;
    name: string;
    entries: typeof meet.entries;
  }> = [];
  const swimmerGroupIndex = new Map<string, number>();
  for (const entry of meet.entries) {
    const key = entry.swimmerName.trim().toLowerCase();
    const existing = swimmerGroupIndex.get(key);
    if (existing == null) {
      swimmerGroupIndex.set(key, entriesBySwimmer.length);
      entriesBySwimmer.push({
        key,
        name: entry.swimmerName,
        entries: [entry],
      });
    } else {
      entriesBySwimmer[existing]!.entries.push(entry);
    }
  }
  for (const group of entriesBySwimmer) {
    entrySwimmerKeys.add(group.key);
    const first = group.entries[0]!;
    writeCl2EntryD0(
      group.name,
      first.eventNumber,
      first.seedTime,
      first.classYear,
      first.gender,
    );
    lines.push(cl2ChecksumLine(cl2D3Line.toString()));
    for (const entry of group.entries.slice(1)) {
      writeCl2EntryD0(
        group.name,
        entry.eventNumber,
        entry.seedTime,
        entry.classYear,
        entry.gender,
      );
    }
  }
  for (const result of meet.results) {
    const key = result.swimmerName.trim().toLowerCase();
    if (entrySwimmerKeys.has(key)) continue;
    entrySwimmerKeys.add(key);
    const identity = identityByName.get(key);
    const event =
      result.eventNumber != null
        ? eventByNumber.get(result.eventNumber)
        : undefined;
    const usa = cl2Field(identity?.usaMemberId, 14);
    const dob = cl2IdentityToken(identity?.dateOfBirth, identity?.gender);
    const eventToken = cl2EventToken(
      cl2IndividualEventCode(event),
      identity?.gender,
    );
    lines.push(
      cl2ChecksumLine(
        cl2NameLine("D0", result.swimmerName, `${usa}${dob}${eventToken}`),
      ),
    );
  }
  for (const athlete of meet.athletes ?? []) {
    const key = athlete.name.trim().toLowerCase();
    if (entrySwimmerKeys.has(key)) continue;
    entrySwimmerKeys.add(key);
    const identity = identityByName.get(key);
    const usa = cl2Field(athlete.usaMemberId ?? identity?.usaMemberId, 14);
    const dob = cl2IdentityToken(
      athlete.dateOfBirth ?? identity?.dateOfBirth,
      athlete.gender ?? identity?.gender,
    );
    lines.push(
      cl2ChecksumLine(cl2NameLine("D0", athlete.name, `${usa}${dob}`)),
    );
  }

  for (const result of meet.results) {
    const identity = identityByName.get(
      result.swimmerName.trim().toLowerCase(),
    );
    const event =
      result.eventNumber != null
        ? eventByNumber.get(result.eventNumber)
        : undefined;
    const usa = cl2Field(identity?.usaMemberId, 14);
    const eventToken = cl2EventToken(
      cl2IndividualEventCode(event),
      identity?.gender,
    );
    const timeText = result.isDq ? " DQ" : ` ${result.time}`;
    const placeText = result.place != null ? ` ${result.place}` : "";
    const heatLane =
      result.heat != null || result.lane != null
        ? ` H${String(result.heat ?? 0).padStart(2, "0")} L${String(result.lane ?? 0).padStart(2, "0")}`
        : "";
    lines.push(
      cl2ChecksumLine(
        cl2NameLine(
          "G0",
          result.swimmerName,
          `${usa}${eventToken}${timeText}${placeText}${heatLane}${cl2G0RoundSuffix(result.resultType)}`,
        ),
      ),
    );
  }

  let relayTeamCount = 0;
  let relayLegCount = 0;
  for (const relay of meet.relays ?? []) {
    const event =
      relay.eventNumber != null
        ? eventByNumber.get(relay.eventNumber)
        : undefined;
    const eventCode = cl2RelayEventCode(event);
    const genderLetter = event?.gender === "female" ? "F" : "M";
    const letter = (relay.relayLetter ?? "A").slice(0, 1).toUpperCase();
    const seed = cl2SeedDisplay(relay.seedTime, courseLetter);
    const e0 = new FixedLine()
      .set(1, 2, "E0")
      .set(3, 1, "1")
      .set(4, 2, lsc)
      .set(12, 1, letter)
      .set(13, 6, cl2Id)
      .set(21, 1, genderLetter)
      .setRight(23, 4, eventCode)
      .setRight(
        28,
        2,
        relay.eventNumber != null ? String(relay.eventNumber) : "",
      )
      .set(31, 4, "UNOV")
      .set(38, 8, startDigits)
      .set(47, 8, seed);
    lines.push(cl2ChecksumLine(e0.toString()));
    relayTeamCount += 1;
    for (const name of relay.swimmerNames) {
      const { firstName, lastName } = splitName(name);
      const identity = identityByName.get(name.trim().toLowerCase());
      const f0Gender = identity?.gender === "female" ? "F" : "M";
      const f0 = new FixedLine()
        .set(1, 2, "F0")
        .set(3, 1, "1")
        .set(4, 2, lsc)
        .setRight(
          12,
          3,
          relay.eventNumber != null ? String(relay.eventNumber) : "",
        )
        .set(16, 6, cl2Id)
        .set(22, 1, letter)
        .set(23, 40, `${lastName}, ${firstName}`.trim())
        .set(76, 1, f0Gender)
        .set(77, 3, "000");
      lines.push(cl2ChecksumLine(f0.toString()));
      relayLegCount += 1;
    }
  }

  const individualCount = meet.entries.length;
  const athleteCount = entriesBySwimmer.length;
  const now = new Date();
  const buildDate = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}`;
  const z0 = new FixedLine()
    .set(1, 3, "Z01")
    .set(12, 2, "02")
    .set(
      14,
      80,
      `Successful Build on ${buildDate}  1  1   1   1${String(individualCount).padStart(6)}${String(athleteCount).padStart(6)}${String(relayTeamCount).padStart(5)}${String(relayLegCount).padStart(6)}${String(0).padStart(6)}`,
    );
  lines.push(cl2ChecksumLine(z0.toString()));

  return lines.join("\r\n");
}

/**
 * Minimal Hy-Tek EV3 event-template export (meet header + event lines),
 * readable by `../ev3/parser.ts`'s `parseEv3`.
 */
export function exportEv3(meet: ParsedMeet): string {
  const courseHint =
    meet.course === "LCM" ? "L" : meet.course === "SCM" ? "M" : "Y";
  const header = Array<string>(30).fill("");
  header[0] = meet.name;
  header[1] = meet.location ?? "";
  header[2] = meet.startDate
    ? `${meet.startDate.slice(5, 7)}/${meet.startDate.slice(8, 10)}/${meet.startDate.slice(0, 4)}`
    : "";
  header[3] = meet.endDate
    ? `${meet.endDate.slice(5, 7)}/${meet.endDate.slice(8, 10)}/${meet.endDate.slice(0, 4)}`
    : "";
  header[5] = courseHint;
  header[18] =
    meet.entryLimits?.maxCombinedEntries != null
      ? String(meet.entryLimits.maxCombinedEntries)
      : "";
  header[19] =
    meet.entryLimits?.maxIndividualEntries != null
      ? String(meet.entryLimits.maxIndividualEntries)
      : "";
  header[20] =
    meet.entryLimits?.maxRelayEntries != null
      ? String(meet.entryLimits.maxRelayEntries)
      : "";
  header[23] = meet.entryDeadline
    ? `${meet.entryDeadline.slice(5, 7)}/${meet.entryDeadline.slice(8, 10)}/${meet.entryDeadline.slice(0, 4)}`
    : "";

  const lines = [header.join(";")];

  const STROKE_DIGIT: Record<string, string> = {
    free: "1",
    back: "2",
    breast: "3",
    fly: "4",
    im: "5",
  };

  for (const event of meet.events) {
    const isRelay =
      event.stroke === "free_relay" || event.stroke === "medley_relay";
    const genderCode =
      event.gender === "female" ? "G" : event.gender === "mixed" ? "X" : "B";
    const { min: ageLow, max: ageHigh } = ageRangeFromGroup(event.ageGroup);
    // EV3's own mapStroke has no relay-specific digits: it derives relay type
    // from the *base* stroke digit (5/im → medley_relay, anything else → free_relay).
    const strokeDigit =
      event.eventKind === "dive"
        ? "F"
        : isRelay
          ? event.stroke === "medley_relay"
            ? "5"
            : "1"
          : (STROKE_DIGIT[event.stroke] ?? "1");
    const parts = Array<string>(21).fill("");
    parts[0] = String(event.eventNumber ?? 0);
    parts[1] = String(event.eventNumber ?? 0);
    parts[2] = "F";
    parts[3] = "1";
    parts[4] = isRelay ? "R" : "I";
    parts[5] = genderCode;
    parts[6] = String(ageLow);
    parts[7] = String(ageHigh);
    parts[8] = event.eventKind === "dive" ? "0" : String(event.distance);
    parts[9] = strokeDigit;
    parts[10] = event.eventKind === "dive" ? String(event.diveCount ?? 0) : "0";
    if (event.qualifyingTimeMs != null) {
      parts[19] = (event.qualifyingTimeMs / 1000).toFixed(2);
    }
    lines.push(parts.join(";"));
  }

  return lines.join("\r\n");
}

const HYV_STROKE_DIGIT: Record<string, string> = {
  free: "1",
  back: "2",
  breast: "3",
  fly: "4",
  im: "5",
};

function hyvGenderCode(gender: ParsedEvent["gender"]): string {
  if (gender === "female") return "F";
  if (gender === "male") return "M";
  return "M";
}

function hyvRoundCode(roundType: ParsedEvent["roundType"] | undefined): string {
  if (roundType === "prelim") return "P";
  if (roundType === "swimoff") return "S";
  if (roundType === "time_trial") return "X";
  return "F";
}

/**
 * Minimal Hy-Tek HYV event/qualifying-time export (meet header + event lines),
 * readable by `../ev3/parser.ts`'s `parseHyv`.
 */
export function exportHyv(meet: ParsedMeet): string {
  const courseHint =
    meet.course === "LCM" ? "L" : meet.course === "SCM" ? "M" : "Y";
  const header = [
    meet.name,
    toMmDdYyyySlash(meet.startDate),
    toMmDdYyyySlash(meet.endDate),
    "",
    courseHint,
    meet.location ?? "",
  ];
  const lines = [header.join(";")];

  for (const event of meet.events) {
    const isRelay =
      event.stroke === "free_relay" || event.stroke === "medley_relay";
    const { min: ageLow, max: ageHigh } = ageRangeFromGroup(event.ageGroup);
    const parts = Array<string>(10).fill("");
    parts[0] = String(event.eventNumber ?? 0);
    parts[1] = hyvRoundCode(event.roundType);
    parts[2] = hyvGenderCode(event.gender);
    parts[3] = isRelay ? "R" : "I";
    parts[4] = String(ageLow);
    parts[5] = String(ageHigh);
    if (event.eventKind === "dive") {
      parts[6] = String(event.diveCount ?? 0);
      parts[7] = "6";
    } else {
      parts[6] = String(event.distance);
      parts[7] = isRelay
        ? event.stroke === "medley_relay"
          ? "5"
          : "1"
        : (HYV_STROKE_DIGIT[event.stroke] ?? "1");
    }
    if (event.qualifyingTimeMs != null) {
      parts[8] = (event.qualifyingTimeMs / 1000).toFixed(2);
    }
    lines.push(parts.join(";"));
  }

  return lines.join("\r\n");
}

/** Filename-safe slug from a meet name, falling back to "meet". */
function meetFileSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "meet";
}

/** TM-style pack stem: `MARI-AZ-Entries-2026 Croswhite Invite-12Sep2026-001`. */
export function meetEntryPackBaseName(meet: ParsedMeet): string {
  const prefix = teamFilePrefix(meet.teamCode, meet.lscCode);
  const date = toDdMmmYyyy(meet.startDate);
  const meetName = meet.name
    .replace(/[/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stem = `${prefix}-Entries-${meetName || "Meet"}`;
  return date ? `${stem}-${date}-001` : `${stem}-001`;
}

/** Browser download name for a zip pack (entries use the TM folder stem). */
export function meetZipDownloadFilename(
  meet: ParsedMeet,
  kind: "entries" | "results" | "events",
): string {
  if (kind === "entries") return `${meetEntryPackBaseName(meet)}.zip`;
  return `${meetFileSlug(meet.name)}_${kind}.zip`;
}

/**
 * Export a meet as a ZIP pack combining the Hy-Tek formats a coach would get
 * from Meet Manager / Team Manager: HY3 (Team Manager) + CL2 (SDIF-style)
 * for entries/results, or an EV3 event template for the "events" kind.
 */
export function exportMeetZip(
  meet: ParsedMeet,
  kind: "entries" | "results" | "events",
): Uint8Array {
  const stem =
    kind === "entries" ? meetEntryPackBaseName(meet) : meetFileSlug(meet.name);
  const dir = kind === "entries" ? `${stem}/` : "";
  const files: Record<string, Uint8Array> = {};

  if (kind === "events") {
    files[`${dir}${stem}.ev3`] = strToU8(exportEv3(meet));
    files[`${dir}${stem}.hyv`] = strToU8(exportHyv(meet));
  }
  files[`${dir}${stem}.HY3`] = strToU8(exportHy3(meet));
  files[`${dir}${stem}.CL2`] = strToU8(exportCl2(meet));

  return zipSync(files, { level: 6 });
}
