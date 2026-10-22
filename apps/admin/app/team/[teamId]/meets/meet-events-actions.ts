"use server";

import { errorCode } from "@lane4hq/analytics";
import { getSession } from "@lane4hq/auth/session";
import { assertFeature } from "@lane4hq/billing/features";
import { requireTeamRole } from "@lane4hq/db/authz";
import {
  createMeetEventTemplate,
  deleteMeetEventTemplate,
  isMeetEventTemplatesTableMissing,
  listMeetEventTemplates,
} from "@lane4hq/db/queries/meet-event-templates";
import {
  addMeetEvent,
  addResolvedMeetResults,
  countMeetEntriesForEvent,
  deleteMeetEntriesForEvent,
  deleteMeetEvent,
  deleteMeetRelayLegsForEvent,
  getBestTimeMs,
  getMeetById,
  getMeetEventById,
  getMeetEvents,
  getMeetRelayLegsDetailed,
  suggestMeetEventNumber,
  updateMeetEvent,
} from "@lane4hq/db/queries/meets";
import { getRoster } from "@lane4hq/db/queries/roster";
import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import type { RelayStroke, Stroke } from "@lane4hq/swim-core/events";
import {
  buildEventKey,
  formatMeetEventDeletePhrase,
} from "@lane4hq/swim-core/events";
import {
  BUILT_IN_MEET_EVENT_PRESETS,
  type MeetEventPresetRow,
} from "@lane4hq/swim-core/meet-event-presets";
import {
  formatMeetLineupCsv,
  hostPackLineup,
} from "@lane4hq/swim-core/meet-lineup-snapshot";
import { parseMeetResultsCsv } from "@lane4hq/swim-core/meet-results-csv";
import { parseTime } from "@lane4hq/swim-core/times";
import {
  manualMeetEventSchema,
  meetEventTemplateNameSchema,
} from "@lane4hq/swim-core/validators";
import { revalidatePath } from "next/cache";
import { trackAdmin } from "@/app/analytics";
import { loadMeetLineupSnapshot } from "./load-meet-lineup-snapshot";

function isFileBackedMeet(importSource: string | null | undefined) {
  return Boolean(importSource?.trim());
}

function assertHandBuiltEventList(importSource: string | null | undefined) {
  if (isFileBackedMeet(importSource)) {
    throw new Error(
      "This meet came from a file. Add events one at a time instead of applying a template.",
    );
  }
}

function revalidateMeetPaths(teamId: string, meetId: string) {
  revalidatePath(`/team/${teamId}/meets`);
  revalidatePath(`/team/${teamId}/meets/${meetId}`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/events`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/entries`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/report`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/results`);
}

async function requireMeetImportAccess(teamId: string, userId?: string) {
  await requireTeamRole(userId, teamId, ["owner", "head_coach"]);
  await assertFeature(teamId, "meet_import");
}

function qualifyingTimeMsFromInput(raw?: string): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return parseTime(trimmed);
  } catch {
    return null;
  }
}

function toEventKey(
  input: {
    distance: number;
    stroke: string;
    gender: string;
  },
  course: "SCY" | "SCM" | "LCM",
) {
  return buildEventKey(
    input.distance,
    input.stroke as Stroke | RelayStroke,
    course,
    input.gender as "male" | "female" | "mixed",
  );
}

export async function suggestMeetEventNumberAction(
  teamId: string,
  meetId: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  return suggestMeetEventNumber(meetId);
}

