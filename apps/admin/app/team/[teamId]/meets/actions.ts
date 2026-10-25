"use server";

import { errorCode } from "@lane4hq/analytics";
import { getSession } from "@lane4hq/auth/session";
import { assertFeature } from "@lane4hq/billing/features";
import {
  getOrganizationMeetImportIdentity,
  requireCoachSafeSportCurrent,
  requireTeamMember,
  requireTeamRole,
} from "@lane4hq/db/authz";
import {
  createImportJob,
  getImportJobs,
  updateImportJob,
} from "@lane4hq/db/queries/imports";
import {
  addMeetEntry,
  addMeetEvent,
  addMeetResult,
  createMeet,
  deleteMeet,
  deleteMeetCommitment,
  deleteMeetEntry,
  getBestTimeMs,
  getMeetById,
  getMeetCommitments,
  getMeetEntriesDetailed,
  getMeetEvents,
  getMeetRelayLegs,
  getMeetRelayResultsDetailed,
  getMeetRelayTeams,
  getMeets,
  getRosterBestTimesForEvents,
  replaceMeetRelayLegs,
  replaceMeetRelayTeams,
  setMeetCommitmentRelayOnly,
  updateMeet,
  updateMeetEntry,
  updateMeetEntryStatus,
  updateMeetEvent,
  upsertImportedMeetResult,
  upsertMeetCommitment,
  upsertMeetRelayResult,
} from "@lane4hq/db/queries/meets";
import { patchTeamUiPreferences } from "@lane4hq/db/queries/preferences";
import { recomputeBestTimesForSwimmer } from "@lane4hq/db/queries/progression";
import {
  addSwimmer,
  findSwimmerByGoverningBodyId,
  getRoster,
} from "@lane4hq/db/queries/roster";
import type { MeetEntriesView } from "@lane4hq/db/schema";
import { sendMeetImportComplete } from "@lane4hq/emails";
import { isMinorSwimmer } from "@lane4hq/swim-core/age";
import { formatDateOnly } from "@lane4hq/swim-core/calendar-date";
import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import {
  buildEventKey,
  type EventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import {
  type AdmissionEntryRow,
  admitClearExhibition,
  admitNewIndividualEntry,
  admitRestoredEntry,
} from "@lane4hq/swim-core/individual-entry-admission";
import { suggestIndividualLineup } from "@lane4hq/swim-core/lineup-suggest";
import {
  type FileAthleteMatch,
  fileAthleteKey,
  type MatchFileAthlete,
  type MatchRosterAthlete,
  matchResultAthletes,
} from "@lane4hq/swim-core/meet-athlete-match";
import {
  indexMeetCommitments,
  type MeetAttendanceUiStatus,
} from "@lane4hq/swim-core/meet-attendance";
import {
  detectMeetEventImportConflicts,
  type EventConflictResolution,
} from "@lane4hq/swim-core/meet-import-merge";
import {
  decideImportedAthlete,
  importedEventSlot,
  meetImportSummaryWarning,
  type PreparedFileEntry,
  planImportedEventWrites,
  planImportedIndividualEntries,
  planImportedIndividualResult,
  planImportedTime,
  planResultAttachmentEvents,
  planResultRelayLineup,
} from "@lane4hq/swim-core/meet-import-plan";
import { hostPackLineup } from "@lane4hq/swim-core/meet-lineup-snapshot";
import { normalizePersonName } from "@lane4hq/swim-core/people";
import {
  deriveRelayLetter,
  racingRelayKeysByMember,
  resolveImportedRelayLineup,
} from "@lane4hq/swim-core/relay-legs";
import { matchesTeamCode } from "@lane4hq/swim-core/team-codes";
import { blocksMeetEntries } from "@lane4hq/swim-core/team-types";
import { parseTime } from "@lane4hq/swim-core/times";
import { createMeetSchema } from "@lane4hq/swim-core/validators";
import {
  exportCl2,
  exportMeetZip,
  meetHy3DownloadFilename,
  meetZipDownloadFilename,
  type ParsedMeet,
  type ParsedRelayEntry,
} from "@lane4hq/swim-formats";
import { exportHy3 } from "@lane4hq/swim-formats/hy3";
import {
  detectMeetFileFormat,
  isZipFilename,
  type MeetFileFormat,
  parseMeetFile,
  parseMeetFileFromBytes,
  parseMeetFilesFromBytes,
} from "@lane4hq/swim-formats/meet";
import { exportUssSdif } from "@lane4hq/swim-formats/sdif";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cache } from "react";
import { trackAdmin } from "@/app/analytics";
import { resolvedAssociationCapsForMeet } from "./association-caps";
import {
  loadMeetLineupSnapshot,
  parsedMeetFromLineup,
} from "./load-meet-lineup-snapshot";

function revalidateMeetPaths(teamId: string, meetId?: string) {
  revalidatePath(`/team/${teamId}/meets`);
  revalidatePath(`/team/${teamId}/meets/results`);
  revalidatePath(`/team/${teamId}/progression`);
  revalidatePath(`/team/${teamId}/roster`);
  if (meetId) {
    revalidatePath(`/team/${teamId}/meets/${meetId}`);
    revalidatePath(`/team/${teamId}/meets/${meetId}/events`);
    revalidatePath(`/team/${teamId}/meets/${meetId}/entries`);
    revalidatePath(`/team/${teamId}/meets/${meetId}/registration`);
    revalidatePath(`/team/${teamId}/meets/${meetId}/results`);
    revalidatePath(`/team/${teamId}/meets/${meetId}/report`);
  }
}

async function resolveMembership(
  teamId: string,
  roster: Awaited<ReturnType<typeof getRoster>>,
  swimmerName: string,
  usaMemberId?: string,
) {
  if (usaMemberId) {
    const byId = await findSwimmerByGoverningBodyId(usaMemberId);
    if (byId) {
      const membership = roster.find((r) => r.swimmerId === byId.id);
      if (membership) {
        return {
          membershipId: membership.membershipId,
          swimmerId: membership.swimmerId,
        };
      }
    }
  }

  const target = normalizePersonName(swimmerName);
  const match = roster.find((r) => {
    const full = normalizePersonName(`${r.firstName} ${r.lastName}`);
    const preferred = r.preferredName
      ? normalizePersonName(`${r.preferredName} ${r.lastName}`)
      : "";
    return full === target || preferred === target || full.includes(target);
  });

  if (!match) return null;
  return { membershipId: match.membershipId, swimmerId: match.swimmerId };
}

function splitDisplayName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "Swimmer" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

function toMatchRoster(
  roster: Awaited<ReturnType<typeof getRoster>>,
): MatchRosterAthlete[] {
  return roster.map((r) => ({
    membershipId: r.membershipId,
    swimmerId: r.swimmerId,
    firstName: r.firstName,
    lastName: r.lastName,
    preferredName: r.preferredName,
    dateOfBirth: r.dateOfBirth,
    governingBodyId: r.governingBodyId,
  }));
}

/**
 * All athlete identities referenced by a parsed meet file — entries AND
 * results. Both need Team Manager–style roster matching (map/skip/add)
 * before import; results-only matching let unmatched entries slip through
 * silently.
 */
function collectFileAthletes(parsed: ParsedMeet): MatchFileAthlete[] {
  const fromResults = parsed.results.map((r) => ({
    swimmerName: r.swimmerName,
    usaMemberId: r.usaMemberId,
    dateOfBirth: r.dateOfBirth,
    gender: r.gender,
    teamCode: r.teamCode,
  }));
  const fromEntries = parsed.entries.map((e) => ({
    swimmerName: e.swimmerName,
    usaMemberId: e.usaMemberId,
    dateOfBirth: e.dateOfBirth,
    gender: e.gender,
  }));
  const fromRelays = (parsed.relays ?? []).flatMap((relay) =>
    relay.swimmerNames.map((swimmerName) => ({
      swimmerName,
      teamCode: relay.teamCode,
    })),
  );
  return [...fromResults, ...fromEntries, ...fromRelays];
}

function isTeamResultAthlete(
  athlete: MatchFileAthlete,
  identity: { teamCode: string | null; lscCode: string | null } | null,
): boolean {
  return matchesTeamCode(
    athlete.teamCode,
    identity?.teamCode,
    identity?.lscCode,
  );
}

export type AthleteMapAction = string | "skip" | "create";

async function createAthleteFromFile(
  teamId: string,
  userId: string | undefined,
  roster: Awaited<ReturnType<typeof getRoster>>,
  athlete: {
    swimmerName: string;
    usaMemberId?: string;
    dateOfBirth?: string;
    gender?: "male" | "female";
  },
  createdKeys: Set<string>,
): Promise<{ membershipId: string; swimmerId: string } | null> {
  if (!athlete.dateOfBirth || !athlete.gender) return null;

  const { firstName, lastName } = splitDisplayName(athlete.swimmerName);
  const dedupeKey = [
    normalizePersonName(firstName),
    normalizePersonName(lastName),
    athlete.dateOfBirth,
  ].join("|");
  if (createdKeys.has(dedupeKey)) {
    const cached = roster.find(
      (r) =>
        normalizePersonName(r.firstName) === normalizePersonName(firstName) &&
        normalizePersonName(r.lastName) === normalizePersonName(lastName) &&
        r.dateOfBirth === athlete.dateOfBirth,
    );
    if (cached) {
      return {
        membershipId: cached.membershipId,
        swimmerId: cached.swimmerId,
      };
    }
  }

  if (isMinorSwimmer(athlete.dateOfBirth)) {
    await requireCoachSafeSportCurrent(userId, teamId);
  }

  const added = await addSwimmer(
    teamId,
    {
      firstName,
      lastName,
      dateOfBirth: athlete.dateOfBirth,
      gender: athlete.gender,
      usaMemberId: athlete.usaMemberId,
    },
    { viewerUserId: userId },
  );

  createdKeys.add(dedupeKey);
  roster.push({
    membershipId: added.membershipId,
    enrollmentId: "",
    seasonId: "",
    swimmerId: added.swimmerId,
    firstName,
    middleName: null,
    lastName,
    preferredName: null,
    dateOfBirth: athlete.dateOfBirth,
    gender: athlete.gender,
    governingBodyId: athlete.usaMemberId ?? null,
    practiceGroup: null,
    trainingGroups: null,
    groupId: null,
    groupName: null,
    classYear: null,
    academicStanding: null,
    eligibilityStatus: null,
    seasonsOfCompetitionUsed: null,
    eligibilityNotes: null,
    status: "active",
    joinedAt: new Date(),
  });

  return {
    membershipId: added.membershipId,
    swimmerId: added.swimmerId,
  };
}

