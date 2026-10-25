import {
  canAddMeetEntry,
  checkQualifyingTime,
  isRelayStroke,
  type MeetEntryLimits,
} from "./entry-limits";
import type { FileAthleteMatch } from "./meet-athlete-match";
import {
  type EventConflictResolution,
  resolveImportedEventForMerge,
} from "./meet-import-merge";
import { parseTime } from "./times";

export type ImportedAthleteDecision =
  | { kind: "skip" }
  | { kind: "resolved"; membershipId: string; swimmerId: string }
  | { kind: "create" };

/** Coach map, automatic match, or create. Create still happens in the action. */
export function decideImportedAthlete(args: {
  athlete: Pick<FileAthleteMatch, "status" | "matched">;
  mapAction: string | undefined;
  roster: Array<{ membershipId: string; swimmerId: string }>;
  addNewAthletes: boolean;
}): ImportedAthleteDecision {
  const { mapAction, athlete } = args;
  if (mapAction === "skip") return { kind: "skip" };
  if (mapAction && mapAction !== "create" && mapAction !== "skip") {
    const member = args.roster.find((row) => row.membershipId === mapAction);
    if (!member) return { kind: "skip" };
    return {
      kind: "resolved",
      membershipId: member.membershipId,
      swimmerId: member.swimmerId,
    };
  }
  if (athlete.status === "matched" && athlete.matched) {
    return {
      kind: "resolved",
      membershipId: athlete.matched.membershipId,
      swimmerId: athlete.matched.swimmerId,
    };
  }
  const shouldCreate =
    mapAction === "create" ||
    (args.addNewAthletes && athlete.status === "unmatched");
  if (shouldCreate) return { kind: "create" };
  return { kind: "skip" };
}

export function importedEventSlot(event: {
  eventNumber?: number | null;
  eventSuffix?: string | null;
  ageGroup?: string | null;
  eventKey: string;
}): string {
  return [
    event.eventNumber ?? "",
    event.eventSuffix ?? "",
    event.ageGroup ?? "",
    event.eventKey,
  ].join("|");
}

type PlannedEventBase = {
  eventNumber?: number | null;
  eventSuffix?: string | null;
  ageGroup?: string | null;
  eventKey: string;
  stroke: string;
  distance: number;
  gender: string;
  qualifyingTimeMs?: number | null;
  importedFromFile?: boolean;
};

export type PlannedMeetEventWrite =
  | {
      op: "refresh" | "replace" | "link";
      index: number;
      slot: string;
      eventId: string;
    }
  | {
      op: "add";
      index: number;
      slot: string;
      claimEventNumber: boolean;
    };

export function planImportedEventWrites(
  existing: Array<PlannedEventBase & { id: string }>,
  imported: PlannedEventBase[],
  resolutions: Record<number, EventConflictResolution | undefined> | undefined,
): PlannedMeetEventWrite[] {
  const writes: PlannedMeetEventWrite[] = [];
  for (let index = 0; index < imported.length; index++) {
    const event = imported[index]!;
    const slot = importedEventSlot(event);
    let slotted: (typeof existing)[number] | undefined;
    for (const row of existing) {
      if (importedEventSlot(row) === slot) slotted = row;
    }
    if (slotted) {
      writes.push({
        op: slotted.importedFromFile ? "refresh" : "link",
        index,
        slot,
        eventId: slotted.id,
      });
      continue;
    }

    const suffix = event.eventSuffix ?? "";
    const eventNumber = event.eventNumber;
    if (eventNumber != null && suffix === "") {
      const numbered = existing.filter(
        (row) => row.eventNumber === eventNumber,
      );
      const existingByNumber = numbered.length === 1 ? numbered[0] : undefined;
      if (existingByNumber) {
        const decision = resolveImportedEventForMerge(
          {
            eventNumber,
            eventKey: existingByNumber.eventKey,
            stroke: existingByNumber.stroke,
            distance: existingByNumber.distance,
            gender: existingByNumber.gender,
            importedFromFile: existingByNumber.importedFromFile,
          },
          {
            eventNumber,
            eventKey: event.eventKey,
            stroke: event.stroke,
            distance: event.distance,
            gender: event.gender,
          },
          resolutions?.[eventNumber],
        );
        const op =
          decision === "replace" || decision === "refresh" ? decision : "link";
        writes.push({ op, index, slot, eventId: existingByNumber.id });
        continue;
      }
    }

    writes.push({
      op: "add",
      index,
      slot,
      claimEventNumber: eventNumber != null && suffix === "",
    });
  }
  return writes;
}

