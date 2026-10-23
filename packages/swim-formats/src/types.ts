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
   * or SwimComm fixtures; retained so a C4 line is not dropped.
   */
  teamExtra?: string;
  /**
   * HY3 A1 columns 30–44. Team Manager and SwimTopia files say `Hy-Tek, Ltd`.
   * Lane4 meet-entry exports use that same publisher so the file matches
   * the layout Meet Manager already imports. Preserved on re-export when
   * the source publisher is not SwimTopia.
   */
  hy3Publisher?: string;
  /**
   * HY3 A1 columns 45–58. Team Manager files say `Win-TM …` and that value
   * is preserved on re-export. SwimTopia's `Swimtopia` token is replaced
   * with `Lane4 HQ`. A new Lane4 file also says `Lane4 HQ`.
   */
  hy3Software?: string;
  /**
   * HY3 A1 columns 59–66, parsed from an imported file. The day that file
   * was written, which can differ from the meet start on B1. Export always
   * writes the current date instead of this value.
   */
  hy3CreatedOn?: string;
  /**
   * HY3 A1 columns 67–75, parsed from an imported file, including the
   * leading spaces Team Manager writes. Export always writes the current
   * clock, such as `  4:27 PM`.
   */
  hy3CreatedTime?: string;
  /**
   * HY3 A1 columns 76–128. A new file uses the organization name.
   * Preserved on re-export.
   */
  hy3Licensee?: string;
  /**
   * HY3 B2 columns 103–108. Entry files use `0.00YO` or `0.00YL`.
   * The last letter is observed and its meaning is unconfirmed.
   */
  hy3EntrySetup?: string;
  /** HY3 C2 columns 109–111 (`USS` or `OTH` on USA teams). */
  teamOrgCode?: string;
  /**
   * Opaque HY3 C6 bodies (128 characters). Extra contact lines. Preserved
   * so a re-export does not drop them. Not interpreted.
   */
  hy3ContactLines?: string[];
  /**
   * CL2 A0 first publisher. Team Manager writes `Hy-Tek, Ltd`. A file
   * Lane4 creates says `Lane4 HQ, Ltd`. Preserved on re-export.
   */
  cl2Publisher?: string;
  /** CL2 A0 second publisher (columns 74–93). Same rule as `cl2Publisher`. */
  cl2Publisher2?: string;
  /**
   * CL2 A0 software token. Entry files have 4 characters (`8.0G` on a
   * Team Manager file). Results files have 10 (`WMM 8.0Fd `). A file
   * Lane4 creates uses `L4` or `Lane4 1.0`. Preserved on re-export.
   */
  cl2Software?: string;
  /** CL2 A0 columns 94–105 vendor phone, preserved on re-export. */
  cl2VendorPhone?: string;
  /** CL2 A0 columns 106–113 file date. */
  cl2CreatedOn?: string;
  /** CL2 A0 columns 150–153 (`TM41` entries, `TM43` rosters, `MM40` results). */
  cl2Tail?: string;
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
  /** Letter after the event number on SwimTopia multi-age entries (`42A`). */
  eventSuffix?: string;
  /** CL2 D3 cols 17–31, when the legal first name is different. */
  preferredName?: string;
  /**
   * HY3 D1 columns 29–48. The display name uses the preferred name when
   * Team Manager stored one, so the legal first name is kept separately.
   */
  legalFirstName?: string;
  /** HY3 D1 column 69. */
  middleInitial?: string;
  /** HY3 D1 columns 106–107. Observed group text, meaning unconfirmed. */
  practiceGroup?: string;
  /** HY3 D1 columns 109–111. Observed subgroup text, meaning unconfirmed. */
  practiceSubgroup?: string;
  /**
   * HY3 E1 column 92. One character on some Team Manager entry files.
   * Meaning unconfirmed. Not written unless the source file had it.
   */
  hy3EntryMark?: string;
  /** CL2 D3 cols 32–33. */
  ethnicity?: string;
  /** CL2 D3 yes/no flags from col 34 (Hy-Tek writes `F`/`T` per flag). */
  registrationFlags?: string;
  /** True when HY3 E1 col 84 is `X` (exhibition). */
  exhibition?: boolean;
  meetDivision?: string;
  heat?: number;
  lane?: number;
  /**
   * CL2 D0 columns 12–51 as stored. Kept so a middle initial or other text
   * in that field is not rebuilt from the display name.
   */
  cl2NameField?: string;
}

export interface ParsedEvent {
  eventNumber?: number;
  stroke: string;
  distance: number;
  gender: EventGender;
  ageGroup?: string;
  eventKey: string;
  /**
   * SwimTopia / Meet Manager multi-age suffix. Column 42 of an HY3 entry
   * (`42A`) and the last character of an SD3 event number. The integer
   * `eventNumber` stays the base number.
   */
  eventSuffix?: string;
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
  /** Letter after the event number on SwimTopia multi-age results. */
  eventSuffix?: string;
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
  /** Letter after the event number on SwimTopia multi-age relays (`3A`). */
  eventSuffix?: string;
  /** Recorded team attempts from HY3 F2 relay-result records. */
  results?: ParsedRelayResult[];
  /** CL2 F0 columns 23–62, one entry per leg, parallel to `swimmerNames`. */
  cl2LegNameFields?: string[];
  /** CL2 F0 columns 66–79 (birth date, age, sex, `000`), one entry per leg. */
  cl2LegIdentity?: string[];
  /**
   * CL2 F0 columns 93–112, one entry per leg. Registration text on some
   * entry files. Meaning unconfirmed.
   */
  cl2LegExtras?: string[];
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
  /** HY3 D1 columns 29–48 legal first name. See `ParsedEntry.legalFirstName`. */
  legalFirstName?: string;
  /** HY3 D1 column 69. */
  middleInitial?: string;
  /** HY3 D1 columns 106–107. Observed group text, meaning unconfirmed. */
  practiceGroup?: string;
  /** HY3 D1 columns 109–111. Observed subgroup text, meaning unconfirmed. */
  practiceSubgroup?: string;
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