export async function createMeetAction(teamId: string, formData: FormData) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);

  const parsed = createMeetSchema.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    entryDeadline: formData.get("entryDeadline") || undefined,
    course: formData.get("course"),
    location: formData.get("location") || undefined,
    address: formData.get("address") || undefined,
    opponents: String(formData.get("opponents") ?? ""),
  });

  const id = await createMeet(teamId, parsed);
  revalidateMeetPaths(teamId, id);
  trackAdmin("meet_created", session?.user?.id, teamId);
  return id;
}

function isFileBackedMeet(importSource: string | null | undefined) {
  return Boolean(importSource?.trim());
}

/** Empty string clears the limit (null); missing field leaves it unchanged. */
function optionalInt(
  value: FormDataEntryValue | null,
): number | null | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function updateMeetAction(
  teamId: string,
  meetId: string,
  formData: FormData,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);

  const parsed = createMeetSchema.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    entryDeadline: String(formData.get("entryDeadline") ?? ""),
    course: formData.get("course"),
    location: formData.get("location") || undefined,
    address: formData.get("address") || undefined,
    opponents: String(formData.get("opponents") ?? ""),
  });

  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const fileBacked = isFileBackedMeet(meet.importSource);
  const maxIndividualEntries = optionalInt(
    formData.get("maxIndividualEntries"),
  );
  const maxRelayEntries = optionalInt(formData.get("maxRelayEntries"));
  const maxCombinedEntries = optionalInt(formData.get("maxCombinedEntries"));
  const maxScoringEntriesPerIndividualEvent = optionalInt(
    formData.get("maxScoringEntriesPerIndividualEvent"),
  );
  const maxRelayTeamsPerEvent = optionalInt(
    formData.get("maxRelayTeamsPerEvent"),
  );
  const hasManualLimits =
    !fileBacked &&
    (maxIndividualEntries !== undefined ||
      maxRelayEntries !== undefined ||
      maxCombinedEntries !== undefined);

  const updated = await updateMeet(meetId, teamId, {
    ...parsed,
    course: fileBacked ? meet.course : parsed.course,
    ...(fileBacked
      ? {}
      : {
          ...(maxIndividualEntries !== undefined
            ? { maxIndividualEntries }
            : {}),
          ...(maxRelayEntries !== undefined ? { maxRelayEntries } : {}),
          ...(maxCombinedEntries !== undefined ? { maxCombinedEntries } : {}),
          ...(hasManualLimits ? { entryLimitsSource: "manual" as const } : {}),
        }),
    ...(maxScoringEntriesPerIndividualEvent !== undefined
      ? {
          maxScoringEntriesPerIndividualEvent:
            maxScoringEntriesPerIndividualEvent != null &&
            maxScoringEntriesPerIndividualEvent > 0
              ? maxScoringEntriesPerIndividualEvent
              : null,
        }
      : {}),
    ...(maxRelayTeamsPerEvent !== undefined
      ? {
          maxRelayTeamsPerEvent:
            maxRelayTeamsPerEvent != null && maxRelayTeamsPerEvent > 0
              ? maxRelayTeamsPerEvent
              : null,
        }
      : {}),
  });
  if (!updated) throw new Error("Meet not found");

  revalidateMeetPaths(teamId, meetId);
}

export async function saveMeetEntriesViewAction(
  teamId: string,
  view: MeetEntriesView,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { ok: false, error: "Unauthorized" };
    }
    await requireTeamMember(session.user.id, teamId);
    if (view !== "swimmer" && view !== "event") {
      return { ok: false, error: "Invalid entries view" };
    }
    await patchTeamUiPreferences(session.user.id, teamId, {
      meetEntriesView: view,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save entries view",
    };
  }
}

export type MeetImportPreview = {
  name: string;
  startDate?: string;
  endDate?: string;
  entryDeadline?: string;
  course: "SCY" | "SCM" | "LCM";
  location?: string;
  address?: string;
  events: Array<{
    eventNumber?: number;
    stroke: string;
    distance: number;
    gender: string;
    ageGroup?: string;
    eventKey: string;
    eventSuffix?: string;
    qualifyingTimeMs?: number;
    eventKind?: "swim" | "dive";
    diveCount?: number;
  }>;
  entryCount: number;
  resultCount: number;
  exhibitionCount?: number;
  /** Dive events skipped when parse used `includeDiveEvents: false`. */
  skippedDiveEvents?: number;
  entryLimits?: {
    maxIndividualEntries?: number;
    maxRelayEntries?: number;
    maxCombinedEntries?: number;
    packages?: Array<{ individual: number; relay: number }>;
  };
  format: MeetFileFormat;
  /** Inner filename(s) when the upload was a ZIP container. */
  sourceFilename?: string;
  sourceFiles?: string[];
  /** Present when the file has results — Team Manager–style roster matching. */
  athleteMatch?: {
    matchedCount: number;
    reviewCount: number;
    unmatchedResultCount: number;
    reviewAthletes: FileAthleteMatch[];
    rosterOptions: Array<{
      membershipId: string;
      displayName: string;
    }>;
  };
  eventConflicts?: Array<{
    eventNumber: number;
    manual: {
      eventNumber: number | null;
      eventKey: string;
      stroke: string;
      distance: number;
      gender: string;
      importedFromFile?: boolean;
    };
    imported: {
      eventNumber: number | null;
      eventKey: string;
      stroke: string;
      distance: number;
      gender: string;
    };
  }>;
  /** Results file: attach times to a meet that already exists. */
  resultsFile: boolean;
  /** Existing meet whose name and start date match this results file. */
  suggestedMeetId?: string | null;
};

function fileLooksLikeResults(parsed: ParsedMeet): boolean {
  if (parsed.importKind === "results") return true;
  if (parsed.importKind === "entries") return false;
  if (parsed.results.length > 0) return true;
  return (parsed.relays ?? []).some(
    (relay) => (relay.results?.length ?? 0) > 0,
  );
}

function decodeMeetFilePayload(
  content: string,
  filename: string,
  encoding: "utf8" | "base64" = "utf8",
): {
  format: MeetFileFormat;
  parsed: ParsedMeet;
  sourceFilename?: string;
  sourceFiles?: string[];
} {
  if (isZipFilename(filename)) {
    if (encoding !== "base64") {
      throw new Error(
        "ZIP meet packs must upload as binary files. Re-select the file and try again.",
      );
    }
    const bytes = Uint8Array.from(Buffer.from(content, "base64"));
    const parsed = parseMeetFileFromBytes(bytes, filename) as ParsedMeet & {
      sourceFiles?: string[];
      zipFormat?: MeetFileFormat;
    };
    const sourceFiles = parsed.sourceFiles;
    const format =
      parsed.zipFormat ??
      (detectMeetFileFormat(sourceFiles?.[0] ?? filename) as MeetFileFormat) ??
      "cl2";
    return {
      format,
      parsed,
      sourceFilename: sourceFiles?.join(" + "),
      sourceFiles,
    };
  }

  const format = detectMeetFileFormat(
    filename,
    encoding === "utf8" ? content : undefined,
  );
  if (!format) {
    throw new Error(
      "This file isn't a supported meet format. Upload an SD3/SDIF, HY3, EV3, HYV, CL2, XLS, or ZIP file exported from Meet Manager or Team Manager.",
    );
  }

  if (format === "xls") {
    if (encoding !== "base64") {
      throw new Error(
        "XLS meet reports must upload as binary files. Re-select the file and try again.",
      );
    }
    const bytes = Uint8Array.from(Buffer.from(content, "base64"));
    return {
      format,
      parsed: parseMeetFileFromBytes(bytes, filename),
    };
  }

  if (encoding === "base64") {
    const text = Buffer.from(content, "base64").toString("utf8");
    return {
      format,
      parsed: parseMeetFile(text, format),
    };
  }

  return {
    format,
    parsed: parseMeetFile(content, format),
  };
}

export type MeetImportFilePayload = {
  content: string;
  filename: string;
  encoding?: "utf8" | "base64";
};

/**
 * Decode one or more uploaded meet files. A single file preserves the exact
 * extension-or-content sniffing behavior of `decodeMeetFilePayload`; two or
 * more non-ZIP files (e.g. a Hy-Tek HFILE + CFILE pair) are merged
 * server-side via `parseMeetFilesFromBytes`, so coaches don't need to zip
 * companion files themselves.
 */
function decodeMeetFilesPayload(files: MeetImportFilePayload[]): {
  format: MeetFileFormat;
  parsed: ParsedMeet;
  sourceFilename?: string;
  sourceFiles?: string[];
} {
  if (files.length === 0) {
    throw new Error("Select at least one meet file to import.");
  }

  if (files.length === 1) {
    const [file] = files;
    return decodeMeetFilePayload(
      file!.content,
      file!.filename,
      file!.encoding ?? "utf8",
    );
  }

  const byteFiles = files.map((file) => {
    const encoding = file.encoding ?? "utf8";
    const bytes =
      encoding === "base64"
        ? Uint8Array.from(Buffer.from(file.content, "base64"))
        : new TextEncoder().encode(file.content);
    return { filename: file.filename, bytes };
  });

  const parsed = parseMeetFilesFromBytes(byteFiles) as ParsedMeet & {
    sourceFiles?: string[];
    zipFormat?: MeetFileFormat;
  };
  const sourceFiles = parsed.sourceFiles;
  const format =
    parsed.zipFormat ??
    (detectMeetFileFormat(
      sourceFiles?.[0] ?? byteFiles[0]!.filename,
    ) as MeetFileFormat) ??
    "cl2";

  return {
    format,
    parsed,
    sourceFilename: sourceFiles?.join(" + "),
    sourceFiles,
  };
}