export async function addManualMeetEventAction(
  teamId: string,
  meetId: string,
  formData: FormData,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const parsed = manualMeetEventSchema.parse({
    eventNumber: formData.get("eventNumber"),
    stroke: formData.get("stroke"),
    distance: formData.get("distance"),
    gender: formData.get("gender"),
    ageGroup: formData.get("ageGroup") || undefined,
    qualifyingTime: formData.get("qualifyingTime") || undefined,
  });

  const existing = await getMeetEvents(meetId);
  if (
    existing.some(
      (event) =>
        event.eventNumber != null && event.eventNumber === parsed.eventNumber,
    )
  ) {
    throw new Error(`Event number ${parsed.eventNumber} already exists.`);
  }

  const eventKey = toEventKey(parsed, meet.course);
  await addMeetEvent(meetId, {
    eventNumber: parsed.eventNumber,
    stroke: parsed.stroke,
    distance: parsed.distance,
    gender: parsed.gender,
    ageGroup: parsed.ageGroup,
    eventKey,
    course: meet.course,
    qualifyingTimeMs: qualifyingTimeMsFromInput(parsed.qualifyingTime),
  });

  revalidateMeetPaths(teamId, meetId);
}

export async function updateManualMeetEventAction(
  teamId: string,
  meetId: string,
  eventId: string,
  formData: FormData,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const event = await getMeetEventById(eventId, meetId);
  if (!event) throw new Error("Event not found");

  const entryCount = await countMeetEntriesForEvent(eventId);
  const hasRelayLegs =
    isRelayStroke(event.stroke, event.eventKey) &&
    (await getMeetRelayLegsDetailed(meetId)).some(
      (leg) => leg.meetEventId === eventId,
    );
  const hasEntries = entryCount > 0 || hasRelayLegs;

  const identityLocked = event.importedFromFile || hasEntries;

  const ageGroup = formData.get("ageGroup");
  const qualifyingTime = formData.get("qualifyingTime");
  const patch: Parameters<typeof updateMeetEvent>[2] = {
    ageGroup: ageGroup === null ? undefined : String(ageGroup).trim() || null,
    qualifyingTimeMs: qualifyingTimeMsFromInput(
      qualifyingTime ? String(qualifyingTime) : undefined,
    ),
  };

  if (!identityLocked) {
    const parsed = manualMeetEventSchema.parse({
      eventNumber: formData.get("eventNumber"),
      stroke: formData.get("stroke"),
      distance: formData.get("distance"),
      gender: formData.get("gender"),
      ageGroup: formData.get("ageGroup") || undefined,
      qualifyingTime: formData.get("qualifyingTime") || undefined,
    });

    const duplicate = (await getMeetEvents(meetId)).some(
      (row) =>
        row.id !== eventId &&
        row.eventNumber != null &&
        row.eventNumber === parsed.eventNumber,
    );
    if (duplicate) {
      throw new Error(`Event number ${parsed.eventNumber} already exists.`);
    }

    patch.eventNumber = parsed.eventNumber;
    patch.stroke = parsed.stroke;
    patch.distance = parsed.distance;
    patch.gender = parsed.gender;
    patch.eventKey = toEventKey(parsed, meet.course);
    patch.qualifyingTimeMs = qualifyingTimeMsFromInput(parsed.qualifyingTime);
    patch.ageGroup = parsed.ageGroup ?? null;
  }

  await updateMeetEvent(eventId, meetId, patch);
  revalidateMeetPaths(teamId, meetId);
}

export async function deleteManualMeetEventAction(
  teamId: string,
  meetId: string,
  eventId: string,
  options: { confirmPhrase: string },
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const event = await getMeetEventById(eventId, meetId);
  if (!event) throw new Error("Event not found");

  const expected = formatMeetEventDeletePhrase(
    event.gender,
    event.distance,
    event.stroke,
  );
  if (options.confirmPhrase.trim() !== expected) {
    throw new Error(`Type ${expected} to delete this event.`);
  }

  await deleteMeetEntriesForEvent(eventId);
  await deleteMeetRelayLegsForEvent(meetId, eventId);
  await deleteMeetEvent(eventId, meetId);
  revalidateMeetPaths(teamId, meetId);
}

