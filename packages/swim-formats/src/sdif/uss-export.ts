import { formatTime, parseTime } from "@lane4hq/swim-core/times";
import { hy3FileDate } from "../export/meet";
import type { ParsedMeet, ParsedRelayEntry } from "../types";

/**
 * USA Swimming SDIF v3 meet entries (.sd3), the layout SwimTopia and
 * TeamUnify write and Meet Manager imports. 160 data columns, CRLF, no
 * checksum. Lane4's older `exportSdif` stays the loose non-USS layout.
 *
 * Branding replaces SwimTopia's vendor, contact, and phone. The org code
 * stays `1` (USS) because that is the file type, not the product name.
 */

const ORG = "1";
const SOFTWARE = "Lane4 HQ";
const VERSION = "1.0";

class SdifLine {
  private chars = Array.from({ length: 160 }, () => " ");

  set(
    start: number,
    length: number,
    value: string | number | undefined | null,
  ): this {
    const text = value == null ? "" : String(value).slice(0, length);
    for (let i = 0; i < text.length; i++) this.chars[start - 1 + i] = text[i]!;
    return this;
  }

  setRight(start: number, length: number, value: string | number): this {
    return this.set(
      start,
      length,
      String(value).slice(0, length).padStart(length, " "),
    );
  }

  toString(): string {
    return this.chars.join("");
  }
}

function mmddyyyy(date: string | undefined): string {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[2]}${match[3]}${match[1]}`;
}

function courseLetter(course: ParsedMeet["course"] | undefined): string {
  if (course === "LCM") return "L";
  if (course === "SCM") return "S";
  return "Y";
}

/** EVENT AGE Code 025: `1111`, `UN06`, `15OV`. */
export function ussAgeCode(ageGroup?: string): string {
  if (!ageGroup) return "UNOV";
  const over = /^(\d+)&O$/i.exec(ageGroup);
  if (over) return `${over[1]!.padStart(2, "0").slice(-2)}OV`;
  const under = /^(\d+)&U$/i.exec(ageGroup);
  if (under) return `UN${under[1]!.padStart(2, "0").slice(-2)}`;
  const range = /^(\d+)-(\d+)$/.exec(ageGroup);
  if (!range) return "UNOV";
  const max = range[2]!.padStart(2, "0").slice(-2);
  if (range[1] === "0") return `UN${max}`;
  return `${range[1]!.padStart(2, "0").slice(-2)}${max}`;
}

function eventToken(eventNumber?: number, eventSuffix?: string): string {
  const letter = eventSuffix ? eventSuffix.slice(0, 1).toUpperCase() : " ";
  if (eventNumber == null) return `${" ".repeat(3)}${letter}`;
  return `${String(eventNumber).slice(0, 3).padStart(3, " ")}${letter}`;
}

function strokeDigit(stroke: string | undefined, relay: boolean): string {
  if (relay) return stroke === "medley_relay" ? "7" : "6";
  if (stroke === "back") return "2";
  if (stroke === "breast") return "3";
  if (stroke === "fly") return "4";
  if (stroke === "im") return "5";
  return "1";
}

function eventSex(gender: string | undefined): string {
  if (gender === "female") return "F";
  if (gender === "mixed") return "X";
  return "M";
}

function athleteSex(gender: "male" | "female" | undefined): string {
  return gender === "female" ? "F" : "M";
}

function ussTime(time: string | undefined): string {
  if (!time) return "";
  const ms = parseTime(time);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return formatTime(ms);
}

function center(value: string, width: number): string {
  const text = value.trim().toUpperCase().slice(0, width);
  const pad = width - text.length;
  const left = Math.floor(pad / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(pad - left)}`;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function commaName(input: {
  name: string;
  legalFirstName?: string;
  middleInitial?: string;
}): string {
  const { firstName, lastName } = splitName(input.name);
  const first = input.legalFirstName?.trim() || firstName;
  const middle = input.middleInitial?.trim().slice(0, 1);
  const given = middle ? `${first} ${middle}` : first;
  return `${lastName}, ${given}`.slice(0, 28);
}

function ageYears(
  dateOfBirth: string | undefined,
  onDate: string | undefined,
): number | undefined {
  const dob = dateOfBirth?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dob) return undefined;
  const on = onDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const year = on ? Number(on[1]) : new Date().getUTCFullYear();
  const month = on ? Number(on[2]) : 12;
  const day = on ? Number(on[3]) : 31;
  let age = year - Number(dob[1]);
  if (
    month < Number(dob[2]) ||
    (month === Number(dob[2]) && day < Number(dob[3]))
  ) {
    age -= 1;
  }
  return Math.max(age, 0);
}

