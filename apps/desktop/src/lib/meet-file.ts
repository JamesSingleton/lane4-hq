import type { ParsedMeet, ParsedRosterRow } from "@lane4hq/swim-formats";
import {
  type ParseMeetBytesResult,
  parseMeetFilesFromBytes,
} from "@lane4hq/swim-formats/meet";
import { parseRosterFileFromBytes } from "@lane4hq/swim-formats/roster";

/** Keep in sync with `ALLOWED_EXTENSIONS` in `src-tauri/src/meet_file.rs`. */
export const MEET_FILE_EXTENSIONS = [
  "sd3",
  "sdif",
  "hy3",
  "cl2",
  "ev3",
  "hyv",
  "xls",
  "xlsx",
  "zip",
] as const;

export type SourceFile = { filename: string; bytes: Uint8Array };

export type MeetSummary = {
  events: number;
  entries: number;
  results: number;
  relays: number;
  athletes: number;
  teams: string[];
};

export type InspectedFiles =
  | {
      kind: "meet";
      filenames: string[];
      sourceFiles: string[];
      meet: ParsedMeet;
      summary: MeetSummary;
    }
  | { kind: "roster"; filenames: string[]; rows: ParsedRosterRow[] };

const ROSTER_ONLY = /Rosters Only|roster export/i;

export function hasMeetFileExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() || "";
  return (MEET_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function summarizeMeet(meet: ParsedMeet): MeetSummary {
  const teams = new Set<string>();
  if (meet.teamCode) teams.add(meet.teamCode);
  for (const result of meet.results) {
    if (result.teamCode) teams.add(result.teamCode);
  }
  for (const relay of meet.relays ?? []) {
    if (relay.teamCode) teams.add(relay.teamCode);
  }
  const athleteNames = new Set<string>();
  for (const athlete of meet.athletes ?? []) athleteNames.add(athlete.name);
  for (const entry of meet.entries) athleteNames.add(entry.swimmerName);
  for (const result of meet.results) athleteNames.add(result.swimmerName);

  return {
    events: meet.events.length,
    entries: meet.entries.length,
    results: meet.results.length,
    relays: meet.relays?.length ?? 0,
    athletes: athleteNames.size,
    teams: [...teams].sort(),
  };
}

/**
 * Parse one ZIP pack or a set of companion meet files. Team Manager roster
 * exports (which the meet parser rejects) fall back to the roster parser so
 * coaches can inspect anything Hy-Tek hands them.
 */
export function inspectFiles(files: SourceFile[]): InspectedFiles {
  if (files.length === 0) {
    throw new Error("Choose at least one meet file.");
  }
  const filenames = files.map((f) => f.filename);
  const unsupported = filenames.filter((name) => !hasMeetFileExtension(name));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported file: ${unsupported.join(", ")}. Use SD3/SDIF, HY3, CL2, EV3, HYV, XLS, or ZIP.`,
    );
  }

  try {
    const meet = parseMeetFilesFromBytes(files) as ParseMeetBytesResult;
    return {
      kind: "meet",
      filenames,
      sourceFiles: meet.sourceFiles ?? filenames,
      meet,
      summary: summarizeMeet(meet),
    };
  } catch (error) {
    const [only] = files;
    if (
      files.length === 1 &&
      only &&
      error instanceof Error &&
      ROSTER_ONLY.test(error.message)
    ) {
      return {
        kind: "roster",
        filenames,
        rows: parseRosterFileFromBytes(only.bytes, only.filename),
      };
    }
    throw error;
  }
}

/** Basename that works for both `/` (macOS) and `\` (Windows) paths. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
