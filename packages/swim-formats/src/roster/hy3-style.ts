import type { SwimmerContactsInput } from "@lane4hq/swim-core/validators";
import type { ParsedRosterRow } from "../types";
import {
  estimateDobFromClassYear,
  extractSeasonYear,
  mergeSwimmer,
  parseSdifBirthDate,
  swimmerKey,
} from "./utils";

function sliceField(line: string, start: number, length: number): string {
  return line.slice(start - 1, start - 1 + length).trim();
}

/** "NA" / "n/a" show up in SwimTopia parent fields when the value is blank. */
function usable(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return undefined;
  return trimmed;
}

function emailFrom(line: string): string | undefined {
  return line.slice(2).match(/[^\s@]+@[^\s@]+/)?.[0];
}

function firstPhone(values: string[]): string | undefined {
  for (const value of values) {
    const phone = usable(value);
    if (phone) return phone;
  }
  return undefined;
}

/**
 * DB is six 20-character name fields.
 * SwimTopia writes either "Last, First, …" or a later pair
 * "MotherLast, MotherFirst".
 */
function parentFromDb(line: string): string | undefined {
  const fields = Array.from({ length: 6 }, (_, index) =>
    sliceField(line, 3 + index * 20, 20),
  );
  const last = fields[0];
  const first = fields[1];
  if (last && first) return `${first} ${last}`;
  const last2 = fields[3];
  const first2 = fields[4];
  if (last2 && first2) return `${first2} ${last2}`;
  return undefined;
}

function hasContact(contacts: SwimmerContactsInput): boolean {
  return [
    contacts.parentName,
    contacts.parentEmail,
    contacts.parentPhone,
    contacts.addressLine1,
    contacts.addressLine2,
    contacts.city,
    contacts.state,
    contacts.postalCode,
    contacts.country,
  ].some((value) => (value ?? "").trim().length > 0);
}

/** Hy-Tek Team Manager HY3 roster lines: D1M / D1F */
function parseHy3D1Line(
  line: string,
  seasonYear: number,
): (Partial<ParsedRosterRow> & { firstName: string; lastName: string }) | null {
  if (!/^D1[MF]/.test(line)) return null;

  const gender = line.charAt(2) === "F" ? "female" : "male";
  const lastName = line.substring(8, 28).trim();
  const firstName = line.substring(28, 48).trim();
  const preferredName = sliceField(line, 49, 20) || undefined;
  const middleName = sliceField(line, 69, 1) || undefined;
  const usaMemberId = sliceField(line, 70, 14) || undefined;
  const columnClass = line.substring(99, 101).trim().toUpperCase();
  const classYear = /^(FR|SO|JR|SR)$/.test(columnClass)
    ? columnClass
    : (line.match(/0(FR|SO|JR|SR)\b/)?.[1] ??
      line.match(/\b(FR|SO|JR|SR)\b/)?.[1]);
  const dateOfBirth =
    parseSdifBirthDate(sliceField(line, 89, 8)) ??
    (classYear ? estimateDobFromClassYear(classYear, seasonYear) : undefined);

  if (!lastName && !firstName) return null;

  return {
    firstName: firstName || "Unknown",
    lastName: lastName || "Swimmer",
    gender,
    dateOfBirth,
    classYear,
    preferredName,
    middleName,
    usaMemberId,
  };
}

function applyRosterDetail(contacts: SwimmerContactsInput, line: string): void {
  const code = line.slice(0, 2);
  if (code === "D2") {
    const addressLine1 = sliceField(line, 3, 30);
    const addressLine2 = sliceField(line, 33, 30);
    const city = sliceField(line, 63, 30);
    const state = sliceField(line, 93, 2);
    const postalCode = sliceField(line, 95, 10);
    const country = sliceField(line, 105, 3);
    if (addressLine1) contacts.addressLine1 = addressLine1;
    if (addressLine2) contacts.addressLine2 = addressLine2;
    if (city) contacts.city = city;
    if (state) contacts.state = state;
    if (postalCode) contacts.postalCode = postalCode;
    if (country) contacts.country = country;
    return;
  }
  if (code === "D3" || code === "D7" || code === "DE") {
    const email = emailFrom(line);
    if (email && !contacts.parentEmail) contacts.parentEmail = email;
  }
  if (code === "D3") {
    const phone = firstPhone([
      sliceField(line, 33, 20),
      sliceField(line, 53, 20),
      sliceField(line, 73, 20),
    ]);
    if (phone && !contacts.parentPhone) contacts.parentPhone = phone;
  }
  if (code === "DD") {
    const phone = firstPhone(
      Array.from({ length: 6 }, (_, index) =>
        sliceField(line, 3 + index * 20, 20),
      ),
    );
    if (phone) contacts.parentPhone = phone;
  }
  if (code === "DB") {
    const parentName = parentFromDb(line);
    if (parentName) contacts.parentName = parentName;
  }
}

/** Hy-Tek .HY3 roster extraction (Rosters Only & meet entry files). */
export function parseHy3Roster(content: string): ParsedRosterRow[] {
  const allLines = content.split(/\r?\n/);
  const swimmers = new Map<string, ParsedRosterRow>();
  const seasonYear = extractSeasonYear(content) ?? new Date().getFullYear();
  let currentKey: string | undefined;
  let contacts: SwimmerContactsInput = {};

  function flush(): void {
    if (!currentKey) return;
    const row = swimmers.get(currentKey);
    if (row && hasContact(contacts)) row.contacts = contacts;
    currentKey = undefined;
    contacts = {};
  }

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i]!;
    if (!line.trim()) continue;
    if (line.startsWith("D1")) {
      flush();
      const parsed = parseHy3D1Line(line, seasonYear);
      if (!parsed?.dateOfBirth) continue;
      const dateOfBirth = parsed.dateOfBirth;
      mergeSwimmer(swimmers, { ...parsed, dateOfBirth, sourceLine: i + 1 });
      currentKey = swimmerKey({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dateOfBirth,
        usaMemberId: parsed.usaMemberId,
      });
      continue;
    }
    if (!currentKey) continue;
    applyRosterDetail(contacts, line);
  }
  flush();

  return [...swimmers.values()];
}

/** @deprecated Use parseHy3Roster */
export const parseHy3StyleRoster = parseHy3Roster;