function cityState(location: string | undefined): {
  city: string;
  state: string;
} {
  const match = location?.trim().match(/^(.*),\s*([A-Za-z]{2})$/);
  if (!match) return { city: "", state: "" };
  return { city: match[1]!.trim(), state: match[2]!.toUpperCase() };
}

function fileCode(meet: ParsedMeet): "01" | "02" {
  if (meet.importKind === "results") return "02";
  const relays = meet.relays?.length ?? 0;
  if (
    meet.importKind == null &&
    meet.entries.length === 0 &&
    relays === 0 &&
    meet.results.length > 0
  ) {
    return "02";
  }
  return "01";
}

type Splash = {
  eventNumber?: number;
  eventSuffix?: string;
  distance: number;
  stroke: string;
  gender?: string;
  ageGroup?: string;
  seedTime?: string;
  seedCourse?: ParsedMeet["course"];
};

type Swimmer = {
  name: string;
  legalFirstName?: string;
  preferredName?: string;
  middleInitial?: string;
  usaMemberId?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
  splashes: Splash[];
};

function swimmerKey(name: string, dateOfBirth?: string): string {
  return `${name.trim().toLowerCase()}|${dateOfBirth ?? ""}`;
}

function remember(
  swimmers: Map<string, Swimmer>,
  seed: Omit<Swimmer, "splashes"> & { splash?: Splash },
): Swimmer {
  const key = swimmerKey(seed.name, seed.dateOfBirth);
  const existing = swimmers.get(key);
  if (existing) {
    existing.legalFirstName ??= seed.legalFirstName;
    existing.preferredName ??= seed.preferredName;
    existing.middleInitial ??= seed.middleInitial;
    existing.usaMemberId ??= seed.usaMemberId;
    existing.gender ??= seed.gender;
    if (seed.splash) existing.splashes.push(seed.splash);
    return existing;
  }
  const created: Swimmer = {
    name: seed.name,
    legalFirstName: seed.legalFirstName,
    preferredName: seed.preferredName,
    middleInitial: seed.middleInitial,
    usaMemberId: seed.usaMemberId,
    dateOfBirth: seed.dateOfBirth,
    gender: seed.gender,
    splashes: seed.splash ? [seed.splash] : [],
  };
  swimmers.set(key, created);
  return created;
}

function eventMeta(
  meet: ParsedMeet,
  eventNumber?: number,
  eventSuffix?: string,
): { distance: number; stroke: string; gender?: string; ageGroup?: string } {
  const event = meet.events.find(
    (row) =>
      row.eventNumber === eventNumber &&
      (row.eventSuffix ?? "").toUpperCase() ===
        (eventSuffix ?? "").toUpperCase(),
  );
  return {
    distance: event?.distance ?? 0,
    stroke: event?.stroke ?? "free",
    gender: event?.gender,
    ageGroup: event?.ageGroup,
  };
}

