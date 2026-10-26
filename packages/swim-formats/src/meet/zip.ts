import { unzipSync } from "fflate";
import { detectCl2FileKind } from "../cl2/kind";
import type {
  ParsedEvent,
  ParsedMeet,
  ParsedRelayEntry,
  ParsedRelayResult,
} from "../types";
import { withEventsSortedByNumber } from "./sort-events";

export type MeetZipFormat = "sdif" | "hy3" | "ev3" | "hyv" | "cl2" | "xls";

const MEET_EXT_PRIORITY: Array<{ ext: string; format: MeetZipFormat }> = [
  { ext: ".ev3", format: "ev3" },
  { ext: ".hyv", format: "hyv" },
  { ext: ".hy3", format: "hy3" },
  { ext: ".sd3", format: "sdif" },
  { ext: ".sdif", format: "sdif" },
  { ext: ".cl2", format: "cl2" },
  { ext: ".xls", format: "xls" },
  { ext: ".xlsx", format: "xls" },
];

/** Prefer these as the primary meet file when multiple formats exist. */
const PRIMARY_FORMAT_RANK: MeetZipFormat[] = [
  "ev3",
  "hyv",
  "hy3",
  "sdif",
  "cl2",
  "xls",
];

export type ExtractedMeetFile = {
  filename: string;
  bytes: Uint8Array;
  format: MeetZipFormat;
  /** 0 = top-level zip entry; nested zips increment depth. */
  depth: number;
};

export type MeetZipBundle = {
  files: ExtractedMeetFile[];
  primary: ExtractedMeetFile;
  /** True when top-level files are roster-only (Swimmers Only / Rosters Only). */
  isRosterOnly: boolean;
};

export function isZipFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".zip");
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1]!;
}

function isJunkPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = basename(normalized);
  if (!name || name.endsWith("/")) return true;
  if (normalized.includes("__MACOSX/")) return true;
  if (name === ".DS_Store" || name.startsWith("._")) return true;
  return false;
}

