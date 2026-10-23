import { formatHy3Line, hy3FileClock, hy3FileDate } from "../export/meet";

/**
 * Team roster HY3 in the shape SwimTopia writes for Meet Manager:
 * A1 file type 03, then C1–C3 and one D1/D2/D3/D5/D7/DB/DD/DF group
 * per swimmer (DE when a parent email exists).
 *
 * Software is Lane4 HQ. The A1 publisher stays `Hy-Tek, Ltd`, which is the
 * origin field on the roster files Meet Manager already accepts.
 * D5 is the same flag block on every swimmer in those files. Lane4 does
 * not store per-athlete registration flags, so every row gets that block.
 */

const PUBLISHER = "Hy-Tek, Ltd";
const SOFTWARE = "Lane4 HQ";

export type RosterHy3Contacts = {
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  emergencyPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type RosterHy3Swimmer = {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  usaMemberId?: string | null;
  classYear?: string | null;
  practiceGroup?: string | null;
  contacts?: RosterHy3Contacts | null;
};

export type RosterHy3Team = {
  name?: string | null;
  shortName?: string | null;
  code?: string | null;
  lscCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
};

function blank(): string[] {
  return Array.from({ length: 128 }, () => " ");
}

function put(
  chars: string[],
  start: number,
  length: number,
  value: string | number | null | undefined,
): void {
  const text = value == null ? "" : String(value).slice(0, length);
  for (let i = 0; i < text.length; i++) chars[start - 1 + i] = text[i]!;
}

function putRight(
  chars: string[],
  start: number,
  length: number,
  value: string | number,
): void {
  put(
    chars,
    start,
    length,
    String(value).slice(0, length).padStart(length, " "),
  );
}

function emit(chars: string[]): string {
  return formatHy3Line(chars.join(""));
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function mmddyyyy(date: string | null | undefined): string {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[2]}${match[3]}${match[1]}`;
}

function rosterGender(value: string | null | undefined): "M" | "F" | undefined {
  if (value === "female" || value === "F") return "F";
  if (value === "male" || value === "M") return "M";
  return undefined;
}

function classCode(value: string | null | undefined): string {
  const code = text(value).toUpperCase();
  return /^(FR|SO|JR|SR)$/.test(code) ? code : "";
}

function ageYears(dateOfBirth: string, today: Date): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth)!;
  let age = today.getFullYear() - Number(match[1]);
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const dobMonth = Number(match[2]);
  const dobDay = Number(match[3]);
  if (month < dobMonth || (month === dobMonth && day < dobDay)) age -= 1;
  return Math.max(age, 0);
}

function parentParts(
  name: string,
): { first: string; last: string } | undefined {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return { first: "", last: parts[0]! };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1]!,
  };
}

/** Rosters Only HY3. Swimmers without a gender and date of birth are omitted. */
export function exportRosterHy3(
  swimmers: RosterHy3Swimmer[],
  team: RosterHy3Team = {},
  options?: { today?: Date },
): string {
  const today = options?.today ?? new Date();
  const lines: string[] = [];
  const code = text(team.code).toUpperCase().slice(0, 5) || "TEAM";
  const name = text(team.name);
  const header = blank();
  put(header, 1, 2, "A1");
  put(header, 3, 2, "03");
  put(header, 5, 25, "Rosters Only");
  put(header, 30, 15, PUBLISHER);
  put(header, 45, 14, SOFTWARE);
  put(header, 59, 8, hy3FileDate());
  put(header, 67, 9, hy3FileClock());
  put(header, 76, 53, name);
  lines.push(emit(header));

  const c1 = blank();
  put(c1, 1, 2, "C1");
  put(c1, 3, 5, code);
  put(c1, 8, 30, name);
  put(c1, 38, 16, text(team.shortName) || name.slice(0, 16));
  put(c1, 54, 2, text(team.lscCode).toUpperCase());
  put(c1, 56, 30, team.contactName);
  lines.push(emit(c1));

  const street = text(team.addressLine1);
  const city = text(team.city);
  if (street || city || text(team.region) || text(team.postalCode)) {
    const c2 = blank();
    put(c2, 1, 2, "C2");
    put(c2, 3, 30, team.addressLine1);
    put(c2, 33, 30, team.addressLine2);
    put(c2, 63, 30, city);
    put(c2, 93, 2, text(team.region).toUpperCase());
    put(c2, 95, 10, team.postalCode);
    put(c2, 105, 3, text(team.country).toUpperCase() || "USA");
    lines.push(emit(c2));
  }
  if (text(team.phone) || text(team.email)) {
    const c3 = blank();
    put(c3, 1, 2, "C3");
    put(c3, 33, 20, team.phone);
    put(c3, 93, 36, team.email);
    lines.push(emit(c3));
  }

  let meetId = 0;
  for (const swimmer of swimmers) {
    const born = swimmer.dateOfBirth ?? "";
    const gender = rosterGender(swimmer.gender);
    const dob = mmddyyyy(born);
    const first = text(swimmer.firstName);
    const last = text(swimmer.lastName);
    if (!gender || !dob || (!first && !last)) continue;
    meetId += 1;
    const contacts = swimmer.contacts ?? {};
    const middle = text(swimmer.middleName);
    const d1 = blank();
    put(d1, 1, 2, "D1");
    put(d1, 3, 1, gender);
    putRight(d1, 4, 5, meetId);
    put(d1, 9, 20, last);
    put(d1, 29, 20, first);
    put(d1, 49, 20, swimmer.preferredName);
    put(d1, 69, 1, middle.slice(0, 1));
    put(d1, 70, 14, swimmer.usaMemberId);
    put(d1, 89, 8, dob);
    putRight(d1, 97, 3, ageYears(born, today));
    const klass = classCode(swimmer.classYear);
    if (klass) put(d1, 100, 2, klass);
    const group = text(swimmer.practiceGroup);
    if (group) put(d1, 106, 2, group);
    lines.push(emit(d1));

    const d2 = blank();
    put(d2, 1, 2, "D2");
    put(d2, 3, 30, contacts.addressLine1);
    put(d2, 33, 30, contacts.addressLine2);
    put(d2, 63, 30, contacts.city);
    put(d2, 93, 2, text(contacts.state).toUpperCase());
    put(d2, 95, 10, contacts.postalCode);
    if (text(contacts.addressLine1) || text(contacts.city)) {
      put(d2, 105, 3, text(contacts.country).toUpperCase() || "USA");
    }
    lines.push(emit(d2));

    const d3 = blank();
    put(d3, 1, 2, "D3");
    put(d3, 33, 20, contacts.parentPhone);
    put(d3, 93, 36, contacts.parentEmail);
    lines.push(emit(d3));

    const d5 = blank();
    put(d5, 1, 2, "D5");
    put(d5, 73, 1, "X");
    put(d5, 75, 13, "FFFFFFFFFFFFF");
    lines.push(emit(d5));

    const d7 = blank();
    put(d7, 1, 2, "D7");
    lines.push(emit(d7));

    const parent = parentParts(text(contacts.parentName));
    const db = blank();
    put(db, 1, 2, "DB");
    if (parent) {
      put(db, 3, 20, parent.last);
      put(db, 23, 20, parent.first);
    }
    lines.push(emit(db));

    const dd = blank();
    put(dd, 1, 2, "DD");
    put(dd, 3, 20, contacts.parentPhone);
    put(dd, 43, 20, contacts.emergencyPhone);
    lines.push(emit(dd));

    const email = text(contacts.parentEmail);
    if (email) {
      const de = blank();
      put(de, 1, 2, "DE");
      put(de, 3, 60, email);
      lines.push(emit(de));
    }

    const df = blank();
    put(df, 1, 2, "DF");
    put(df, 3, 20, middle || "NA");
    lines.push(emit(df));
  }

  return `${lines.join("\r\n")}\r\n`;
}
