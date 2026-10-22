import type { EventGender } from "@lane4hq/swim-core/events";
import type { SwimmerContactsInput } from "@lane4hq/swim-core/validators";

export interface ParsedMeet {
  name: string;
  startDate?: string;
  endDate?: string;
  /** Host entry deadline (YYYY-MM-DD) when present in EV3. */
  entryDeadline?: string;
  course: "SCY" | "SCM" | "LCM";
  location?: string;
  address?: string;
  altitude?: number;
  sanctionNumber?: string;
  notes?: string;
  events: ParsedEvent[];
  entries: ParsedEntry[];
  results: ParsedResult[];
  relays?: ParsedRelayEntry[];
  /**
   * Meet-roster athletes, including relay-only swimmers who have a D1/D0
   * identity record but no individual event entry.
   */
  athletes?: ParsedAthlete[];
  /** Entry limits when present in the source file; omit/undefined if not found. */
  entryLimits?: {
    maxIndividualEntries?: number;
    maxRelayEntries?: number;
    maxCombinedEntries?: number;
    packages?: Array<{ individual: number; relay: number }>;
  };
  /**
   * Diving events detected in the source file but not imported yet.
   * Hy-Tek uses stroke `6` (HYV) / `F` (EV3). Swim-only import skips these
   * and surfaces the count so coaches know what was omitted.
   */
  skippedDiveEvents?: number;
  /**
   * When set, guides admin import (e.g. skip draft entries for results files).
   */
  importKind?: "results" | "entries" | "events" | "roster";
  /** Hy-Tek team abbreviation (MARI). */
  teamCode?: string;
  /** USA Swimming LSC (AZ). */
  lscCode?: string;
  /** Full team name for C1 (falls back to meet context). */
  teamName?: string;
  /** Optional 16-char TM short name (MHS). Defaults to teamCode. */
  teamShortName?: string;
  /** TM C1 team type, e.g. HS. */
  teamKind?: string;
  teamAddressLine1?: string;
  teamAddressLine2?: string;
  teamCity?: string;
  teamRegion?: string;
  teamPostalCode?: string;
  teamCountry?: string;
  /** Head coach (or owner) name for HY3 C1 cols 56–85. */
  teamContactName?: string;
  /** Second contact name for HY3 C1 cols 86–115, when it differs. */
  teamContactName2?: string;
  /** Head coach (or owner) email for HY3 C3. */
  teamContactEmail?: string;
  /** HY3 C3 daytime phone (cols 33–52). */
  teamPhone?: string;
  /** HY3 C3 evening phone (cols 53–72). */
  teamPhone2?: string;
  /** HY3 C3 fax (cols 73–92). */
  teamFax?: string;
  /**
   * Age-up date (YYYY-MM-DD) from HY3 B1 cols 109–116.
   * Competition age is computed on this date, which can differ from the meet start.
   */
  ageUpDate?: string;
  /**
   * Unconfirmed HY3 C4 free text (cols 3–122). Not present in the Maricopa
   * fixtures; retained so a C4 line is not dropped.
   */
  teamExtra?: string;
}

export interface ParsedEntry {
  eventNumber?: number;
  swimmerName: string;
  seedTime?: string;
  usaMemberId?: string;
  /** YYYY-MM-DD when present on HY3 D1 (or derived from USA ID). */
  dateOfBirth?: string;
  gender?: "male" | "female";
  /** High-school class year (FR/SO/JR/SR) when present. */
  classYear?: string;
  /** HY3 D1 athlete number (cols 4–8), preserved on export. */
  meetSwimmerId?: number;
  /** Course letter on this entry's seed (CL2 D0 col 97 / HY3 E1 col 51). */
  seedCourse?: "SCY" | "SCM" | "LCM";
  /** CL2 D3 cols 17–31, when the legal first name is different. */
  preferredName?: string;
  /** CL2 D3 cols 32–33. */
  ethnicity?: string;
  /** CL2 D3 yes/no flags from col 34 (Hy-Tek writes `F`/`T` per flag). */
  registrationFlags?: string;
  /** True when HY3 E1 col 84 is `X` (exhibition). */
  exhibition?: boolean;
  meetDivision?: string;
  heat?: number;
  lane?: number;
}

export interface ParsedEvent {
  eventNumber?: number;
  stroke: string;
  distance: number;
  gender: EventGender;
  ageGroup?: string;
  eventKey: string;
  /** `dive` for Hy-Tek dive events (stroke F/6); default swim. */
  eventKind?: "swim" | "dive";
  /** Number of dives when present on EV3 dive rows. */
  diveCount?: number;
  /** Championship round when present (HYV): prelims/finals/swimoff/time trial. */
  roundType?: "prelim" | "finals" | "swimoff" | "time_trial";
  /** Primary meet qualifying/entry cut time in milliseconds when present. */
  qualifyingTimeMs?: number;
}

export interface ParsedResult {
  eventNumber?: number;
  swimmerName: string;
  time: string;
  place?: number;
  isDq?: boolean;
  usaMemberId?: string;
  /** When present (e.g. Hy-Tek D0), used to match/create roster athletes. */
  dateOfBirth?: string;
  gender?: "male" | "female";
  /** Hy-Tek team abbreviation when present (C1 / D1 context). */
  teamCode?: string;
  resultType?: "prelim" | "swimoff" | "finals";
  heat?: number;
  lane?: number;
  dqCode?: string;
  exhibition?: boolean;
  /** Split times in milliseconds when present (e.g. HY3 G1). */
  splitsMs?: number[];
}

export interface ParsedRelayEntry {
  eventNumber?: number;
  /** Primary legs 1–4, then alternates #5–#8 when present. */
  swimmerNames: string[];
  seedTime?: string;
  /** Course letter on the relay seed (CL2 E0 col 54). */
  seedCourse?: "SCY" | "SCM" | "LCM";
  teamCode?: string;
  relayLetter?: string;
  /** Recorded team attempts from HY3 F2 relay-result records. */
  results?: ParsedRelayResult[];
}

export interface ParsedRelayResult {
  time: string;
  place?: number;
  isDq?: boolean;
  resultType?: "prelim" | "swimoff" | "finals";
  heat?: number;
  lane?: number;
  dqCode?: string;
  exhibition?: boolean;
}

/** Team-roster identity row (Hy-Tek D1 / CL2 D0 without an event). */
export interface ParsedAthlete {
  name: string;
  usaMemberId?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
  classYear?: string;
  /** HY3 D1 athlete number (cols 4–8), preserved on export. */
  meetSwimmerId?: number;
  /** CL2 D3 preferred first name. */
  preferredName?: string;
  /** CL2 D3 ethnicity code (cols 32–33). */
  ethnicity?: string;
  /** CL2 D3 registration flags from col 34. */
  registrationFlags?: string;
  /** Committed / attending with no individual event entries. */
  relayOnly?: boolean;
}

export interface ParsedRosterRow {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "male" | "female";
  practiceGroup?: string;
  classYear?: string;
  usaMemberId?: string;
  middleName?: string;
  preferredName?: string;
  contacts?: SwimmerContactsInput;
  /** 1-based line number in the source file when known. */
  sourceLine?: number;
}
