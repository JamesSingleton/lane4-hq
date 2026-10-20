import { parseCl2D3Fields } from "../cl2/d3";
import type { ParsedRosterRow } from "../types";
import {
  estimateDobFromClassYear,
  extractSeasonYear,
  genderFromEventCode,
  mergeSwimmer,
  parseAusaBirthDate,
  parseGenderCode,
  parseLastFirstName,
  parseSdifBirthDate,
  parseUsaMemberIdFromLine,
  swimmerKey,
} from "./utils";

function parseCl2D01Line(
  line: string,
  seasonYear: number,
): (Partial<ParsedRosterRow> & { firstName: string; lastName: string }) | null {
  // Caller only invokes for D01 lines.
  const withClass = line.match(
    /^D01[A-Z0-9]{2}\s+(FR|SO|JR|SR)\s+([^,]+),\s*(.+?)(?:\s{2,})/i,
  );
  if (withClass) {
    const classYear = withClass[1]!;
    const lastName = withClass[2]!.trim();
    const firstPart = withClass[3]!;
    const firstName = firstPart
      .trim()
      .split(/\s{2,}/)[0]!
      .trim();
    const eventGender =
      line.match(/(FF|MM)\s+\d/) ?? line.match(/\d{2}(FF|MM)\s/);
    const rosterGender = line.match(/\s0\s+([MF])\s/);
    const genderCode = eventGender?.[1] ?? rosterGender?.[1];
    const gender = genderCode
      ? eventGender
        ? genderFromEventCode(eventGender[1]!)
        : parseGenderCode(genderCode)
      : undefined;

    if (!gender) return null;

    const dateOfBirth =
      parseAusaBirthDate(line) ??
      estimateDobFromClassYear(classYear!, seasonYear);

    return {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      classYear,
      usaMemberId: parseUsaMemberIdFromLine(line),
    };
  }

  const results = line.match(/^D01[A-Z0-9]{2}\s+([^,]+),\s*(.+?)\s{2,}/i);
  if (!results) return null;

  const parsedName = parseLastFirstName(
    `${results[1]}, ${results[2]!.trim().split(/\s{2,}/)[0]}`,
  );
  const eventGender =
    line.match(/(FF|MM)\s+\d/) ?? line.match(/\d{2}(FF|MM)\s/);
  const plainGender = line.match(/\d{8}\d?\s+([MF])\b/);
  const gender = eventGender
    ? genderFromEventCode(eventGender[1]!)
    : plainGender
      ? parseGenderCode(plainGender[1]!)
      : undefined;
  const dateOfBirth =
    parseAusaBirthDate(line) ??
    (() => {
      const m = line.match(/\b(\d{8})\d?\s+[MF]\b/);
      return m ? parseSdifBirthDate(m[1]!) : undefined;
    })();
  const usaMemberId = parseUsaMemberIdFromLine(line);

  if (!gender || !dateOfBirth) return null;

  return {
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    gender,
    dateOfBirth,
    usaMemberId,
  };
}

/** Hy-Tek CL2 / SD3 roster extraction (Team Manager & Meet Manager exports). */
export function parseCl2Roster(content: string): ParsedRosterRow[] {
  const allLines = content.split(/\r?\n/);
  const swimmers = new Map<string, ParsedRosterRow>();
  const seasonYear = extractSeasonYear(content) ?? new Date().getFullYear();

  let lastKey: string | undefined;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith("D3")) {
      const extra = parseCl2D3Fields(line);
      if (!lastKey) continue;
      if (!extra.usaMemberId && !extra.preferredName) continue;
      const row = swimmers.get(lastKey);
      // lastKey is recorded only after mergeSwimmer inserts the row.
      const next: ParsedRosterRow = { ...(row as ParsedRosterRow) };
      if (!next.usaMemberId && extra.usaMemberId) {
        next.usaMemberId = extra.usaMemberId;
      }
      if (extra.preferredName) {
        next.preferredName = extra.preferredName;
        next.firstName = extra.preferredName;
      }
      swimmers.set(lastKey, next);
      continue;
    }
    if (!line.startsWith("D0")) continue;
    const parsed = parseCl2D01Line(line, seasonYear);
    if (!parsed?.gender || !parsed.dateOfBirth) continue;
    mergeSwimmer(swimmers, { ...parsed, sourceLine: i + 1 });
    lastKey = swimmerKey({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: parsed.dateOfBirth,
      usaMemberId: parsed.usaMemberId,
    });
  }

  return [...swimmers.values()];
}

/** @deprecated Use parseCl2Roster */
export const parseSdifStyleRoster = parseCl2Roster;