/** SwimTopia-shaped USS SDIF v3 text with Lane4 HQ in the A0 vendor fields. */
export function exportUssSdif(meet: ParsedMeet): string {
  const code = fileCode(meet);
  const teamCode = (meet.teamCode?.trim() || "TEAM").toUpperCase();
  const start = mmddyyyy(meet.startDate);
  const end = mmddyyyy(meet.endDate) || start;
  const place = cityState(meet.location);
  const lines: string[] = [];

  lines.push(
    new SdifLine()
      .set(1, 2, "A0")
      .set(3, 1, ORG)
      .set(4, 8, "V3")
      .set(12, 2, code)
      .set(44, 20, SOFTWARE)
      .set(64, 10, VERSION)
      .set(74, 20, SOFTWARE)
      .set(106, 8, hy3FileDate())
      .toString(),
  );

  lines.push(
    new SdifLine()
      .set(1, 2, "B1")
      .set(3, 1, ORG)
      .set(12, 30, meet.name)
      .set(86, 20, place.city)
      .set(106, 2, place.state)
      .set(118, 3, "USA")
      .set(121, 1, "9")
      .set(122, 8, start)
      .set(130, 8, end)
      .set(150, 1, courseLetter(meet.course))
      .toString(),
  );

  lines.push(
    new SdifLine()
      .set(1, 2, "C1")
      .set(3, 1, ORG)
      .set(12, 6, center(teamCode, 6))
      .set(18, 30, meet.teamName)
      .set(48, 16, meet.teamShortName || teamCode)
      .set(64, 22, meet.teamAddressLine1)
      .set(86, 22, meet.teamAddressLine2)
      .set(108, 20, meet.teamCity)
      .set(128, 2, meet.teamRegion)
      .set(130, 10, meet.teamPostalCode)
      .set(140, 3, meet.teamCountry || "USA")
      .toString(),
  );

  const swimmers = new Map<string, Swimmer>();
  const source =
    meet.entries.length > 0
      ? meet.entries.map((entry) => ({
          name: entry.swimmerName,
          legalFirstName: entry.legalFirstName,
          preferredName: entry.preferredName,
          middleInitial: entry.middleInitial,
          usaMemberId: entry.usaMemberId,
          dateOfBirth: entry.dateOfBirth,
          gender: entry.gender,
          eventNumber: entry.eventNumber,
          eventSuffix: entry.eventSuffix,
          seedTime: entry.seedTime,
          seedCourse: entry.seedCourse,
        }))
      : meet.results.map((result) => ({
          name: result.swimmerName,
          usaMemberId: result.usaMemberId,
          dateOfBirth: result.dateOfBirth,
          gender: result.gender,
          eventNumber: result.eventNumber,
          eventSuffix: result.eventSuffix,
          seedTime: result.time,
          seedCourse: meet.course,
        }));

  for (const row of source) {
    const meta = eventMeta(meet, row.eventNumber, row.eventSuffix);
    remember(swimmers, {
      name: row.name,
      legalFirstName: "legalFirstName" in row ? row.legalFirstName : undefined,
      preferredName: "preferredName" in row ? row.preferredName : undefined,
      middleInitial: "middleInitial" in row ? row.middleInitial : undefined,
      usaMemberId: row.usaMemberId,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      splash: {
        eventNumber: row.eventNumber,
        eventSuffix: row.eventSuffix,
        distance: meta.distance,
        stroke: meta.stroke,
        gender: meta.gender,
        ageGroup: meta.ageGroup,
        seedTime: row.seedTime,
        seedCourse: row.seedCourse,
      },
    });
  }

  for (const athlete of meet.athletes ?? []) {
    const name = athlete.name.trim();
    if (!name) continue;
    const match = [...swimmers.values()].find(
      (row) => row.name.trim().toLowerCase() === name.toLowerCase(),
    );
    remember(swimmers, {
      name: match?.name ?? athlete.name,
      dateOfBirth: match?.dateOfBirth ?? athlete.dateOfBirth,
      legalFirstName: athlete.legalFirstName,
      preferredName: athlete.preferredName,
      middleInitial: athlete.middleInitial,
      usaMemberId: athlete.usaMemberId,
      gender: athlete.gender,
    });
  }

  let d0Count = 0;
  let d3Count = 0;
  for (const swimmer of swimmers.values()) {
    swimmer.splashes.forEach((splash, index) => {
      const seed = ussTime(splash.seedTime);
      const course = courseLetter(splash.seedCourse ?? meet.course);
      const age = ageYears(
        swimmer.dateOfBirth,
        meet.ageUpDate ?? meet.startDate,
      );
      const d0 = new SdifLine()
        .set(1, 2, "D0")
        .set(3, 1, ORG)
        .set(12, 28, commaName(swimmer))
        .set(40, 12, swimmer.usaMemberId)
        .set(56, 8, mmddyyyy(swimmer.dateOfBirth))
        .setRight(64, 2, age == null ? "" : age)
        .set(66, 1, athleteSex(swimmer.gender))
        .set(67, 1, eventSex(splash.gender))
        .setRight(68, 4, splash.distance)
        .set(72, 1, strokeDigit(splash.stroke, false))
        .set(73, 4, eventToken(splash.eventNumber, splash.eventSuffix))
        .set(77, 4, ussAgeCode(splash.ageGroup))
        .set(81, 8, start)
        .setRight(89, 8, seed)
        .set(97, 1, seed ? course : "");
      if (code === "02" && seed) {
        d0.setRight(116, 8, seed).set(124, 1, course);
      }
      lines.push(d0.toString());
      d0Count += 1;
      if (index === 0) {
        lines.push(
          new SdifLine()
            .set(1, 2, "D3")
            .set(3, 14, swimmer.usaMemberId)
            .set(17, 15, swimmer.preferredName)
            .toString(),
        );
        d3Count += 1;
      }
    });
  }

  const byName = new Map<string, Swimmer>();
  for (const swimmer of swimmers.values()) {
    const key = swimmer.name.trim().toLowerCase();
    if (key) byName.set(key, swimmer);
  }

  let f0Count = 0;
  for (const relay of meet.relays ?? []) {
    const meta = eventMeta(meet, relay.eventNumber, relay.eventSuffix);
    const names = relay.swimmerNames;
    const seed = ussTime(relay.seedTime);
    const course = courseLetter(relay.seedCourse ?? meet.course);
    lines.push(
      relayLine(meet, relay, meta, names, seed, course, teamCode, start),
    );
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      const swimmer = byName.get(name.trim().toLowerCase());
      const leg = String(Math.min(i + 1, 9));
      const order = `${leg}${leg}${leg}`;
      lines.push(
        new SdifLine()
          .set(1, 2, "F0")
          .set(3, 1, ORG)
          .set(16, 6, center(relay.teamCode?.trim() || teamCode, 6))
          .set(22, 1, relay.relayLetter || "A")
          .set(
            23,
            28,
            commaName({
              name,
              legalFirstName: swimmer?.legalFirstName,
              middleInitial: swimmer?.middleInitial,
            }),
          )
          .set(51, 12, swimmer?.usaMemberId)
          .set(66, 8, mmddyyyy(swimmer?.dateOfBirth))
          .setRight(
            74,
            2,
            ageYears(swimmer?.dateOfBirth, meet.ageUpDate ?? meet.startDate) ??
              "",
          )
          .set(76, 1, athleteSex(swimmer?.gender))
          .set(77, 3, order)
          .toString(),
      );
      f0Count += 1;
    }
  }

  const relayCount = meet.relays?.length ?? 0;
  const swimmerNames = new Set<string>();
  for (const swimmer of swimmers.values()) {
    const key = swimmer.name.trim().toLowerCase();
    if (key) swimmerNames.add(key);
  }
  for (const relay of meet.relays ?? []) {
    for (const name of relay.swimmerNames) {
      const key = name.trim().toLowerCase();
      if (key) swimmerNames.add(key);
    }
  }
  lines.push(
    new SdifLine()
      .set(1, 2, "Z0")
      .set(3, 1, ORG)
      .set(12, 2, code)
      .setRight(44, 3, 1)
      .setRight(47, 3, 1)
      .setRight(50, 4, 1)
      .setRight(54, 4, 1)
      .setRight(58, 6, d0Count + d3Count)
      .setRight(64, 6, swimmerNames.size)
      .setRight(70, 5, relayCount)
      .setRight(75, 6, f0Count)
      .setRight(81, 6, 0)
      .toString(),
  );

  return `${lines.join("\r\n")}\r\n`;
}