async function addPresetEvents(
  teamId: string,
  meetId: string,
  events: MeetEventPresetRow[],
) {
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  assertHandBuiltEventList(meet.importSource);

  const existing = await getMeetEvents(meetId);
  const usedNumbers = new Set(
    existing
      .map((event) => event.eventNumber)
      .filter((n): n is number => n != null),
  );

  for (const preset of events) {
    if (usedNumbers.has(preset.eventNumber)) continue;
    const eventKey = toEventKey(preset, meet.course);
    await addMeetEvent(meetId, {
      eventNumber: preset.eventNumber,
      stroke: preset.stroke,
      distance: preset.distance,
      gender: preset.gender,
      ageGroup: preset.ageGroup,
      eventKey,
      course: meet.course,
    });
    usedNumbers.add(preset.eventNumber);
  }

  revalidateMeetPaths(teamId, meetId);
}

export async function applyBuiltInMeetTemplateAction(
  teamId: string,
  meetId: string,
  presetId: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const preset = BUILT_IN_MEET_EVENT_PRESETS.find((row) => row.id === presetId);
  if (!preset) throw new Error("Template not found");
  await addPresetEvents(teamId, meetId, preset.events);
}

export async function copyMeetEventsFromMeetAction(
  teamId: string,
  meetId: string,
  sourceMeetId: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const sourceMeet = await getMeetById(sourceMeetId, teamId);
  if (!sourceMeet) throw new Error("Source meet not found");

  const sourceEvents = await getMeetEvents(sourceMeetId);
  await addPresetEvents(
    teamId,
    meetId,
    sourceEvents
      .filter((event) => event.eventNumber != null)
      .map((event) => ({
        eventNumber: event.eventNumber!,
        distance: event.distance,
        stroke: event.stroke,
        gender: event.gender,
        ageGroup: event.ageGroup ?? undefined,
      })),
  );
}

export async function saveMeetAsEventTemplateAction(
  teamId: string,
  meetId: string,
  name: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const templateName = meetEventTemplateNameSchema.parse(name);
  const events = await getMeetEvents(meetId);
  if (events.length === 0) {
    throw new Error("Add events before saving a template.");
  }

  try {
    await createMeetEventTemplate(teamId, {
      name: templateName,
      course: meet.course,
      events: events
        .filter((event) => event.eventNumber != null)
        .map((event) => ({
          eventNumber: event.eventNumber!,
          distance: event.distance,
          stroke: event.stroke,
          gender: event.gender,
          ageGroup: event.ageGroup ?? undefined,
          qualifyingTimeMs: event.qualifyingTimeMs,
        })),
    });
  } catch (error) {
    if (isMeetEventTemplatesTableMissing(error)) {
      throw new Error(
        "Team templates require a database migration. Run: pnpm db:migrate",
      );
    }
    throw error;
  }

  revalidatePath(`/team/${teamId}/meets/${meetId}/events`);
}

export async function applyTeamEventTemplateAction(
  teamId: string,
  meetId: string,
  templateId: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const templates = await listMeetEventTemplates(teamId);
  const template = templates.find((row) => row.id === templateId);
  if (!template) throw new Error("Template not found");
  await addPresetEvents(teamId, meetId, template.events);
}

export async function deleteTeamEventTemplateAction(
  teamId: string,
  templateId: string,
) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  const deleted = await deleteMeetEventTemplate(templateId, teamId);
  if (!deleted) throw new Error("Template not found");
  revalidatePath(`/team/${teamId}/meets`);
}

export async function listTeamEventTemplatesAction(teamId: string) {
  const session = await getSession();
  await requireMeetImportAccess(teamId, session?.user?.id);
  return listMeetEventTemplates(teamId);
}

export async function exportMeetEntriesCsvAction(
  teamId: string,
  meetId: string,
) {
  const session = await getSession();
  try {
    await requireMeetImportAccess(teamId, session?.user?.id);
    const loaded = await loadMeetLineupSnapshot(teamId, meetId);
    if (!loaded) throw new Error("Meet not found");
    const csv = formatMeetLineupCsv(hostPackLineup(loaded.snapshot));
    trackAdmin("entries_exported", session?.user?.id, teamId, {
      format: "csv",
    });
    return csv;
  } catch (error) {
    trackAdmin("export_failed", session?.user?.id, teamId, {
      format: "csv",
      error_code: errorCode(error),
    });
    throw error;
  }
}