export type PlannedResultAttachment =
  | { op: "link"; index: number; slot: string; eventId: string }
  | { op: "add"; index: number; slot: string; claimEventNumber: boolean }
  | { op: "skip"; index: number; slot: string; reason: string };

/**
 * Attach results onto events already built for this meet.
 * Same number, suffix, and event identity links. A different identity is
 * refused. A missing number is added. Age group is ignored.
 */
export function planResultAttachmentEvents(
  existing: Array<{
    id: string;
    eventNumber?: number | null;
    eventSuffix?: string | null;
    eventKey: string;
  }>,
  imported: Array<{
    eventNumber?: number | null;
    eventSuffix?: string | null;
    ageGroup?: string | null;
    eventKey: string;
  }>,
): PlannedResultAttachment[] {
  const writes: PlannedResultAttachment[] = [];
  for (let index = 0; index < imported.length; index++) {
    const event = imported[index]!;
    const slot = importedEventSlot(event);
    const number = event.eventNumber;
    const suffix = event.eventSuffix ?? "";
    if (number == null) {
      writes.push({ op: "add", index, slot, claimEventNumber: false });
      continue;
    }

    let identity: (typeof existing)[number] | undefined;
    for (const row of existing) {
      if (
        row.eventNumber === number &&
        (row.eventSuffix ?? "") === suffix &&
        row.eventKey === event.eventKey
      ) {
        identity = row;
        break;
      }
    }
    if (identity) {
      writes.push({ op: "link", index, slot, eventId: identity.id });
      continue;
    }

    let sameSlot = false;
    for (const row of existing) {
      if (row.eventNumber === number && (row.eventSuffix ?? "") === suffix) {
        sameSlot = true;
        break;
      }
    }
    if (sameSlot) {
      writes.push({
        op: "skip",
        index,
        slot,
        reason: `Event #${number}${suffix} on this meet does not match the results file.`,
      });
      continue;
    }

    writes.push({
      op: "add",
      index,
      slot,
      claimEventNumber: suffix === "",
    });
  }
  return writes;
}

/** A relay result is racing legs 1–4, or it is not a result. */
export function planResultRelayLineup(
  existingLegOrders: readonly number[],
): { action: "keep" } | { action: "write" } | { action: "skip" } {
  const racing = new Set<number>();
  for (const order of existingLegOrders) {
    if (order >= 1 && order <= 4) racing.add(order);
  }
  if (racing.size === 4) return { action: "keep" };
  if (racing.size === 0) return { action: "write" };
  return { action: "skip" };
}

export type EntryCountBucket = { individual: number; relay: number };

export type PreparedFileEntry = {
  swimmerName: string;
  eventNumber: number | null;
  membershipId: string | null;
  meetEventId: string | null;
  stroke: string | null;
  eventKey: string | null;
  qualifyingTimeMs: number | null;
  seedTime?: string | null;
  exhibition?: boolean;
};

export type AcceptedFileEntry = {
  membershipId: string;
  meetEventId: string;
  seedTimeMs: number | undefined;
  seedTimeSource: "personal_best" | "no_time";
  exhibition: boolean | undefined;
};

