import { normalizeMeetEndDate } from "@lane4hq/swim-core/calendar-date";
import {
  buildEventKey,
  type Course,
  parseEventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { parseLastFirstName, parseSdifBirthDate } from "../roster/utils";
import type {
  ParsedAthlete,
  ParsedEvent,
  ParsedMeet,
  ParsedRelayEntry,
} from "../types";

/**
 * USA Swimming SDIF v3 (.sd3), 160 data columns. SwimTopia and TeamUnify
 * write this layout. `exportUssSdif` writes it. `exportSdif` does not.
 *
 * Column numbers are 1-based, from the April 28, 1998 SDIF version 3 spec.
 */

const STROKES: Record<string, Stroke | RelayStroke> = {
  "1": "free",
  "2": "back",
  "3": "breast",
  "4": "fly",
  "5": "im",
  "6": "free_relay",
  "7": "medley_relay",
};

function field(line: string, start: number, length: number): string {
  return line.slice(start - 1, start - 1 + length).trim();
}

function courseFrom(letter: string, fallback: Course): Course {
  if (letter === "L") return "LCM";
  if (letter === "S") return "SCM";
  if (letter === "Y") return "SCY";
  return fallback;
}

function ussStroke(code: string, relay: boolean): Stroke | RelayStroke {
  return STROKES[code] ?? (relay ? "free_relay" : "free");
}

/** SDIF v3 individual rows put "Last, First" at cols 12–39 and DOB at 56–63. */
export function isUssSdifV3(content: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("D0") || line.length < 63) continue;
    if (!/^\d$/.test(line.charAt(2))) continue;
    if (!/^\d{8}$/.test(line.slice(55, 63))) continue;
    if (line.slice(11, 39).includes(",")) return true;
  }
  return false;
}

function ussTime(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || /^[A-Z]+$/i.test(value)) return undefined;
  return value;
}

/** SD3 event number is 4 characters. SwimTopia appends the multi-age letter (`42A`). */
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

function ageSpan(raw: string): { min?: number; max?: number } {
  if (/^\d{4}$/.test(raw)) {
    return {
      min: Number.parseInt(raw.slice(0, 2), 10),
      max: Number.parseInt(raw.slice(2), 10),
    };
  }
  const under = /^UN(\d{2})$/.exec(raw);
  if (under) {
    return { min: 0, max: Number.parseInt(under[1]!, 10) };
  }
  return {};
}

function ageGroup(span: { min?: number; max?: number }): string | undefined {
  if (span.min == null || span.max == null) return undefined;
  return `${span.min}-${span.max}`;
}

function displayName(raw: string, preferred?: string): string {
  const parsed = parseLastFirstName(raw);
  const first = preferred || parsed.firstName;
  return `${first} ${parsed.lastName}`.trim();
}

function athleteGender(code: string): "male" | "female" | undefined {
  if (code === "F") return "female";
  if (code === "M") return "male";
  return undefined;
}

function meetLocation(city: string, state: string): string | undefined {
  if (city && state) return `${city}, ${state}`;
  return city || state || undefined;
}

function legOrder(code: string): number {
  const digit = Number.parseInt(code.trim().charAt(0), 10);
  return Number.isFinite(digit) && digit > 0 ? digit : 99;
}

type SwimmerExtra = { preferred?: string; usaMemberId?: string };

type RelayLeg = {
  name: string;
  order: number;
  dateOfBirth?: string;
  gender?: "male" | "female";
};

function identityKey(name: string, dateOfBirth = ""): string {
  const last = name.trim().split(/\s+/).pop()!.toLowerCase();
  return `${last}|${dateOfBirth}`;
}

function legalFromKey(key: string): string {
  return key.slice(0, key.lastIndexOf("|"));
}