/**
 * Parse one or more companion meet files and return a JSON-serializable
 * preview (no DB writes). Pass a single-item array for a normal upload, or
 * multiple non-ZIP files (e.g. HFILE + CFILE) to merge them server-side.
 */
export async function parseMeetFilePreviewAction(
  teamId: string,
  files: MeetImportFilePayload[],
  options?: { meetId?: string },
): Promise<MeetImportPreview> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "meet_import");

  const { format, parsed, sourceFilename, sourceFiles } =
    decodeMeetFilesPayload(files);

  const resultsFile = fileLooksLikeResults(parsed);
  const [roster, importIdentity, existingMeets] = await Promise.all([
    getRoster(teamId),
    getOrganizationMeetImportIdentity(teamId),
    resultsFile ? getMeets(teamId) : Promise.resolve([]),
  ]);
  const allFileAthletes = collectFileAthletes(parsed);
  const fileAthletes =
    parsed.results.length > 0
      ? allFileAthletes.filter((athlete) =>
          isTeamResultAthlete(athlete, importIdentity),
        )
      : allFileAthletes;
  const matchBundle =
    fileAthletes.length > 0
      ? matchResultAthletes(toMatchRoster(roster), fileAthletes)
      : null;

  let eventConflicts: MeetImportPreview["eventConflicts"];
  if (options?.meetId) {
    const meet = await getMeetById(options.meetId, teamId);
    if (meet) {
      const existingEvents = await getMeetEvents(options.meetId);
      eventConflicts = detectMeetEventImportConflicts(
        existingEvents.map((event) => ({
          eventNumber: event.eventNumber,
          eventKey: event.eventKey,
          stroke: event.stroke,
          distance: event.distance,
          gender: event.gender,
          importedFromFile: event.importedFromFile,
        })),
        parsed.events.map((event) => ({
          eventNumber: event.eventNumber ?? null,
          eventKey: event.eventKey,
          stroke: event.stroke,
          distance: event.distance,
          gender: event.gender,
        })),
      );
    }
  }

  return {
    name: parsed.name,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    entryDeadline: parsed.entryDeadline,
    course: parsed.course,
    location: parsed.location,
    address: parsed.address,
    events: parsed.events.map((e) => ({
      eventNumber: e.eventNumber,
      stroke: e.stroke,
      distance: e.distance,
      gender: e.gender,
      ageGroup: e.ageGroup,
      eventKey: e.eventKey,
      eventSuffix: e.eventSuffix,
      qualifyingTimeMs: e.qualifyingTimeMs,
      eventKind: e.eventKind,
      diveCount: e.diveCount,
    })),
    entryCount: parsed.entries.length,
    resultCount: parsed.results.length,
    exhibitionCount: parsed.entries.filter((e) => e.exhibition).length,
    skippedDiveEvents: parsed.skippedDiveEvents,
    entryLimits: parsed.entryLimits,
    format,
    sourceFilename,
    sourceFiles,
    athleteMatch: matchBundle
      ? {
          matchedCount: matchBundle.matched.length,
          reviewCount:
            matchBundle.ambiguous.length + matchBundle.unmatched.length,
          unmatchedResultCount: matchBundle.unmatched.reduce(
            (sum, a) => sum + a.resultCount,
            0,
          ),
          reviewAthletes: [
            ...matchBundle.ambiguous,
            ...matchBundle.unmatched,
          ].slice(0, 100),
          rosterOptions: [...roster]
            .map((r) => ({
              membershipId: r.membershipId,
              displayName:
                `${r.preferredName?.trim() || r.firstName} ${r.lastName}`.trim(),
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        }
      : undefined,
    eventConflicts,
    resultsFile,
    suggestedMeetId: resultsFile
      ? findMatchingMeetId(existingMeets, parsed)
      : null,
  };
}

export type MeetImportReviewOverrides = {
  name?: string;
  startDate?: string;
  /** Empty string clears an imported end date. */
  endDate?: string;
  /** Empty string clears an imported host entry deadline. */
  entryDeadline?: string;
  course?: "SCY" | "SCM" | "LCM";
  location?: string;
  address?: string;
  opponents?: string;
  maxIndividualEntries?: number | null;
  maxRelayEntries?: number | null;
  maxCombinedEntries?: number | null;
  events?: Array<{
    eventNumber?: number;
    stroke: string;
    distance: number;
    gender: string;
    ageGroup?: string;
    eventKey: string;
    eventSuffix?: string;
    qualifyingTimeMs?: number;
    eventKind?: "swim" | "dive";
    diveCount?: number;
  }>;
};

function resolveEntryLimitsForImport(
  parsed: ParsedMeet,
  review?: MeetImportReviewOverrides,
): {
  maxIndividualEntries?: number | null;
  maxRelayEntries?: number | null;
  maxCombinedEntries?: number | null;
  entryLimitPackages?: Array<{ individual: number; relay: number }> | null;
  entryLimitsSource?: string | null;
} {
  const fromReview =
    review?.maxIndividualEntries !== undefined ||
    review?.maxRelayEntries !== undefined ||
    review?.maxCombinedEntries !== undefined;

  if (fromReview) {
    const hadFileLimits = Boolean(parsed.entryLimits);
    return {
      maxIndividualEntries: review?.maxIndividualEntries ?? null,
      maxRelayEntries: review?.maxRelayEntries ?? null,
      maxCombinedEntries: review?.maxCombinedEntries ?? null,
      entryLimitPackages: parsed.entryLimits?.packages ?? null,
      entryLimitsSource: hadFileLimits ? "import" : "manual",
    };
  }

  if (parsed.entryLimits) {
    return {
      maxIndividualEntries: parsed.entryLimits.maxIndividualEntries ?? null,
      maxRelayEntries: parsed.entryLimits.maxRelayEntries ?? null,
      maxCombinedEntries: parsed.entryLimits.maxCombinedEntries ?? null,
      entryLimitPackages: parsed.entryLimits.packages ?? null,
      entryLimitsSource: "import",
    };
  }

  return {};
}

async function applyFileOwnedMeetFields(
  meetId: string,
  teamId: string,
  meet: NonNullable<Awaited<ReturnType<typeof getMeetById>>>,
  parsed: ParsedMeet,
  format: string,
  review: MeetImportReviewOverrides | undefined,
  extra: {
    maxIndividualEntries?: number | null;
    maxRelayEntries?: number | null;
    maxCombinedEntries?: number | null;
    entryLimitPackages?: Array<{ individual: number; relay: number }> | null;
    entryLimitsSource?: string | null;
  },
) {
  await updateMeet(meetId, teamId, {
    name: review?.name ?? meet.name,
    startDate: review?.startDate ?? formatDateOnly(meet.startDate),
    endDate:
      review?.endDate !== undefined
        ? review.endDate || undefined
        : meet.endDate
          ? formatDateOnly(meet.endDate)
          : undefined,
    entryDeadline:
      review?.entryDeadline !== undefined
        ? review.entryDeadline
        : meet.entryDeadline
          ? formatDateOnly(meet.entryDeadline)
          : undefined,
    course: review?.course ?? parsed.course ?? meet.course,
    location:
      review?.location !== undefined
        ? review.location
        : (meet.location ?? undefined),
    address:
      review?.address !== undefined
        ? review.address
        : (meet.address ?? undefined),
    importSource: isFileBackedMeet(meet.importSource)
      ? meet.importSource
      : format,
    ...(review?.opponents?.trim()
      ? { opponents: review.opponents.trim() }
      : {}),
    ...extra,
  });
}

export async function importMeetFileAction(
  teamId: string,
  files: MeetImportFilePayload[],
  options?: {
    /** Attach to this meet instead of creating one */
    meetId?: string | null;
    /**
     * When no meetId is set: "auto" creates a meet for event/entry files,
     * but links results-heavy files to a matching existing meet when found.
     * "new" always creates. "existing" requires meetId.
     */
    target?: "auto" | "new" | "existing";
    /** Optional coach edits from the import review step */
    review?: MeetImportReviewOverrides;
    /**
     * Per file-athlete resolution from the review step.
     * Values: roster membershipId | "skip" | "create".
     */
    athleteMaps?: Record<string, AthleteMapAction>;
    /**
     * When true, create roster athletes for unmatched entries/results that
     * include DOB+gender (Team Manager “Add New Teams/Athletes”). Default
     * false.
     */
    addNewAthletes?: boolean;
    eventConflictResolutions?: Record<number, EventConflictResolution>;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "meet_import");

  const { format, parsed: peek } = decodeMeetFilesPayload(files);

  const target = options?.target ?? "auto";
  if (target === "existing" && !options?.meetId) {
    trackAdmin("import_failed", session?.user?.id, teamId, {
      format,
      error_code: "validation",
    });
    throw new Error("Select a meet to attach this file to.");
  }

  // Peek at content to choose job type before processing
  const looksLikeResults = fileLooksLikeResults(peek);
  const shouldImportEntries =
    peek.importKind === "entries" ||
    (!looksLikeResults && peek.entries.length > 0) ||
    (peek.importKind == null &&
      peek.results.length === 0 &&
      peek.entries.length > 0);
  const jobType = looksLikeResults
    ? "meet_results"
    : peek.importKind === "entries" ||
        (shouldImportEntries && peek.events.length === 0)
      ? "meet_entries"
      : "meet_events";

  const jobId = await createImportJob(teamId, jobType);
  await updateImportJob(jobId, { status: "processing" });

  try {
    const parsed = peek;
    const review = options?.review;
    if (review?.name) parsed.name = review.name;
    if (review?.startDate) parsed.startDate = review.startDate;
    if (review?.endDate !== undefined) {
      parsed.endDate = review.endDate || undefined;
    }
    if (review?.entryDeadline !== undefined) {
      parsed.entryDeadline = review.entryDeadline || undefined;
    }
    if (review?.course) parsed.course = review.course;
    if (review?.location !== undefined) parsed.location = review.location;
    if (review?.address !== undefined) parsed.address = review.address;
    const attachingResults = looksLikeResults && Boolean(options?.meetId);
    if (!attachingResults && !parsed.entryDeadline?.trim()) {
      throw new Error(
        "Enter the host entry deadline before importing this meet file.",
      );
    }
    if (!attachingResults && review?.events?.length) {
      parsed.events = review.events.map((e) => ({
        eventNumber: e.eventNumber,
        stroke: e.stroke,
        distance: e.distance,
        gender: e.gender as ParsedMeet["events"][number]["gender"],
        ageGroup: e.ageGroup,
        eventKey: e.eventKey,
        eventSuffix: e.eventSuffix,
        qualifyingTimeMs: e.qualifyingTimeMs,
        eventKind: e.eventKind,
        diveCount: e.diveCount,
      }));
    }

    const entryLimitFields = resolveEntryLimitsForImport(parsed, review);
    const [roster, existingMeets, importIdentity] = await Promise.all([
      getRoster(teamId),
      getMeets(teamId),
      getOrganizationMeetImportIdentity(teamId),
    ]);

    let meetId = options?.meetId ?? null;
    let linkedExisting = false;

    if (meetId) {
      const meet = await getMeetById(meetId, teamId);
      if (!meet) throw new Error("Meet not found");
      linkedExisting = true;
      if (!looksLikeResults) {
        await applyFileOwnedMeetFields(
          meetId,
          teamId,
          meet,
          parsed,
          format,
          review,
          entryLimitFields,
        );
      }
    } else if (target === "new") {
      meetId = await createMeet(teamId, {
        name: parsed.name,
        startDate: parsed.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: parsed.endDate,
        entryDeadline: parsed.entryDeadline,
        course: parsed.course,
        location: parsed.location,
        address: parsed.address,
        opponents: review?.opponents?.trim() || undefined,
        importSource: format,
        ...entryLimitFields,
      });
    } else {
      // auto: prefer linking results onto an existing meet when we can match
      if (looksLikeResults) {
        const matchId = findMatchingMeetId(existingMeets, parsed);
        if (matchId) {
          meetId = matchId;
          linkedExisting = true;
        }
      }

      if (!meetId) {
        meetId = await createMeet(teamId, {
          name: parsed.name,
          startDate: parsed.startDate ?? new Date().toISOString().slice(0, 10),
          endDate: parsed.endDate,
          entryDeadline: parsed.entryDeadline,
          course: parsed.course,
          location: parsed.location,
          address: parsed.address,
          opponents: review?.opponents?.trim() || undefined,
          importSource: format,
          ...entryLimitFields,
        });
      }
    }

    const existingEvents = await getMeetEvents(meetId);
    const eventIdByNumber = new Map<number, string>();
    const eventIdBySlot = new Map<string, string>();
    let fallbackEventId: string | undefined;

    const importSlot = importedEventSlot;

    for (const event of existingEvents) {
      eventIdBySlot.set(importSlot(event), event.id);
      if (
        event.eventNumber != null &&
        !eventIdByNumber.has(event.eventNumber)
      ) {
        eventIdByNumber.set(event.eventNumber, event.id);
      }
      fallbackEventId ??= event.id;
    }

    let eventsAdded = 0;
    const attachmentWarnings: string[] = [];
    const skippedAttachmentReasons = new Map<string, string>();
    const eventWrites = attachingResults
      ? planResultAttachmentEvents(existingEvents, parsed.events)
      : planImportedEventWrites(
          existingEvents,
          parsed.events,
          options?.eventConflictResolutions,
        );
    for (const write of eventWrites) {
      const event = parsed.events[write.index];
      if (!event) continue;
      if (write.op === "skip") {
        skippedAttachmentReasons.set(write.slot, write.reason);
        attachmentWarnings.push(write.reason);
        continue;
      }
      if (write.op === "add") {
        const eventId = await addMeetEvent(meetId, {
          ...event,
          course: parsed.course,
          importedFromFile: true,
        });
        eventIdBySlot.set(write.slot, eventId);
        if (
          write.claimEventNumber &&
          event.eventNumber != null &&
          !eventIdByNumber.has(event.eventNumber)
        ) {
          eventIdByNumber.set(event.eventNumber, eventId);
        }
        fallbackEventId ??= eventId;
        eventsAdded++;
        continue;
      }
      eventIdBySlot.set(write.slot, write.eventId);
      if (write.op === "refresh") {
        await updateMeetEvent(write.eventId, meetId, {
          ageGroup: event.ageGroup ?? null,
          qualifyingTimeMs: event.qualifyingTimeMs ?? null,
        });
      } else if (write.op === "replace") {
        await updateMeetEvent(write.eventId, meetId, {
          stroke: event.stroke,
          distance: event.distance,
          gender: event.gender,
          eventKey: event.eventKey,
          ageGroup: event.ageGroup ?? null,
          qualifyingTimeMs: event.qualifyingTimeMs ?? null,
          course: parsed.course,
        });
      }
    }

    let entriesAdded = 0;
    let resultsAdded = 0;
    let unmatched = 0;
    let swimmersCreated = 0;
    let resultsSkipped = 0;
    let entriesSkipped = 0;
    const resultSwimmerIds = new Set<string>();
    const createdAthleteKeys = new Set<string>();
    const athleteMaps = options?.athleteMaps ?? {};
    const addNewAthletes = options?.addNewAthletes === true;

    // Entries AND results need Team Manager–style roster matching: files
    // routinely include athletes from other teams (results) or swimmers not
    // yet on this team's roster (entries). Matching both up front means an
    // unmatched entry surfaces the same Map/Skip/Add-to-roster review as an
    // unmatched result, instead of being dropped silently.
    const allFileAthletes = collectFileAthletes(parsed);
    const fileAthletes = looksLikeResults
      ? allFileAthletes.filter((athlete) =>
          isTeamResultAthlete(athlete, importIdentity),
        )
      : allFileAthletes;
    const matchBundle =
      fileAthletes.length > 0
        ? matchResultAthletes(toMatchRoster(roster), fileAthletes)
        : null;
    const resolvedByKey = new Map<
      string,
      { membershipId: string; swimmerId: string; created: boolean }
    >();

    if (matchBundle) {
      for (const athlete of matchBundle.athletes) {
        const decision = decideImportedAthlete({
          athlete,
          mapAction: athleteMaps[athlete.key],
          roster,
          addNewAthletes,
        });
        if (decision.kind === "skip") continue;
        if (decision.kind === "resolved") {
          resolvedByKey.set(athlete.key, {
            membershipId: decision.membershipId,
            swimmerId: decision.swimmerId,
            created: false,
          });
          continue;
        }

        const created = await createAthleteFromFile(
          teamId,
          session?.user?.id,
          roster,
          athlete,
          createdAthleteKeys,
        );
        if (created) {
          resolvedByKey.set(athlete.key, { ...created, created: true });
          swimmersCreated++;
        }
      }
    }

    const meetRecord = await getMeetById(meetId, teamId);
    if (!meetRecord) throw new Error("Meet not found");

    const meetEventsList = await getMeetEvents(meetId);
    const eventDetailById = new Map<
      string,
      {
        stroke: string;
        eventKey: string;
        qualifyingTimeMs: number | null;
      }
    >(
      meetEventsList.map((e) => [
        e.id,
        {
          stroke: e.stroke,
          eventKey: e.eventKey,
          qualifyingTimeMs: e.qualifyingTimeMs,
        },
      ]),
    );

    function registerEventDetail(
      id: string,
      detail: {
        stroke: string;
        eventKey: string;
        qualifyingTimeMs?: number | null;
      },
    ) {
      eventDetailById.set(id, {
        stroke: detail.stroke,
        eventKey: detail.eventKey,
        qualifyingTimeMs: detail.qualifyingTimeMs ?? null,
      });
    }

    async function eventIdFor(
      num?: number,
      options?: { allowFallback?: boolean; eventSuffix?: string },
    ) {
      const allowFallback = options?.allowFallback !== false;
      const suffix = options?.eventSuffix ?? "";
      if (num != null) {
        const matches = parsed.events.filter(
          (event) =>
            event.eventNumber === num && (event.eventSuffix ?? "") === suffix,
        );
        for (const match of matches) {
          const id = eventIdBySlot.get(importSlot(match));
          if (id) return id;
        }
        if (attachingResults) return undefined;
        if (!suffix && eventIdByNumber.has(num)) {
          return eventIdByNumber.get(num)!;
        }
      }
      if (attachingResults) return undefined;
      const fromParsed =
        num != null
          ? parsed.events.find(
              (event) =>
                event.eventNumber === num &&
                (event.eventSuffix ?? "") === suffix,
            )
          : undefined;
      if (fromParsed) {
        const existingId = eventIdBySlot.get(importSlot(fromParsed));
        if (existingId) return existingId;
        const eventId = await addMeetEvent(meetId!, {
          ...fromParsed,
          course: parsed.course,
          importedFromFile: true,
        });
        registerEventDetail(eventId, fromParsed);
        eventIdBySlot.set(importSlot(fromParsed), eventId);
        if (num != null && !suffix && !eventIdByNumber.has(num)) {
          eventIdByNumber.set(num, eventId);
        }
        fallbackEventId ??= eventId;
        return eventId;
      }
      if (!allowFallback) return undefined;
      if (fallbackEventId) return fallbackEventId;
      const fallbackKey = `50_free_${parsed.course.toLowerCase()}_m`;
      const eventId = await addMeetEvent(meetId!, {
        eventNumber: num,
        stroke: "free",
        distance: 50,
        gender: "male",
        eventKey: fallbackKey,
        course: parsed.course,
      });
      registerEventDetail(eventId, {
        stroke: "free",
        eventKey: fallbackKey,
        qualifyingTimeMs: null,
      });
      return eventId;
    }

    const existingEntries = await getMeetEntriesDetailed(meetId);
    const occupiedEntryKeys = new Set<string>();
    const entryCounts: Record<string, { individual: number; relay: number }> =
      {};
    for (const e of existingEntries) {
      if (e.status === "scratched") continue;
      occupiedEntryKeys.add(`${e.membershipId}:${e.meetEventId}`);
      const counts = entryCounts[e.membershipId] ?? {
        individual: 0,
        relay: 0,
      };
      if (isRelayStroke(e.stroke, e.eventKey)) counts.relay += 1;
      else counts.individual += 1;
      entryCounts[e.membershipId] = counts;
    }

    const preparedEntries: PreparedFileEntry[] = [];
    for (const entry of shouldImportEntries ? parsed.entries : []) {
      const resolved = resolvedByKey.get(fileAthleteKey(entry)) ?? null;
      if (!resolved) {
        preparedEntries.push({
          swimmerName: entry.swimmerName,
          eventNumber: entry.eventNumber ?? null,
          membershipId: null,
          meetEventId: null,
          stroke: null,
          eventKey: null,
          qualifyingTimeMs: null,
          seedTime: entry.seedTime,
          exhibition: entry.exhibition,
        });
        continue;
      }
      const meetEventId = await eventIdFor(entry.eventNumber, {
        eventSuffix: entry.eventSuffix,
      });
      const eventDetail = meetEventId
        ? eventDetailById.get(meetEventId)
        : undefined;
      preparedEntries.push({
        swimmerName: entry.swimmerName,
        eventNumber: entry.eventNumber ?? null,
        membershipId: resolved.membershipId,
        meetEventId: meetEventId ?? null,
        stroke: eventDetail?.stroke ?? null,
        eventKey: eventDetail?.eventKey ?? null,
        qualifyingTimeMs: eventDetail?.qualifyingTimeMs ?? null,
        seedTime: entry.seedTime,
        exhibition: entry.exhibition,
      });
    }

    const plannedEntries = planImportedIndividualEntries(
      preparedEntries,
      {
        maxIndividualEntries: meetRecord.maxIndividualEntries,
        maxRelayEntries: meetRecord.maxRelayEntries,
        maxCombinedEntries: meetRecord.maxCombinedEntries,
        entryLimitPackages: meetRecord.entryLimitPackages,
      },
      entryCounts,
    );
    entriesSkipped += plannedEntries.entriesSkipped;
    unmatched += plannedEntries.unmatched;
    const entryWarnings = plannedEntries.warnings;
    for (const accepted of plannedEntries.accepted) {
      await addMeetEntry(
        meetId,
        accepted.meetEventId,
        accepted.membershipId,
        accepted.seedTimeMs,
        undefined,
        "draft",
        accepted.seedTimeSource,
        accepted.exhibition,
      );
      occupiedEntryKeys.add(`${accepted.membershipId}:${accepted.meetEventId}`);
      entriesAdded++;
    }

    for (const result of parsed.results) {
      const isTeamAthlete = isTeamResultAthlete(result, importIdentity);
      let resolved = resolvedByKey.get(fileAthleteKey(result)) ?? null;
      if (isTeamAthlete && !resolved && !looksLikeResults) {
        const membership = await resolveMembership(
          teamId,
          roster,
          result.swimmerName,
          result.usaMemberId,
        );
        if (membership) {
          resolved = { ...membership, created: false };
        }
      }

      let meetEventId: string | undefined;
      let isRelayEvent = false;
      if (isTeamAthlete && resolved) {
        meetEventId = await eventIdFor(result.eventNumber, {
          eventSuffix: result.eventSuffix,
        });
        const eventMeta = meetEventId
          ? eventDetailById.get(meetEventId)
          : undefined;
        isRelayEvent = Boolean(
          eventMeta && isRelayStroke(eventMeta.stroke, eventMeta.eventKey),
        );
      }

      const plannedResult = planImportedIndividualResult({
        isTeamAthlete,
        resolved: Boolean(resolved),
        meetEventId: meetEventId ?? null,
        isRelayEvent,
        time: result.time,
        isDq: result.isDq === true,
      });
      if (plannedResult.outcome === "skip") {
        if (plannedResult.countSkipped) resultsSkipped++;
        if (plannedResult.countUnmatched) unmatched++;
        continue;
      }
      if (plannedResult.outcome === "ignore" || !resolved || !meetEventId) {
        continue;
      }

      await upsertImportedMeetResult(
        meetId,
        meetEventId,
        resolved.swimmerId,
        plannedResult.timeMs,
        {
          place: result.place,
          isDq: result.isDq,
          splitTimes: result.splitsMs,
          round: result.resultType,
          heat: result.heat,
          lane: result.lane,
          exhibition: result.exhibition,
          dqCode: result.dqCode,
        },
      );
      resultSwimmerIds.add(resolved.swimmerId);
      resultsAdded++;

      const entryKey = `${resolved.membershipId}:${meetEventId}`;
      if (looksLikeResults && !occupiedEntryKeys.has(entryKey)) {
        const seedTimeMs =
          plannedResult.timeMs > 0 ? plannedResult.timeMs : undefined;
        await addMeetEntry(
          meetId,
          meetEventId,
          resolved.membershipId,
          seedTimeMs,
          undefined,
          "approved",
          seedTimeMs != null ? "manual" : "no_time",
          result.exhibition === true,
        );
        occupiedEntryKeys.add(entryKey);
        entriesAdded++;
      }
    }

    let relaysAdded = 0;
    const relayLegsByEvent = new Map<
      string,
      Array<{
        membershipId: string;
        legOrder: number;
        relayLetter: string;
      }>
    >();
    const relayTeamSeedsByEvent = new Map<
      string,
      Array<{
        relayLetter: string;
        seedTimeMs: number;
        seedTimeSource: "manual";
      }>
    >();
    const relayResultsToImport: Array<{
      meetEventId: string;
      relayLetter: string;
      attempts: NonNullable<ParsedRelayEntry["results"]>;
    }> = [];
    const persistedRelayLegs = attachingResults
      ? await getMeetRelayLegs(meetId)
      : [];
    for (const relay of parsed.relays ?? []) {
      if (
        relay.teamCode &&
        !matchesTeamCode(
          relay.teamCode,
          importIdentity?.teamCode,
          importIdentity?.lscCode,
        )
      ) {
        continue;
      }
      const suffix = relay.eventSuffix ?? "";
      const relayLabel = `Relay #${relay.eventNumber ?? "?"}${suffix}`;
      const meetEventId = await eventIdFor(relay.eventNumber, {
        allowFallback: false,
        eventSuffix: relay.eventSuffix,
      });
      if (!meetEventId) {
        if (relay.results?.length) {
          const fileEvent = parsed.events.find(
            (event) =>
              event.eventNumber === relay.eventNumber &&
              (event.eventSuffix ?? "") === suffix,
          );
          const skippedReason = fileEvent
            ? skippedAttachmentReasons.get(importedEventSlot(fileEvent))
            : undefined;
          if (!skippedReason) {
            attachmentWarnings.push(
              `${relayLabel} was not imported because that event is not on this meet.`,
            );
          }
        }
        continue;
      }
      const eventDetail = eventDetailById.get(meetEventId);
      if (
        !eventDetail ||
        !isRelayStroke(eventDetail.stroke, eventDetail.eventKey)
      ) {
        if (relay.results?.length) {
          attachmentWarnings.push(
            `Event #${relay.eventNumber ?? "?"}${suffix} on this meet is not a relay.`,
          );
        }
        continue;
      }
      const letter = deriveRelayLetter(relay.relayLetter, 1);
      // Results files list every team, and Meet Manager appends alternates
      // (legs 5–8) after the racing four. Keep the relay when legs 1–4 match
      // this roster. Drop unmatched alternates. A missing racing leg is not a result.
      const resolvedLegs = resolveImportedRelayLineup(
        relay.swimmerNames,
        (name) =>
          resolvedByKey.get(fileAthleteKey({ swimmerName: name })) ?? null,
      );
      const lineupPlan = attachingResults
        ? planResultRelayLineup(
            persistedRelayLegs
              .filter(
                (leg) =>
                  leg.meetEventId === meetEventId &&
                  leg.relayLetter.toUpperCase() === letter,
              )
              .map((leg) => leg.legOrder),
          )
        : { action: "write" as const };
      if (lineupPlan.action === "skip" || !resolvedLegs) {
        if (lineupPlan.action === "keep" && relay.results?.length) {
          relayResultsToImport.push({
            meetEventId,
            relayLetter: letter,
            attempts: relay.results,
          });
          relaysAdded++;
          continue;
        }
        if (relay.results?.length) {
          attachmentWarnings.push(
            `${relayLabel} ${letter} was not imported because the lineup was incomplete.`,
          );
        }
        continue;
      }

      if (lineupPlan.action === "write") {
        const legs = relayLegsByEvent.get(meetEventId) ?? [];
        legs.push(
          ...resolvedLegs.map((leg) => ({
            membershipId: leg.resolved.membershipId,
            legOrder: leg.legOrder,
            relayLetter: letter,
          })),
        );
        relayLegsByEvent.set(meetEventId, legs);

        if (!attachingResults) {
          const seedMs = relay.seedTime ? parseTime(relay.seedTime) : 0;
          if (seedMs > 0) {
            const teamSeeds = relayTeamSeedsByEvent.get(meetEventId) ?? [];
            const existingSeedIndex = teamSeeds.findIndex(
              (team) => team.relayLetter === letter,
            );
            const teamSeed = {
              relayLetter: letter,
              seedTimeMs: seedMs,
              seedTimeSource: "manual" as const,
            };
            if (existingSeedIndex >= 0) {
              teamSeeds[existingSeedIndex] = teamSeed;
            } else {
              teamSeeds.push(teamSeed);
            }
            relayTeamSeedsByEvent.set(meetEventId, teamSeeds);
          }
        }
        relaysAdded++;
      }

      if (relay.results?.length) {
        relayResultsToImport.push({
          meetEventId,
          relayLetter: letter,
          attempts: relay.results,
        });
        if (lineupPlan.action === "keep") relaysAdded++;
      }
    }
    for (const [meetEventId, legs] of relayLegsByEvent) {
      if (legs.length === 0) continue;
      const replacedLetters = new Set(legs.map((leg) => leg.relayLetter));
      const kept = attachingResults
        ? persistedRelayLegs
            .filter(
              (leg) =>
                leg.meetEventId === meetEventId &&
                !replacedLetters.has(leg.relayLetter.toUpperCase()),
            )
            .map((leg) => ({
              membershipId: leg.membershipId,
              legOrder: leg.legOrder,
              relayLetter: leg.relayLetter,
              stroke: leg.stroke ?? undefined,
              reasoning: leg.reasoning ?? undefined,
            }))
        : [];
      await replaceMeetRelayLegs({
        meetId,
        meetEventId,
        legs: [...kept, ...legs],
      });
      if (attachingResults) continue;
      const teams = relayTeamSeedsByEvent.get(meetEventId);
      if (teams && teams.length > 0) {
        await replaceMeetRelayTeams({
          meetId,
          meetEventId,
          teams,
        });
      }
    }

    for (const relay of relayResultsToImport) {
      const eventDetail = eventDetailById.get(relay.meetEventId);
      if (
        !eventDetail ||
        !isRelayStroke(eventDetail.stroke, eventDetail.eventKey)
      ) {
        continue;
      }
      for (const attempt of relay.attempts) {
        const timed = planImportedTime(attempt.time, attempt.isDq ?? false);
        if (!timed.ok) continue;
        await upsertMeetRelayResult({
          meetId,
          meetEventId: relay.meetEventId,
          relayLetter: relay.relayLetter,
          round: attempt.resultType ?? null,
          timeMs: timed.timeMs,
          heat: attempt.heat ?? null,
          lane: attempt.lane ?? null,
          exhibition: attempt.exhibition ?? false,
          isDq: attempt.isDq ?? false,
          dqCode: attempt.dqCode ?? null,
        });
        resultsAdded++;
      }
    }

    const importWarning = appendImportWarnings(
      meetImportSummaryWarning({
        looksLikeResults,
        resultRows: parsed.results.length,
        resultsAdded,
        shouldImportEntries,
        entryRows: parsed.entries.length,
        entriesAdded,
        entriesSkipped,
        entryWarnings,
      }),
      attachmentWarnings,
    );

    const swimmerIds = [...resultSwimmerIds];
    if (swimmerIds.length > 0) {
      after(async () => {
        for (const swimmerId of swimmerIds) {
          await recomputeBestTimesForSwimmer(swimmerId);
        }
        revalidatePath(`/team/${teamId}/progression`);
      });
    }

    revalidateMeetPaths(teamId, meetId);
    await updateImportJob(jobId, {
      status: "complete",
      resultSummary: JSON.stringify({
        meetId,
        linkedExisting,
        events: eventsAdded,
        entries: entriesAdded,
        results: resultsAdded,
        relays: relaysAdded,
        unmatched,
        resultsSkipped,
        entriesSkipped,
        swimmersCreated,
        format,
        jobType,
        warning: importWarning,
      }),
    });

    if (looksLikeResults) {
      trackAdmin("results_imported", session?.user?.id, teamId, { format });
    }

    if (session?.user?.email) {
      await sendMeetImportComplete(session.user.email, {
        teamName: "Your team",
        meetName: parsed.name,
        eventsCount: eventsAdded,
        entriesCount: entriesAdded,
      });
    }

    return {
      meetId,
      linkedExisting,
      events: eventsAdded,
      entries: entriesAdded,
      results: resultsAdded,
      relays: relaysAdded,
      unmatched,
      resultsSkipped,
      entriesSkipped,
      swimmersCreated,
      warning: importWarning,
      format: format as MeetFileFormat,
    };
  } catch (error) {
    trackAdmin("import_failed", session?.user?.id, teamId, {
      format,
      error_code: errorCode(error),
    });
    await updateImportJob(jobId, {
      status: "failed",
      errors: error instanceof Error ? error.message : "Import failed",
    });
    throw error;
  }
}

function appendImportWarnings(
  base: string | undefined,
  extra: string[],
): string | undefined {
  const unique = [...new Set(extra)];
  if (unique.length === 0) return base;
  const sample = unique.slice(0, 3).join("; ");
  const suffix = unique.length > 3 ? ` (+${unique.length - 3} more)` : "";
  const message = `${sample}${suffix}`;
  return base ? `${base} ${message}` : message;
}

function findMatchingMeetId(
  existingMeets: Awaited<ReturnType<typeof getMeets>>,
  parsed: ParsedMeet,
): string | null {
  const parsedName = normalizePersonName(parsed.name);
  if (!parsedName) return null;

  const parsedDate = parsed.startDate?.slice(0, 10);

  const matches = existingMeets.filter((meet) => {
    const meetName = normalizePersonName(meet.name);
    const nameMatch =
      meetName === parsedName ||
      meetName.includes(parsedName) ||
      parsedName.includes(meetName);
    if (!nameMatch) return false;
    if (!parsedDate) return true;
    return formatDateOnly(meet.startDate) === parsedDate;
  });

  return matches[0]?.id ?? null;
}

export type MeetExportFormat = "sdif" | "hy3" | "cl2" | "zip";

async function loadHostPackMeet(teamId: string, meetId: string) {
  const loaded = await loadMeetLineupSnapshot(teamId, meetId);
  if (!loaded) throw new Error("Meet not found");
  return parsedMeetFromLineup(
    hostPackLineup(loaded.snapshot),
    loaded.results,
    loaded.members,
  );
}

export async function exportMeetAction(
  teamId: string,
  meetId: string,
  format: MeetExportFormat,
): Promise<{ content: string; filename: string | null }> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "meet_import");

  try {
    const payload = await loadHostPackMeet(teamId, meetId);
    const content =
      format === "hy3"
        ? exportHy3(payload)
        : format === "cl2"
          ? exportCl2(payload)
          : format === "zip"
            ? Buffer.from(
                exportMeetZip(
                  payload,
                  payload.results.length > 0
                    ? "results"
                    : payload.entries.length > 0
                      ? "entries"
                      : "results",
                ),
              ).toString("base64")
            : exportUssSdif(payload);
    trackAdmin("entries_exported", session?.user?.id, teamId, { format });
    return {
      content,
      filename: format === "hy3" ? meetHy3DownloadFilename(payload) : null,
    };
  } catch (error) {
    trackAdmin("export_failed", session?.user?.id, teamId, {
      format,
      error_code: errorCode(error),
    });
    throw error;
  }
}