export function planImportedIndividualEntries(
  entries: PreparedFileEntry[],
  limits: MeetEntryLimits | null | undefined,
  counts: Record<string, EntryCountBucket>,
): {
  accepted: AcceptedFileEntry[];
  entriesSkipped: number;
  unmatched: number;
  warnings: string[];
  counts: Record<string, EntryCountBucket>;
} {
  const next: Record<string, EntryCountBucket> = {};
  for (const [id, bucket] of Object.entries(counts)) {
    next[id] = { ...bucket };
  }
  const accepted: AcceptedFileEntry[] = [];
  const warnings: string[] = [];
  let entriesSkipped = 0;
  let unmatched = 0;

  for (const entry of entries) {
    if (!entry.membershipId) {
      unmatched += 1;
      entriesSkipped += 1;
      continue;
    }
    if (!entry.meetEventId || !entry.stroke || !entry.eventKey) {
      entriesSkipped += 1;
      continue;
    }
    const seedTimeMs = entry.seedTime ? parseTime(entry.seedTime) : undefined;
    const bucket = next[entry.membershipId] ?? { individual: 0, relay: 0 };
    const candidateIsRelay = isRelayStroke(entry.stroke, entry.eventKey);
    const limitCheck = canAddMeetEntry(limits, bucket, candidateIsRelay);
    if (!limitCheck.ok) {
      entriesSkipped += 1;
      warnings.push(
        `${entry.swimmerName} event #${entry.eventNumber ?? "?"}: ${limitCheck.reason}`,
      );
      continue;
    }
    const qtCheck = checkQualifyingTime(entry.qualifyingTimeMs, seedTimeMs);
    if (!qtCheck.ok) {
      warnings.push(
        `${entry.swimmerName} event #${entry.eventNumber ?? "?"}: ${qtCheck.reason} (entered anyway)`,
      );
    }
    accepted.push({
      membershipId: entry.membershipId,
      meetEventId: entry.meetEventId,
      seedTimeMs,
      seedTimeSource:
        seedTimeMs != null && seedTimeMs > 0 ? "personal_best" : "no_time",
      exhibition: entry.exhibition,
    });
    if (candidateIsRelay) bucket.relay += 1;
    else bucket.individual += 1;
    next[entry.membershipId] = bucket;
  }

  return { accepted, entriesSkipped, unmatched, warnings, counts: next };
}

/** A file time that can be stored, or a quiet skip that does not count. */
export function planImportedTime(
  time: string | undefined,
  isDq: boolean,
): { ok: true; timeMs: number } | { ok: false } {
  const parsedMs = parseTime(time ?? "");
  if (Number.isFinite(parsedMs) && parsedMs > 0) {
    return { ok: true, timeMs: parsedMs };
  }
  if (isDq) return { ok: true, timeMs: 0 };
  return { ok: false };
}

export type PreparedFileResult = {
  isTeamAthlete: boolean;
  resolved: boolean;
  meetEventId: string | null;
  isRelayEvent: boolean;
  time: string | undefined;
  isDq: boolean;
};

export function planImportedIndividualResult(
  row: PreparedFileResult,
):
  | { outcome: "skip"; countSkipped: boolean; countUnmatched: boolean }
  | { outcome: "import"; timeMs: number }
  | { outcome: "ignore" } {
  if (!row.isTeamAthlete) {
    return { outcome: "skip", countSkipped: true, countUnmatched: false };
  }
  if (!row.resolved) {
    return { outcome: "skip", countSkipped: true, countUnmatched: true };
  }
  if (!row.meetEventId) {
    return { outcome: "skip", countSkipped: true, countUnmatched: false };
  }
  if (row.isRelayEvent) {
    return { outcome: "skip", countSkipped: true, countUnmatched: false };
  }
  const timed = planImportedTime(row.time, row.isDq);
  if (!timed.ok) return { outcome: "ignore" };
  return { outcome: "import", timeMs: timed.timeMs };
}

export function meetImportSummaryWarning(args: {
  looksLikeResults: boolean;
  resultRows: number;
  resultsAdded: number;
  shouldImportEntries: boolean;
  entryRows: number;
  entriesAdded: number;
  entriesSkipped: number;
  entryWarnings: string[];
}): string | undefined {
  let importWarning: string | undefined;
  if (args.looksLikeResults && args.resultRows > 0 && args.resultsAdded === 0) {
    importWarning = `Parsed ${args.resultRows} results but none matched your roster. Map athletes in the review step, or enable “Add unmatched athletes” when identity (DOB/gender) is present.`;
  } else if (
    args.shouldImportEntries &&
    args.entryRows > 0 &&
    args.entriesAdded === 0
  ) {
    importWarning = `Parsed ${args.entryRows} entries but none matched your roster. Map athletes in the review step, or enable “Add unmatched athletes” when identity (DOB/gender) is present.`;
  }

  if (args.entryWarnings.length === 0) return importWarning;
  const sample = [...new Set(args.entryWarnings)].slice(0, 3).join("; ");
  const suffix =
    args.entryWarnings.length > 3
      ? ` (+${args.entryWarnings.length - 3} more)`
      : "";
  const skipPrefix =
    args.entriesSkipped > 0 ? `${args.entriesSkipped} entries skipped. ` : "";
  const limitMsg = `${skipPrefix}${sample}${suffix}`;
  return importWarning ? `${importWarning} ${limitMsg}` : limitMsg;
}