export async function importMeetResultsCsvAction(
  teamId: string,
  meetId: string,
  csvContent: string,
) {
  const session = await getSession();
  try {
    await requireMeetImportAccess(teamId, session?.user?.id);
    const meet = await getMeetById(meetId, teamId);
    if (!meet) throw new Error("Meet not found");

    const rows = parseMeetResultsCsv(csvContent);
    if (rows.length === 0) {
      throw new Error("No valid result rows found in CSV.");
    }

    const [events, roster] = await Promise.all([
      getMeetEvents(meetId),
      getRoster(teamId),
    ]);

    const eventByNumber = new Map(
      events
        .filter((event) => event.eventNumber != null)
        .map((event) => [event.eventNumber!, event]),
    );

    const rosterByName = new Map(
      roster.map((member) => [
        `${member.firstName} ${member.lastName}`.trim().toLowerCase(),
        member,
      ]),
    );

    const resolved: Array<{
      eventKey: string;
      meetEventId: string;
      swimmerId: string;
      timeMs: number;
      place: number | null;
    }> = [];
    const skipped: string[] = [];

    for (const row of rows) {
      const event = eventByNumber.get(row.eventNumber);
      if (!event) {
        skipped.push(`Line ${row.line}: unknown event #${row.eventNumber}`);
        continue;
      }

      const swimmer = rosterByName.get(row.swimmerName.toLowerCase());
      if (!swimmer) {
        skipped.push(
          `Line ${row.line}: swimmer "${row.swimmerName}" not found`,
        );
        continue;
      }

      if (isRelayStroke(event.stroke, event.eventKey)) {
        skipped.push(
          `Line ${row.line}: relay event #${row.eventNumber} skipped`,
        );
        continue;
      }

      resolved.push({
        eventKey: event.eventKey,
        meetEventId: event.id,
        swimmerId: swimmer.swimmerId,
        timeMs: row.timeMs,
        place: row.place,
      });
    }

    if (resolved.length === 0) {
      throw new Error("No valid result rows found in CSV.");
    }

    const bestTimeKeys = new Map<
      string,
      { swimmerId: string; eventKey: string }
    >();
    for (const row of resolved) {
      bestTimeKeys.set(`${row.swimmerId}:${row.eventKey}`, row);
    }
    const currentBestTimes = new Map<string, number | null>(
      await Promise.all(
        [...bestTimeKeys].map(
          async ([key, row]): Promise<[string, number | null]> => [
            key,
            await getBestTimeMs(row.swimmerId, row.eventKey),
          ],
        ),
      ),
    );
    const rowsToInsert = resolved.map((row) => {
      const key = `${row.swimmerId}:${row.eventKey}`;
      const previousBestTimeMs = currentBestTimes.get(key) ?? null;
      if (previousBestTimeMs == null || row.timeMs < previousBestTimeMs) {
        currentBestTimes.set(key, row.timeMs);
      }
      return {
        meetEventId: row.meetEventId,
        swimmerId: row.swimmerId,
        timeMs: row.timeMs,
        place: row.place,
        previousBestTimeMs,
      };
    });

    await addResolvedMeetResults(meetId, rowsToInsert, [
      ...new Set(resolved.map((row) => row.swimmerId)),
    ]);
    revalidateMeetPaths(teamId, meetId);

    trackAdmin("results_imported", session?.user?.id, teamId, {
      format: "csv",
    });
    return {
      imported: rowsToInsert.length,
      skipped,
    };
  } catch (error) {
    trackAdmin("import_failed", session?.user?.id, teamId, {
      format: "csv",
      error_code: errorCode(error),
    });
    throw error;
  }
}