/** Base64-encoded ZIP pack (HY3 + CL2) for download. */
export async function exportMeetZipAction(
  teamId: string,
  meetId: string,
  kind: "entries" | "results",
): Promise<{ base64: string; filename: string }> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "meet_import");

  try {
    const payload = await loadHostPackMeet(teamId, meetId);
    const bytes = exportMeetZip(payload, kind);
    trackAdmin("entries_exported", session?.user?.id, teamId, {
      format: "zip",
    });
    return {
      base64: Buffer.from(bytes).toString("base64"),
      filename: meetZipDownloadFilename(payload, kind),
    };
  } catch (error) {
    trackAdmin("export_failed", session?.user?.id, teamId, {
      format: "zip",
      error_code: errorCode(error),
    });
    throw error;
  }
}

export async function getMeetsAction(teamId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  return getMeets(teamId);
}

export const getMeetDetailAction = cache(async function getMeetDetailAction(
  teamId: string,
  meetId: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);

  const meet = await getMeetById(meetId, teamId);
  if (!meet) return null;

  const [events, entries, commitments, roster, relayLegs, relayTeams] =
    await Promise.all([
      getMeetEvents(meetId),
      getMeetEntriesDetailed(meetId),
      getMeetCommitments(meetId),
      getRoster(teamId),
      getMeetRelayLegs(meetId),
      getMeetRelayTeams(meetId),
    ]);

  const eventKeyForMeetCourse = (event: (typeof events)[number]) =>
    event.eventKind === "dive"
      ? event.eventKey
      : buildEventKey(
          event.distance,
          event.stroke as Stroke | RelayStroke,
          meet.course,
          event.gender as EventGender,
        );
  const eventKeyForBestTime = new Map<string, string>();
  const eventKeys = events.map((event) => {
    const key = eventKeyForMeetCourse(event);
    eventKeyForBestTime.set(key, event.eventKey);
    return key;
  });
  const bestTimes = (
    await getRosterBestTimesForEvents(teamId, [...new Set(eventKeys)])
  ).map((bestTime) => ({
    ...bestTime,
    eventKey: eventKeyForBestTime.get(bestTime.eventKey) ?? bestTime.eventKey,
  }));

  return {
    meet,
    events,
    entries,
    commitments,
    roster,
    bestTimes,
    relayLegs,
    relayTeams,
  };
});