/** Parse a SwimTopia / TeamUnify SDIF v3 meet entry or result file. */
export function parseUssSdif(content: string): ParsedMeet {
  const meet: ParsedMeet = {
    name: "Imported Meet",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
  };
  const events = new Map<string, ParsedEvent>();
  const relays: ParsedRelayEntry[] = [];
  const relayLegs: RelayLeg[][] = [];
  const extras = new Map<string, SwimmerExtra>();
  const entryKeys: string[] = [];
  let lastEntryKey: string | undefined;
  let openRelay = false;

  function applyExtra(key: string, extra: SwimmerExtra): void {
    extras.set(key, extra);
    for (let i = 0; i < entryKeys.length; i++) {
      if (entryKeys[i] !== key) continue;
      const entry = meet.entries[i]!;
      if (extra.usaMemberId) entry.usaMemberId = extra.usaMemberId;
      if (extra.preferred) {
        entry.swimmerName = displayName(legalFromKey(key), extra.preferred);
      }
    }
  }

  function addEvent(
    eventKey: string,
    event: ParsedEvent,
    distance: number,
    eventNumber: number | undefined,
  ): void {
    if (events.has(eventKey)) return;
    if (distance <= 0 && eventNumber == null) return;
    events.set(eventKey, event);
  }

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = line.slice(0, 2);

    if (record === "A0") {
      const fileCode = field(line, 12, 2);
      if (fileCode === "01") meet.importKind = "entries";
      else if (fileCode === "02") meet.importKind = "results";
      continue;
    }

    if (record === "B1") {
      const name = field(line, 12, 30);
      if (name) meet.name = name;
      const location = meetLocation(field(line, 86, 20), field(line, 106, 2));
      if (location) meet.location = location;
      const start = parseSdifBirthDate(field(line, 122, 8));
      if (start) meet.startDate = start;
      const end = parseSdifBirthDate(field(line, 130, 8));
      meet.endDate = normalizeMeetEndDate(meet.startDate, end);
      meet.course = courseFrom(field(line, 150, 1), meet.course);
      continue;
    }

    if (record === "C1") {
      const teamCode = field(line, 12, 6);
      if (teamCode) meet.teamCode = teamCode;
      const teamName = field(line, 18, 30);
      if (teamName) meet.teamName = teamName;
      const shortName = field(line, 48, 16);
      if (shortName) meet.teamShortName = shortName;
      const address1 = field(line, 64, 22);
      if (address1) meet.teamAddressLine1 = address1;
      const address2 = field(line, 86, 22);
      if (address2) meet.teamAddressLine2 = address2;
      const city = field(line, 108, 20);
      if (city) meet.teamCity = city;
      const region = field(line, 128, 2);
      if (region) meet.teamRegion = region;
      const postal = field(line, 130, 10);
      if (postal) meet.teamPostalCode = postal;
      const country = field(line, 140, 3);
      if (country) meet.teamCountry = country;
      continue;
    }

    if (record === "D3") {
      if (!lastEntryKey) continue;
      const usaMemberId = field(line, 3, 14) || undefined;
      const preferred = field(line, 17, 15) || undefined;
      if (!usaMemberId && !preferred) continue;
      const previous = extras.get(lastEntryKey) ?? {};
      applyExtra(lastEntryKey, {
        preferred: preferred ?? previous.preferred,
        usaMemberId: usaMemberId ?? previous.usaMemberId,
      });
      continue;
    }

    if (record === "D0") {
      openRelay = false;
      const legal = field(line, 12, 28);
      const dateOfBirth = parseSdifBirthDate(field(line, 56, 8));
      const key = `${legal}|${dateOfBirth ?? ""}`;
      lastEntryKey = key;
      const extra = extras.get(key);
      const gender = athleteGender(field(line, 66, 1));
      const eventGender = parseEventGender(field(line, 67, 1));
      const distance = Number.parseInt(field(line, 68, 4), 10) || 0;
      const stroke = ussStroke(field(line, 72, 1), false);
      const token = splitEventToken(field(line, 73, 4));
      const eventNumber = token.eventNumber;
      const span = ageSpan(field(line, 77, 4));
      const seedCourse = courseFrom(field(line, 97, 1), meet.course);
      const usaMemberId =
        extra?.usaMemberId || field(line, 40, 12) || undefined;
      meet.entries.push({
        eventNumber,
        swimmerName: displayName(legal, extra?.preferred),
        seedTime: ussTime(field(line, 89, 8)),
        usaMemberId,
        dateOfBirth,
        gender,
        seedCourse,
        eventSuffix: token.eventSuffix,
      });
      entryKeys.push(key);
      addEvent(
        [
          eventNumber ?? "",
          token.eventSuffix ?? "",
          distance,
          stroke,
          eventGender,
          ageGroup(span) ?? "",
        ].join("|"),
        {
          eventNumber,
          distance,
          stroke,
          gender: eventGender,
          ageGroup: ageGroup(span),
          eventKey: buildEventKey(distance, stroke, seedCourse, eventGender),
          eventSuffix: token.eventSuffix,
        },
        distance,
        eventNumber,
      );
      continue;
    }

    if (record === "E0") {
      openRelay = true;
      const span = ageSpan(field(line, 31, 4));
      const stroke = ussStroke(field(line, 26, 1), true);
      const distance = Number.parseInt(field(line, 22, 4), 10) || 0;
      const eventGender = parseEventGender(field(line, 21, 1));
      const token = splitEventToken(field(line, 27, 4));
      const eventNumber = token.eventNumber;
      const seedCourse = courseFrom(field(line, 54, 1), meet.course);
      relays.push({
        eventNumber,
        swimmerNames: [],
        seedTime: ussTime(field(line, 46, 8)),
        seedCourse,
        teamCode: field(line, 13, 6) || meet.teamCode,
        relayLetter: field(line, 12, 1) || undefined,
        eventSuffix: token.eventSuffix,
      });
      relayLegs.push([]);
      addEvent(
        [
          "R",
          eventNumber ?? "",
          token.eventSuffix ?? "",
          distance,
          stroke,
          eventGender,
          ageGroup(span) ?? "",
        ].join("|"),
        {
          eventNumber,
          distance,
          stroke,
          gender: eventGender,
          ageGroup: ageGroup(span),
          eventKey: buildEventKey(distance, stroke, seedCourse, eventGender),
          eventSuffix: token.eventSuffix,
        },
        distance,
        eventNumber,
      );
      continue;
    }

    if (record === "F0") {
      if (!openRelay) continue;
      const bucket = relayLegs[relayLegs.length - 1]!;
      const legal = field(line, 23, 28);
      if (!legal) continue;
      bucket.push({
        name: displayName(legal),
        order: legOrder(field(line, 77, 3)),
        dateOfBirth: parseSdifBirthDate(field(line, 66, 8)),
        gender: athleteGender(field(line, 76, 1)),
      });
    }
  }

  const athletes = new Map<string, ParsedAthlete>();
  for (const entry of meet.entries) {
    const key = identityKey(entry.swimmerName, entry.dateOfBirth);
    if (athletes.has(key)) continue;
    athletes.set(key, {
      name: entry.swimmerName,
      dateOfBirth: entry.dateOfBirth,
      gender: entry.gender,
      usaMemberId: entry.usaMemberId,
      relayOnly: false,
    });
  }

  for (let i = 0; i < relays.length; i++) {
    const relay = relays[i]!;
    const bucket = relayLegs[i]!;
    bucket.sort((a, b) => a.order - b.order);
    relay.swimmerNames = bucket.map((leg) => leg.name);
    for (const leg of bucket) {
      const key = identityKey(leg.name, leg.dateOfBirth);
      if (athletes.has(key)) continue;
      athletes.set(key, {
        name: leg.name,
        dateOfBirth: leg.dateOfBirth,
        gender: leg.gender,
        relayOnly: true,
      });
    }
  }

  meet.events = [...events.values()];
  if (relays.length > 0) meet.relays = relays;
  if (athletes.size > 0) meet.athletes = [...athletes.values()];
  return meet;
}