function formatForFilename(filename: string): MeetZipFormat | null {
  const lower = filename.toLowerCase();
  for (const { ext, format } of MEET_EXT_PRIORITY) {
    if (lower.endsWith(ext)) return format;
  }
  return null;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function isRosterOnlyContent(filename: string, bytes: Uint8Array): boolean {
  const lower = filename.toLowerCase();
  if (
    lower.endsWith(".cl2") ||
    lower.endsWith(".sd3") ||
    lower.endsWith(".sdif")
  ) {
    return detectCl2FileKind(decodeText(bytes)) === "swimmers_only";
  }
  if (lower.endsWith(".hy3")) {
    const head = decodeText(bytes).slice(0, 120).toUpperCase();
    return head.includes("ROSTERS ONLY");
  }
  return false;
}

function isMeetContentFile(file: ExtractedMeetFile): boolean {
  if (file.format === "ev3" || file.format === "hyv" || file.format === "xls") {
    return true;
  }
  if (isRosterOnlyContent(file.filename, file.bytes)) return false;
  if (file.format === "cl2") {
    const kind = detectCl2FileKind(decodeText(file.bytes));
    return kind === "meet_results" || kind === "meet_entries";
  }
  if (file.format === "hy3") return true;
  return file.format === "sdif";
}

function collectFromZip(
  bytes: Uint8Array,
  depth: number,
  maxDepth: number,
  out: ExtractedMeetFile[],
): void {
  if (!isZipBytes(bytes)) {
    throw new Error(
      "This doesn't look like a ZIP file. Re-export the meet pack from Meet Manager or Team Manager and upload the .zip it produces.",
    );
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error(
      "Couldn't read this ZIP archive — it may be corrupted. Re-export it and try again.",
    );
  }

  for (const [path, fileBytes] of Object.entries(entries)) {
    if (isJunkPath(path)) continue;
    if (!fileBytes || fileBytes.length === 0) continue;
    const filename = basename(path);

    if (isZipFilename(filename) && depth < maxDepth) {
      collectFromZip(fileBytes, depth + 1, maxDepth, out);
      continue;
    }

    const format = formatForFilename(filename);
    if (!format) continue;
    out.push({ filename, bytes: fileBytes, format, depth });
  }
}

function pickPrimary(files: ExtractedMeetFile[]): ExtractedMeetFile {
  for (const format of PRIMARY_FORMAT_RANK) {
    const match = files.find((f) => f.format === format);
    if (match) return match;
  }
  return files[0]!;
}

/**
 * Choose the primary meet file from a set of extracted/selected files and
 * detect whether the set is roster-only. Shared by ZIP extraction and
 * multi-file (non-ZIP pack) selection so both paths apply the same
 * "Swimmers Only / Rosters Only" guardrail.
 */
export function selectPrimaryMeetFile(files: ExtractedMeetFile[]): {
  primary: ExtractedMeetFile;
  isRosterOnly: boolean;
} {
  const topLevel = files.filter((f) => f.depth === 0);
  const topLevelRoster =
    topLevel.length > 0 &&
    topLevel.every((f) => isRosterOnlyContent(f.filename, f.bytes));
  const topLevelHasMeet = topLevel.some(isMeetContentFile);
  // Team Manager "Roster" zips often nest an entries pack — still roster-only
  // when every *top-level* file is Swimmers Only / Rosters Only.
  const isRosterOnly = topLevelRoster && !topLevelHasMeet;

  const pool = isRosterOnly
    ? files.filter((f) => f.depth === 0)
    : files.filter((f) => !isRosterOnlyContent(f.filename, f.bytes));
  const primaryPool = pool.length > 0 ? pool : files;

  return { primary: pickPrimary(primaryPool), isRosterOnly };
}

/**
 * Extract all supported meet files from a ZIP (including nested ZIPs).
 */
export function extractAllMeetFilesFromZip(
  bytes: Uint8Array,
  options?: { maxDepth?: number },
): MeetZipBundle {
  const maxDepth = options?.maxDepth ?? 2;
  const files: ExtractedMeetFile[] = [];
  collectFromZip(bytes, 0, maxDepth, files);

  if (files.length === 0) {
    throw new Error(
      "This ZIP doesn't contain a supported meet file. Re-export it from Meet Manager or Team Manager with an EV3, HYV, HY3, SD3/SDIF, CL2, or XLS file included, then try again.",
    );
  }

  const seen = new Set<string>();
  const unique: ExtractedMeetFile[] = [];
  for (const file of files) {
    const key = `${file.depth}:${file.format}:${file.filename.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }

  const { primary, isRosterOnly } = selectPrimaryMeetFile(unique);

  return {
    files: unique,
    primary,
    isRosterOnly,
  };
}

/** Prefer EV3, then HYV, then other known meet formats inside a ZIP (single file). */
export function extractMeetFileFromZip(bytes: Uint8Array): ExtractedMeetFile {
  return extractAllMeetFilesFromZip(bytes).primary;
}

function indexKey(
  name: string,
  eventNumber?: number,
  eventSuffix?: string,
): string {
  return `${(eventNumber ?? "").toString()}${eventSuffix ?? ""}|${name.trim().toLowerCase()}`;
}

function sameMergedEvent(a: ParsedEvent, b: ParsedEvent): boolean {
  if (
    a.eventNumber != null &&
    b.eventNumber != null &&
    a.eventNumber === b.eventNumber &&
    (a.eventSuffix ?? "") !== (b.eventSuffix ?? "")
  ) {
    return false;
  }
  return (
    (a.eventNumber != null &&
      b.eventNumber != null &&
      a.eventNumber === b.eventNumber) ||
    a.eventKey === b.eventKey
  );
}

function relayTeamCodesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.endsWith(b) || b.endsWith(a);
}

function findMergedRelayIndex(
  merged: ParsedRelayEntry[],
  relay: ParsedRelayEntry,
): number {
  const eventNumber = relay.eventNumber ?? "";
  const letter = (relay.relayLetter ?? "").trim().toUpperCase();
  const team = (relay.teamCode ?? "").trim().toLowerCase();
  return merged.findIndex(
    (existing) =>
      (existing.eventNumber ?? "") === eventNumber &&
      (existing.eventSuffix ?? "") === (relay.eventSuffix ?? "") &&
      (existing.relayLetter ?? "").trim().toUpperCase() === letter &&
      relayTeamCodesMatch((existing.teamCode ?? "").trim().toLowerCase(), team),
  );
}

function copyRelayResult(result: ParsedRelayResult): ParsedRelayResult {
  return {
    ...result,
    ...(result.legSplits
      ? { legSplits: result.legSplits.map((split) => ({ ...split })) }
      : {}),
  };
}

function relayRoundsMatch(
  primary: ParsedRelayResult,
  extra: ParsedRelayResult,
): boolean {
  return (primary.resultType ?? "") === (extra.resultType ?? "");
}

/**
 * HY3 is the primary relay result and has no lead-off. CL2 carries that
 * split. Keep the primary time and fill a missing lead-off from the same round.
 */
function mergeRelayResults(
  primary: ParsedRelayResult[] | undefined,
  extra: ParsedRelayResult[] | undefined,
): ParsedRelayResult[] | undefined {
  if (!primary?.length) {
    return extra?.length ? extra.map(copyRelayResult) : primary;
  }
  if (!extra?.length) return primary;
  return primary.map((result) => {
    if (result.legSplits?.length) return result;
    const match = extra.find((row) => relayRoundsMatch(result, row));
    if (!match?.legSplits?.length) return result;
    return {
      ...result,
      legSplits: match.legSplits.map((split) => ({ ...split })),
    };
  });
}

function mergeRelayEntries(
  primary: ParsedRelayEntry[] | undefined,
  extra: ParsedRelayEntry[],
): ParsedRelayEntry[] {
  const merged = primary ? primary.map((relay) => ({ ...relay })) : [];

  for (const relay of extra) {
    const existingIndex = findMergedRelayIndex(merged, relay);
    if (existingIndex < 0) {
      merged.push({ ...relay, swimmerNames: [...relay.swimmerNames] });
      continue;
    }
    const existing = merged[existingIndex]!;
    if (!existing.seedTime && relay.seedTime) {
      existing.seedTime = relay.seedTime;
    }
    if (existing.swimmerNames.length === 0 && relay.swimmerNames.length > 0) {
      existing.swimmerNames = [...relay.swimmerNames];
    }
    const results = mergeRelayResults(existing.results, relay.results);
    if (results?.length) existing.results = results;
  }

  return merged;
}

/**
 * Merge supplemental ParsedMeet data into a primary meet.
 * Primary wins for conflicts; supplements fill missing athlete IDs / entries / events.
 */
export function mergeParsedMeets(
  primary: ParsedMeet,
  supplements: ParsedMeet[],
): ParsedMeet {
  const merged: ParsedMeet = {
    ...primary,
    events: [...primary.events],
    entries: [...primary.entries],
    results: [...primary.results],
    relays: primary.relays ? [...primary.relays] : undefined,
    athletes: primary.athletes ? [...primary.athletes] : undefined,
  };

  for (const extra of supplements) {
    if (!merged.startDate && extra.startDate)
      merged.startDate = extra.startDate;
    if (!merged.endDate && extra.endDate) merged.endDate = extra.endDate;
    if (!merged.location && extra.location) merged.location = extra.location;
    if (!merged.address && extra.address) merged.address = extra.address;
    if (!merged.entryDeadline && extra.entryDeadline) {
      merged.entryDeadline = extra.entryDeadline;
    }
    if (!merged.entryLimits && extra.entryLimits) {
      merged.entryLimits = extra.entryLimits;
    }
    if (
      (merged.skippedDiveEvents == null || merged.skippedDiveEvents === 0) &&
      extra.skippedDiveEvents
    ) {
      merged.skippedDiveEvents = extra.skippedDiveEvents;
    }

    for (const event of extra.events) {
      const exists = merged.events.some((e) => sameMergedEvent(e, event));
      if (!exists) merged.events.push(event);
    }

    const entryKeys = new Set(
      merged.entries.map((e) =>
        indexKey(e.swimmerName, e.eventNumber, e.eventSuffix),
      ),
    );
    for (const entry of extra.entries) {
      const key = indexKey(
        entry.swimmerName,
        entry.eventNumber,
        entry.eventSuffix,
      );
      if (entryKeys.has(key)) {
        const existing = merged.entries.find(
          (e) => indexKey(e.swimmerName, e.eventNumber, e.eventSuffix) === key,
        );
        if (existing && !existing.usaMemberId && entry.usaMemberId) {
          existing.usaMemberId = entry.usaMemberId;
        }
        if (existing && !existing.seedTime && entry.seedTime) {
          existing.seedTime = entry.seedTime;
        }
        continue;
      }
      entryKeys.add(key);
      merged.entries.push(entry);
    }

    const resultKeys = new Set(
      merged.results.map((r) =>
        indexKey(r.swimmerName, r.eventNumber, r.eventSuffix),
      ),
    );
    for (const result of extra.results) {
      const key = indexKey(
        result.swimmerName,
        result.eventNumber,
        result.eventSuffix,
      );
      if (resultKeys.has(key)) continue;
      resultKeys.add(key);
      merged.results.push(result);
    }

    if (extra.relays?.length) {
      merged.relays = mergeRelayEntries(merged.relays, extra.relays);
    }

    if (extra.athletes?.length) {
      const byName = new Map(
        (merged.athletes ?? []).map(
          (a) => [a.name.trim().toLowerCase(), a] as const,
        ),
      );
      for (const athlete of extra.athletes) {
        const key = athlete.name.trim().toLowerCase();
        const existing = byName.get(key);
        if (existing) {
          existing.usaMemberId ??= athlete.usaMemberId;
          existing.dateOfBirth ??= athlete.dateOfBirth;
          existing.gender ??= athlete.gender;
          existing.relayOnly ??= athlete.relayOnly;
          continue;
        }
        byName.set(key, athlete);
      }
      merged.athletes = [...byName.values()];
    }

    // Prefer results/entries kind from any member of the zip pack
    if (
      extra.importKind === "results" ||
      (merged.importKind == null && extra.importKind)
    ) {
      merged.importKind = extra.importKind;
    }
  }

  return withEventsSortedByNumber(merged);
}