export async function setMeetAttendanceAction(
  teamId: string,
  meetId: string,
  membershipId: string,
  status: MeetAttendanceUiStatus,
  notes?: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  if (status === "committed") {
    await deleteMeetCommitment(meetId, membershipId);
  } else {
    await upsertMeetCommitment(meetId, membershipId, status, notes);
  }
  revalidateMeetPaths(teamId, meetId);
}

export async function setMeetRelayOnlyAction(
  teamId: string,
  meetId: string,
  membershipId: string,
  relayOnly: boolean,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  await setMeetCommitmentRelayOnly(meetId, membershipId, relayOnly);
  revalidateMeetPaths(teamId, meetId);
}

export async function setMeetAttendanceBulkAction(
  teamId: string,
  meetId: string,
  membershipIds: string[],
  status: MeetAttendanceUiStatus,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await Promise.all(
    uniqueIds.map((membershipId) =>
      status === "committed"
        ? deleteMeetCommitment(meetId, membershipId)
        : upsertMeetCommitment(meetId, membershipId, status),
    ),
  );
  revalidateMeetPaths(teamId, meetId);
}

/** @deprecated Use setMeetAttendanceAction */
export async function setMeetCommitmentAction(
  teamId: string,
  meetId: string,
  membershipId: string,
  status: "pending" | "committed" | "declined",
  notes?: string,
) {
  if (status === "declined") {
    return setMeetAttendanceAction(
      teamId,
      meetId,
      membershipId,
      "not_going",
      notes,
    );
  }
  if (status === "committed") {
    return setMeetAttendanceAction(
      teamId,
      meetId,
      membershipId,
      "committed",
      notes,
    );
  }
  if (status === "pending") {
    return setMeetAttendanceAction(
      teamId,
      meetId,
      membershipId,
      "pending",
      notes,
    );
  }
}