function relayLine(
  meet: ParsedMeet,
  relay: ParsedRelayEntry,
  meta: {
    distance: number;
    stroke: string;
    gender?: string;
    ageGroup?: string;
  },
  names: string[],
  seed: string,
  course: string,
  teamCode: string,
  start: string,
): string {
  const ages = names.map((name) => {
    const key = name.trim().toLowerCase();
    const athlete = (meet.athletes ?? []).find(
      (row) => row.name.trim().toLowerCase() === key,
    );
    const entry = meet.entries.find(
      (row) => row.swimmerName.trim().toLowerCase() === key,
    );
    return ageYears(
      athlete?.dateOfBirth ?? entry?.dateOfBirth,
      meet.ageUpDate ?? meet.startDate,
    );
  });
  let total = "";
  if (names.length > 0) {
    let sum = 0;
    let complete = true;
    for (const age of ages) {
      if (age == null) {
        complete = false;
        break;
      }
      sum += age;
    }
    if (complete) total = String(sum);
  }
  return new SdifLine()
    .set(1, 2, "E0")
    .set(3, 1, ORG)
    .set(12, 1, relay.relayLetter || "A")
    .set(13, 6, center(relay.teamCode?.trim() || teamCode, 6))
    .setRight(19, 2, names.length)
    .set(21, 1, eventSex(meta.gender))
    .setRight(22, 4, meta.distance || 200)
    .set(26, 1, strokeDigit(meta.stroke, true))
    .set(27, 4, eventToken(relay.eventNumber, relay.eventSuffix))
    .set(31, 4, ussAgeCode(meta.ageGroup))
    .setRight(35, 3, total)
    .set(38, 8, start)
    .setRight(46, 8, seed)
    .set(54, 1, seed ? course : "")
    .toString();
}