/** @deprecated Use setMeetAttendanceBulkAction */
export async function setMeetCommitmentsBulkAction(
  teamId: string,
  meetId: string,
  membershipIds: string[],
  status: "pending" | "committed" | "declined",
) {
  if (status === "declined") {
    return setMeetAttendanceBulkAction(
      teamId,
      meetId,
      membershipIds,
      "not_going",
    );
  }
  if (status === "committed") {
    return setMeetAttendanceBulkAction(
      teamId,
      meetId,
      membershipIds,
      "committed",
    );
  }
  return setMeetAttendanceBulkAction(teamId, meetId, membershipIds, "pending");
}

type EntryAddResult = { ok: true; id: string } | { ok: false; message: string };

type EntryUpdateResult = { ok: true } | { ok: false; message: string };

export async function addMeetEntryAction(
  teamId: string,
  meetId: string,
  data: {
    meetEventId: string;
    membershipId: string;
    seedTimeMs?: number | null;
    seedTimeSource?: "personal_best" | "manual" | "no_time";
    entryNotes?: string;
    status?: "draft" | "approved" | "scratched";
    exhibition?: boolean;
  },
): Promise<EntryAddResult> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) return { ok: false, message: "Meet not found" };

  const [events, roster, existingEntries, commitments, relayLegs, caps] =
    await Promise.all([
      getMeetEvents(meetId),
      getRoster(teamId),
      getMeetEntriesDetailed(meetId),
      getMeetCommitments(meetId),
      getMeetRelayLegs(meetId),
      resolvedAssociationCapsForMeet(teamId, meet),
    ]);
  const event = events.find((e) => e.id === data.meetEventId);
  if (!event) return { ok: false, message: "Event not found" };

  const swimmer = roster.find((r) => r.membershipId === data.membershipId);
  if (!swimmer) return { ok: false, message: "Swimmer not found on roster" };

  const admission = admitNewIndividualEntry({
    commitments,
    membershipId: data.membershipId,
    eligibilityStatus: swimmer.eligibilityStatus,
    swimmerGender: swimmer.gender,
    event: {
      id: event.id,
      gender: event.gender,
      stroke: event.stroke,
      eventKey: event.eventKey,
    },
    limits: {
      maxIndividualEntries: meet.maxIndividualEntries,
      maxRelayEntries: meet.maxRelayEntries,
      maxCombinedEntries: meet.maxCombinedEntries,
      entryLimitPackages: meet.entryLimitPackages,
    },
    entries: existingEntries,
    relayLegs,
    scoringCap: caps.maxScoringEntriesPerIndividualEvent,
    exhibition: data.exhibition === true,
  });
  if (!admission.ok) return { ok: false, message: admission.reason };

  let seedTimeMs = data.seedTimeMs;
  let seedTimeSource = data.seedTimeSource;
  if (seedTimeMs === undefined) {
    const lookupKey = buildEventKey(
      event.distance,
      event.stroke as Stroke | RelayStroke,
      meet.course,
      event.gender as EventGender,
    );
    const bestMs = await getBestTimeMs(
      swimmer.swimmerId,
      lookupKey,
      meet.course,
    );
    if (bestMs != null && bestMs > 0) {
      seedTimeMs = bestMs;
      seedTimeSource = seedTimeSource ?? "personal_best";
    } else {
      seedTimeMs = null;
      seedTimeSource = seedTimeSource ?? "no_time";
    }
  } else if (!seedTimeSource) {
    if (seedTimeMs != null && seedTimeMs > 0) {
      seedTimeSource = "personal_best";
    } else {
      seedTimeSource = "no_time";
    }
  }

  const id = await addMeetEntry(
    meetId,
    data.meetEventId,
    data.membershipId,
    seedTimeMs,
    data.entryNotes,
    data.status ?? "draft",
    seedTimeSource,
    data.exhibition,
  );
  revalidateMeetPaths(teamId, meetId);
  return { ok: true, id };
}

export async function updateMeetEntryAction(
  teamId: string,
  meetId: string,
  entryId: string,
  data: {
    seedTimeMs?: number | null;
    seedTimeSource?: "personal_best" | "manual" | "no_time";
    entryNotes?: string | null;
    exhibition?: boolean;
    status?: "draft" | "approved" | "scratched";
  },
): Promise<EntryUpdateResult> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) return { ok: false, message: "Meet not found" };

  if (data.exhibition === false) {
    const existing = await getMeetEntriesDetailed(meetId);
    const target = existing.find((e) => e.id === entryId);
    if (target?.exhibition) {
      const caps = await resolvedAssociationCapsForMeet(teamId, meet);
      const admission = admitClearExhibition({
        entries: existing,
        meetEventId: target.meetEventId,
        entryId,
        scoringCap: caps.maxScoringEntriesPerIndividualEvent,
      });
      if (!admission.ok) return { ok: false, message: admission.reason };
    }
  }

  await updateMeetEntry(entryId, data);
  revalidateMeetPaths(teamId, meetId);
  return { ok: true };
}

export async function updateMeetEntryStatusAction(
  teamId: string,
  meetId: string,
  entryId: string,
  status: "draft" | "approved" | "scratched",
): Promise<EntryUpdateResult> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) return { ok: false, message: "Meet not found" };

  if (status === "approved") {
    const existing = await getMeetEntriesDetailed(meetId);
    const target = existing.find((e) => e.id === entryId);
    if (!target) return { ok: false, message: "Entry not found" };
    if (target.status === "scratched") {
      const [relayLegs, caps] = await Promise.all([
        getMeetRelayLegs(meetId),
        resolvedAssociationCapsForMeet(teamId, meet),
      ]);
      const admission = admitRestoredEntry({
        entries: existing,
        relayLegs,
        membershipId: target.membershipId,
        entryId,
        meetEventId: target.meetEventId,
        event: { stroke: target.stroke, eventKey: target.eventKey },
        limits: {
          maxIndividualEntries: meet.maxIndividualEntries,
          maxRelayEntries: meet.maxRelayEntries,
          maxCombinedEntries: meet.maxCombinedEntries,
          entryLimitPackages: meet.entryLimitPackages,
        },
        exhibition: target.exhibition === true,
        scoringCap: caps.maxScoringEntriesPerIndividualEvent,
      });
      if (!admission.ok) return { ok: false, message: admission.reason };
    }
  }

  await updateMeetEntryStatus(entryId, status);
  revalidateMeetPaths(teamId, meetId);
  return { ok: true };
}

export async function deleteMeetEntryAction(
  teamId: string,
  meetId: string,
  entryId: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  await deleteMeetEntry(entryId);
  revalidateMeetPaths(teamId, meetId);
}

export async function applySuggestedLineupAction(
  teamId: string,
  meetId: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  await assertFeature(teamId, "lineup_suggestions");

  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const [events, existingEntries, commitments, roster, relayLegs] =
    await Promise.all([
      getMeetEvents(meetId),
      getMeetEntriesDetailed(meetId),
      getMeetCommitments(meetId),
      getRoster(teamId),
      getMeetRelayLegs(meetId),
    ]);
  const bestTimes = await getRosterBestTimesForEvents(
    teamId,
    events.map((e) => e.eventKey),
  );

  const commitmentMaps = indexMeetCommitments(commitments);
  const pool = roster.filter(
    (r) =>
      !commitmentMaps.notGoingIds.has(r.membershipId) &&
      !commitmentMaps.meetNotEligibleIds.has(r.membershipId) &&
      !blocksMeetEntries(r.eligibilityStatus),
  );

  const bestByMembership = new Map<string, Record<string, number>>();
  for (const bt of bestTimes) {
    const map = bestByMembership.get(bt.membershipId) ?? {};
    map[bt.eventKey] = bt.timeMs;
    bestByMembership.set(bt.membershipId, map);
  }

  const { entries: suggested } = suggestIndividualLineup({
    events: events.map((e) => ({
      id: e.id,
      eventKey: e.eventKey,
      stroke: e.stroke,
      gender: e.gender,
      qualifyingTimeMs: e.qualifyingTimeMs ?? null,
    })),
    candidates: pool.map((r) => ({
      membershipId: r.membershipId,
      gender: r.gender,
      bestByEventKey: bestByMembership.get(r.membershipId) ?? {},
    })),
    existing: [
      ...existingEntries
        .filter((e) => !isRelayStroke(e.stroke, e.eventKey))
        .map((e) => ({
          membershipId: e.membershipId,
          meetEventId: e.meetEventId,
          eventKey: e.eventKey,
          stroke: e.stroke,
          status: e.status,
        })),
      ...[
        ...racingRelayKeysByMember(
          relayLegs.map((leg) => ({
            membershipId: leg.membershipId,
            meetEventId: leg.meetEventId,
            relayLetter: leg.relayLetter,
            legOrder: leg.legOrder,
          })),
        ),
      ].flatMap(([membershipId, keys]) =>
        [...keys].map((key) => ({
          membershipId,
          meetEventId: key.split(":")[0] ?? "",
          eventKey: "relay",
          stroke: "free_relay",
          status: "approved",
        })),
      ),
    ],
    limits: {
      maxIndividualEntries: meet.maxIndividualEntries,
      maxRelayEntries: meet.maxRelayEntries,
      maxCombinedEntries: meet.maxCombinedEntries,
      entryLimitPackages: meet.entryLimitPackages,
    },
  });

  let added = 0;
  const caps = await resolvedAssociationCapsForMeet(teamId, meet);
  const limits = {
    maxIndividualEntries: meet.maxIndividualEntries,
    maxRelayEntries: meet.maxRelayEntries,
    maxCombinedEntries: meet.maxCombinedEntries,
    entryLimitPackages: meet.entryLimitPackages,
  };
  const scratch: AdmissionEntryRow[] = existingEntries.map((entry) => ({
    id: entry.id,
    membershipId: entry.membershipId,
    meetEventId: entry.meetEventId,
    status: entry.status,
    stroke: entry.stroke,
    eventKey: entry.eventKey,
    exhibition: entry.exhibition,
  }));
  for (const suggestion of suggested) {
    const event = events.find((item) => item.id === suggestion.meetEventId);
    const swimmer = roster.find(
      (member) => member.membershipId === suggestion.membershipId,
    );
    if (!event || !swimmer) continue;
    const admission = admitNewIndividualEntry({
      commitments,
      membershipId: suggestion.membershipId,
      eligibilityStatus: swimmer.eligibilityStatus,
      swimmerGender: swimmer.gender,
      event: {
        id: event.id,
        gender: event.gender,
        stroke: event.stroke,
        eventKey: event.eventKey,
      },
      limits,
      entries: scratch,
      relayLegs,
      scoringCap: caps.maxScoringEntriesPerIndividualEvent,
      exhibition: false,
    });
    if (!admission.ok) continue;
    try {
      await addMeetEntry(
        meetId,
        suggestion.meetEventId,
        suggestion.membershipId,
        suggestion.seedTimeMs,
        undefined,
        "approved",
        suggestion.seedTimeSource,
        false,
      );
      added += 1;
      scratch.push({
        membershipId: suggestion.membershipId,
        meetEventId: suggestion.meetEventId,
        status: "approved",
        stroke: event.stroke,
        eventKey: event.eventKey,
        exhibition: false,
      });
    } catch {
      // Skip rows that raced another writer or failed uniqueness.
    }
  }

  revalidateMeetPaths(teamId, meetId);
  return { added, suggested: suggested.length };
}

export async function deleteMeetAction(teamId: string, meetId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);

  const deleted = await deleteMeet(meetId, teamId);
  if (!deleted) throw new Error("Meet not found");

  revalidateMeetPaths(teamId);
}

export async function addResultAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  swimmerId: string,
  time: string,
  options?: {
    round?: "prelim" | "swimoff" | "finals" | null;
    heat?: number | null;
    lane?: number | null;
    exhibition?: boolean;
    dqCode?: string | null;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "progression");

  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  const [events, roster] = await Promise.all([
    getMeetEvents(meetId),
    getRoster(teamId),
  ]);
  const event = events.find((item) => item.id === meetEventId);
  if (!event) throw new Error("Event not found");
  if (isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error(
      "Relay times are recorded as team results, not individual swims.",
    );
  }
  const swimmer = roster.find((member) => member.swimmerId === swimmerId);
  if (!swimmer) throw new Error("Swimmer not found on roster");

  const timeMs = parseTime(time);
  const dqCode = options?.dqCode?.trim() || null;
  await addMeetResult(meetId, meetEventId, swimmerId, timeMs, {
    round: options?.round ?? null,
    heat: options?.heat ?? null,
    lane: options?.lane ?? null,
    exhibition: options?.exhibition ?? false,
    dqCode,
    isDq: Boolean(dqCode),
  });
  await recomputeBestTimesForSwimmer(swimmerId);
  revalidateMeetPaths(teamId, meetId);
  revalidatePath(`/team/${teamId}/progression/${swimmerId}`);
  revalidatePath(`/team/${teamId}/swimmers/${swimmerId}/progression`);
}

export async function addRelayResultAction(
  teamId: string,
  meetId: string,
  input: {
    meetEventId: string;
    relayLetter: string;
    overallTime: string;
    round?: "prelim" | "swimoff" | "finals" | null;
    heat?: number | null;
    lane?: number | null;
    exhibition?: boolean;
    dqCode?: string | null;
    membershipId?: string | null;
    legOrder?: number | null;
    splitTime?: string | null;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "progression");

  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const [events, roster] = await Promise.all([
    getMeetEvents(meetId),
    getRoster(teamId),
  ]);
  const event = events.find((item) => item.id === input.meetEventId);
  if (!event) throw new Error("Event not found");
  if (!isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error("That event is not a relay.");
  }

  const overallTimeMs = parseTime(input.overallTime);
  if (!Number.isFinite(overallTimeMs) || overallTimeMs <= 0) {
    throw new Error("Enter a valid team time.");
  }

  const dqCode = input.dqCode?.trim() || null;
  const isDq = Boolean(dqCode);
  const membershipId = input.membershipId?.trim() || "";
  const splitRaw = input.splitTime?.trim() || "";
  const hasSplit = Boolean(membershipId || splitRaw);

  let split: {
    membershipId: string;
    swimmerId: string;
    swimmerGender: "male" | "female";
    legOrder: number;
    timeMs: number;
  } | null = null;

  if (hasSplit) {
    if (!membershipId) throw new Error("Select a swimmer for the split.");
    if (input.legOrder == null) throw new Error("Select a relay leg.");
    if (!splitRaw) throw new Error("Enter the swimmer's split time.");
    const member = roster.find((row) => row.membershipId === membershipId);
    if (!member) throw new Error("Swimmer not found on roster");
    const splitTimeMs = parseTime(splitRaw);
    if (!Number.isFinite(splitTimeMs) || splitTimeMs <= 0) {
      throw new Error("Enter a valid split time.");
    }
    split = {
      membershipId: member.membershipId,
      swimmerId: member.swimmerId,
      swimmerGender: member.gender,
      legOrder: input.legOrder,
      timeMs: splitTimeMs,
    };
  }

  const { creditedSwimmerIds } = await upsertMeetRelayResult({
    meetId,
    meetEventId: event.id,
    relayLetter: input.relayLetter,
    round: input.round ?? null,
    timeMs: overallTimeMs,
    heat: input.heat ?? null,
    lane: input.lane ?? null,
    exhibition: input.exhibition ?? false,
    isDq,
    dqCode,
    split,
  });

  for (const id of creditedSwimmerIds) {
    await recomputeBestTimesForSwimmer(id);
    revalidatePath(`/team/${teamId}/progression/${id}`);
    revalidatePath(`/team/${teamId}/swimmers/${id}/progression`);
  }

  revalidateMeetPaths(teamId, meetId);
}

export async function addRelayResultSplitAction(
  teamId: string,
  meetId: string,
  input: {
    resultId: string;
    legOrder: number;
    splitTime: string;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "progression");

  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const [relayResults, roster] = await Promise.all([
    getMeetRelayResultsDetailed(meetId),
    getRoster(teamId),
  ]);
  const result = relayResults.find((item) => item.id === input.resultId);
  if (!result) throw new Error("Relay result not found");

  const member = result.members.find(
    (item) => item.legOrder === input.legOrder,
  );
  if (!member) {
    throw new Error("This relay result has no saved swimmer for that leg.");
  }
  const swimmer = roster.find(
    (item) => item.membershipId === member.membershipId,
  );
  if (!swimmer) throw new Error("Swimmer not found on roster");

  const timeMs = parseTime(input.splitTime);
  if (!Number.isFinite(timeMs) || timeMs <= 0) {
    throw new Error("Enter a valid split time.");
  }

  const { creditedSwimmerIds } = await upsertMeetRelayResult({
    meetId,
    meetEventId: result.meetEventId,
    relayLetter: result.relayLetter,
    round: result.round,
    timeMs: result.timeMs,
    heat: result.heat,
    lane: result.lane,
    exhibition: result.exhibition,
    isDq: result.isDq,
    dqCode: result.dqCode,
    split: {
      membershipId: member.membershipId,
      swimmerId: swimmer.swimmerId,
      swimmerGender: swimmer.gender,
      legOrder: member.legOrder,
      timeMs,
    },
  });

  for (const id of creditedSwimmerIds) {
    await recomputeBestTimesForSwimmer(id);
    revalidatePath(`/team/${teamId}/progression/${id}`);
    revalidatePath(`/team/${teamId}/swimmers/${id}/progression`);
  }

  revalidateMeetPaths(teamId, meetId);
}

export type ImportJobHistoryItem = {
  id: string;
  jobType: string;
  status: "pending" | "processing" | "complete" | "failed";
  createdAt: string;
  errors?: string;
  summary?: {
    meetId?: string;
    linkedExisting?: boolean;
    events?: number;
    entries?: number;
    results?: number;
    relays?: number;
    unmatched?: number;
    resultsSkipped?: number;
    entriesSkipped?: number;
    swimmersCreated?: number;
    format?: string;
  };
};

/** Recent meet-file import jobs for this team, most recent first. */
export async function getImportJobHistoryAction(
  teamId: string,
  limit = 25,
): Promise<ImportJobHistoryItem[]> {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);

  const jobs = await getImportJobs(teamId);
  return jobs.slice(0, limit).map((job) => {
    let summary: ImportJobHistoryItem["summary"];
    if (job.resultSummary) {
      try {
        summary = JSON.parse(job.resultSummary);
      } catch {
        summary = undefined;
      }
    }
    return {
      id: job.id,
      jobType: job.type,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      errors: job.errors ?? undefined,
      summary,
    };
  });
}
