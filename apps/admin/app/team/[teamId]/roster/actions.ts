"use server";

import { getSession } from "@lane4hq/auth/session";
import {
  canAddSwimmer,
  remainingSwimmerSlots,
} from "@lane4hq/billing/features";
import {
  requireCoachSafeSportCurrent,
  requireMinorPiiAccess,
  requireRosterImportExportAccess,
  requireTeamMember,
  requireTeamRole,
  writeAuditLog,
} from "@lane4hq/db/authz";
import { db } from "@lane4hq/db/client";
import { createImportJob, updateImportJob } from "@lane4hq/db/queries/imports";
import { patchTeamUiPreferences } from "@lane4hq/db/queries/preferences";
import { getSwimmerBestTimes } from "@lane4hq/db/queries/progression";
import {
  addSwimmer,
  getRoster,
  getRosterForExport,
  getSwimmerContactsForMembership,
  getSwimmerIdentityById,
  getSwimmerMedicalForMembership,
  importRosterSharePack,
  type RosterPageInput,
  reactivateSwimmerOnTeam,
  removeSwimmerFromTeam,
  updateSwimmer,
} from "@lane4hq/db/queries/roster";
import { createMaappAcknowledgment } from "@lane4hq/db/queries/safesport";
import { organization } from "@lane4hq/db/schema";
import {
  sendRosterImportComplete,
  sendRosterImportFailed,
} from "@lane4hq/emails";
import { isMinorSwimmer } from "@lane4hq/swim-core/age";
import {
  type RosterImportRowError,
  type RosterImportValidatedRow,
  validateRosterImportRows,
} from "@lane4hq/swim-core/roster-import";
import { rosterRowSchema } from "@lane4hq/swim-core/validators";
import { parseRosterCsv } from "@lane4hq/swim-formats/csv";
import {
  buildRosterSharePack,
  detectRosterFileFormat,
  isRosterSharePack,
  parsedRosterRowToImportRaw,
  parseRosterFile,
  parseRosterFileFromBytes,
  parseRosterSharePack,
  rosterImportErrorForFile,
  rosterImportRowNumber,
  rosterSharePackFilename,
  serializeRosterSharePack,
} from "@lane4hq/swim-formats/roster";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

function parseContactsFromForm(formData: FormData) {
  const parentName = formData.get("parentName")?.toString();
  const parentEmail = formData.get("parentEmail")?.toString();
  const parentPhone = formData.get("parentPhone")?.toString();
  const emergencyName = formData.get("emergencyName")?.toString();
  const emergencyPhone = formData.get("emergencyPhone")?.toString();

  if (!parentName && !parentEmail && !parentPhone) return undefined;

  return {
    parentName: parentName || undefined,
    parentEmail: parentEmail || undefined,
    parentPhone: parentPhone || undefined,
    emergencyName: emergencyName || undefined,
    emergencyPhone: emergencyPhone || undefined,
  };
}

function parseMedicalFromForm(formData: FormData) {
  const allergies = formData.get("allergies")?.toString();
  const medications = formData.get("medications")?.toString();
  const conditions = formData.get("conditions")?.toString();
  const notes = formData.get("notes")?.toString();

  if (!allergies && !medications && !conditions && !notes) return undefined;

  return {
    allergies: allergies || undefined,
    medications: medications || undefined,
    conditions: conditions || undefined,
    notes: notes || undefined,
  };
}

export async function updateSwimmerAction(
  teamId: string,
  swimmerId: string,
  formData: FormData,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);

  const parsed = rosterRowSchema.partial().parse({
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
    middleName: formData.get("middleName") || undefined,
    preferredName: formData.get("preferredName") || undefined,
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    gender: formData.get("gender") || undefined,
    practiceGroup: formData.get("practiceGroup") || undefined,
    contacts: parseContactsFromForm(formData),
    medical: parseMedicalFromForm(formData),
  });

  if (parsed.dateOfBirth && isMinorSwimmer(parsed.dateOfBirth)) {
    await requireCoachSafeSportCurrent(session?.user?.id, teamId);
  }

  await updateSwimmer(swimmerId, teamId, parsed);
  revalidatePath(`/team/${teamId}/roster`);
  revalidatePath(`/team/${teamId}/swimmers/${swimmerId}`);
}

export async function removeSwimmerAction(teamId: string, swimmerId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  await removeSwimmerFromTeam(swimmerId, teamId);
  revalidatePath(`/team/${teamId}/roster`);
}

export async function removeSwimmersAction(
  teamId: string,
  swimmerIds: string[],
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  const uniqueIds = [...new Set(swimmerIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Select at least one swimmer");
  }
  await Promise.all(
    uniqueIds.map((swimmerId) => removeSwimmerFromTeam(swimmerId, teamId)),
  );
  revalidatePath(`/team/${teamId}/roster`);
  return { removed: uniqueIds.length };
}

export async function reactivateSwimmersAction(
  teamId: string,
  swimmerIds: string[],
  options?: { seasonId?: string },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);
  const uniqueIds = [...new Set(swimmerIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Select at least one swimmer");
  }

  const identities = await Promise.all(
    uniqueIds.map((id) => getSwimmerIdentityById(id)),
  );
  if (identities.some((s) => s?.dateOfBirth && isMinorSwimmer(s.dateOfBirth))) {
    await requireCoachSafeSportCurrent(session?.user?.id, teamId);
  }

  const slots = await remainingSwimmerSlots(teamId);
  if (slots < uniqueIds.length) {
    throw new Error(
      slots === 0
        ? "Swimmer limit reached for your plan. Upgrade to reactivate swimmers."
        : `Your plan has room for ${slots} more swimmer${slots === 1 ? "" : "s"}. Select fewer or upgrade.`,
    );
  }

  let reactivated = 0;
  for (const swimmerId of uniqueIds) {
    const result = await reactivateSwimmerOnTeam(swimmerId, teamId, {
      seasonId: options?.seasonId,
    });
    if (result.status === "reactivated") reactivated++;
  }

  if (session?.user?.id && reactivated > 0) {
    await writeAuditLog({
      organizationId: teamId,
      actorUserId: session.user.id,
      action: "roster.swimmer.reactivate",
      resourceType: "organization",
      resourceId: teamId,
      metadata: { swimmerIds: uniqueIds, seasonId: options?.seasonId ?? null },
    });
  }

  revalidatePath(`/team/${teamId}/roster`);
  for (const swimmerId of uniqueIds) {
    revalidatePath(`/team/${teamId}/swimmers/${swimmerId}`);
  }
  return { reactivated };
}

export async function reactivateSwimmerAction(
  teamId: string,
  swimmerId: string,
  options?: { seasonId?: string },
) {
  return reactivateSwimmersAction(teamId, [swimmerId], options);
}

export async function fetchRosterAction(teamId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  return getRoster(teamId);
}

export async function fetchSwimmerPiiAction(
  teamId: string,
  membershipId: string,
) {
  const session = await getSession();
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined;

  await requireMinorPiiAccess(session?.user?.id, teamId, membershipId, {
    ipAddress: ip,
  });

  const [contacts, medical] = await Promise.all([
    getSwimmerContactsForMembership(membershipId, teamId),
    getSwimmerMedicalForMembership(membershipId, teamId),
  ]);

  return { contacts, medical };
}

/** Contacts, medical, and best times for the roster quick-view sheet. */
export async function fetchSwimmerQuickViewAction(
  teamId: string,
  swimmerId: string,
  membershipId: string,
) {
  const session = await getSession();
  await requireTeamMember(session?.user?.id, teamId);

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined;

  const bestTimesPromise = getSwimmerBestTimes(swimmerId);

  let contacts: Awaited<
    ReturnType<typeof getSwimmerContactsForMembership>
  > | null = null;
  let medical: Awaited<
    ReturnType<typeof getSwimmerMedicalForMembership>
  > | null = null;
  let piiDenied = false;

  try {
    await requireMinorPiiAccess(session?.user?.id, teamId, membershipId, {
      ipAddress: ip,
    });
    const [c, m] = await Promise.all([
      getSwimmerContactsForMembership(membershipId, teamId),
      getSwimmerMedicalForMembership(membershipId, teamId),
    ]);
    contacts = c;
    medical = m;
  } catch {
    piiDenied = true;
  }

  const bestTimes = await bestTimesPromise;

  return {
    contacts,
    medical,
    piiDenied,
    bestTimes: bestTimes.map((t) => ({
      eventKey: t.eventKey,
      eventLabel: t.eventLabel ?? t.eventKey,
      course: t.course,
      timeMs: t.timeMs,
      achievedAt: t.achievedAt,
      meetName: t.meetName,
    })),
  };
}

export async function exportRosterCsvAction(
  teamId: string,
  options?: RosterPageInput & { swimmerIds?: string[] },
) {
  const session = await getSession();
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined;

  await requireRosterImportExportAccess(session?.user?.id, teamId);

  const hasFilters =
    options &&
    (options.swimmerIds?.length ||
      options.q ||
      options.status?.length ||
      options.gender?.length ||
      options.groupId?.length ||
      options.classYear?.length ||
      (options.sort?.length ?? 0) > 0);

  const roster = hasFilters
    ? await getRosterForExport(teamId, {
        ...options,
        // Selection export should include inactive rows when ids are explicit
        status: options.swimmerIds?.length
          ? options.status?.length
            ? options.status
            : ["active", "inactive"]
          : options.status,
      })
    : await getRoster(teamId, options?.seasonId);
  const lines = [
    "first_name,last_name,middle_name,preferred_name,date_of_birth,gender,practice_group,class_year,usa_member_id",
    ...roster.map((r) =>
      [
        r.firstName,
        r.lastName,
        r.middleName ?? "",
        r.preferredName ?? "",
        r.dateOfBirth,
        r.gender,
        r.practiceGroup ?? "",
        r.classYear ?? "",
        r.governingBodyId ?? "",
      ].join(","),
    ),
  ];

  if (session?.user?.id) {
    const exportMetadata: Record<string, unknown> = {
      rowCount: roster.length,
    };
    if (hasFilters && options) {
      exportMetadata.filters = {
        q: options.q,
        status: options.status,
        gender: options.gender,
        groupId: options.groupId,
        classYear: options.classYear,
        sort: options.sort,
        swimmerIds: options.swimmerIds,
        seasonId: options.seasonId,
      };
    }
    await writeAuditLog({
      organizationId: teamId,
      actorUserId: session.user.id,
      action: "roster.export",
      resourceType: "organization",
      resourceId: teamId,
      ipAddress: ip,
      metadata: exportMetadata,
    });
  }

  return lines.join("\n");
}

export async function exportRosterSharePackAction(
  teamId: string,
  options: { swimmerIds: string[]; seasonId?: string },
): Promise<{ content: string; filename: string }> {
  const session = await getSession();
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined;

  await requireRosterImportExportAccess(session?.user?.id, teamId);

  const swimmerIds = [...new Set(options.swimmerIds.filter(Boolean))];
  if (swimmerIds.length === 0) {
    throw new Error("Select at least one swimmer to share");
  }

  const [org, roster] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(eq(organization.id, teamId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getRosterForExport(teamId, {
      swimmerIds,
      seasonId: options.seasonId,
      status: ["active", "inactive"],
    }),
  ]);

  if (!org) {
    throw new Error("Team not found");
  }
  if (roster.length === 0) {
    throw new Error("No selected swimmers found on this roster");
  }

  const pack = buildRosterSharePack({
    sourceOrganizationId: teamId,
    sourceOrganizationName: org.name,
    athletes: roster.flatMap((row) => {
      if (!row.dateOfBirth) return [];
      return [
        {
          swimmerId: row.swimmerId,
          firstName: row.firstName,
          lastName: row.lastName,
          preferredName: row.preferredName,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          governingBodyId: row.governingBodyId,
        },
      ];
    }),
  });

  if (pack.athletes.length === 0) {
    throw new Error("Selected swimmers are missing date of birth");
  }

  if (session?.user?.id) {
    await writeAuditLog({
      organizationId: teamId,
      actorUserId: session.user.id,
      action: "roster.share_pack.export",
      resourceType: "organization",
      resourceId: teamId,
      ipAddress: ip,
      metadata: {
        format: "lane4hq-share-pack",
        rowCount: pack.athletes.length,
        swimmerIds: pack.athletes.map((a) => a.swimmerId),
      },
    });
  }

  return {
    content: serializeRosterSharePack(pack),
    filename: rosterSharePackFilename(org.name),
  };
}

async function importRosterSharePackRows(teamId: string, content: string) {
  const session = await getSession();
  await requireRosterImportExportAccess(session?.user?.id, teamId);

  const pack = parseRosterSharePack(content);
  if (pack.sourceOrganizationId === teamId) {
    throw new Error("This share pack is from the same team");
  }

  if (pack.athletes.some((a) => isMinorSwimmer(a.dateOfBirth))) {
    await requireCoachSafeSportCurrent(session?.user?.id, teamId);
  }

  const canAdd = await canAddSwimmer(teamId);
  if (!canAdd) {
    throw new Error(
      "Swimmer limit reached for your plan. Upgrade to add more.",
    );
  }

  const jobId = await createImportJob(teamId, "roster_share_pack");
  await updateImportJob(jobId, { status: "processing" });

  try {
    const result = await importRosterSharePack(teamId, pack.athletes);
    revalidatePath(`/team/${teamId}/roster`);

    if (session?.user?.id) {
      await writeAuditLog({
        organizationId: teamId,
        actorUserId: session.user.id,
        action: "roster.share_pack.import",
        resourceType: "organization",
        resourceId: teamId,
        metadata: {
          sourceOrganizationId: pack.sourceOrganizationId,
          sourceOrganizationName: pack.sourceOrganizationName,
          linked: result.linked,
          merged: result.merged,
          reactivated: result.reactivated,
          alreadyOnTeam: result.alreadyOnTeam,
          failed: result.failed.length,
        },
      });
    }

    await updateImportJob(jobId, {
      status: "complete",
      resultSummary: JSON.stringify(result),
    });

    if (session?.user?.email) {
      await sendRosterImportComplete(session.user.email, {
        teamName: "Your team",
        added: result.linked + result.merged,
        updated: result.alreadyOnTeam + result.reactivated,
      });
    }

    return {
      added: result.linked + result.merged,
      linked: result.linked,
      merged: result.merged,
      reactivated: result.reactivated,
      alreadyOnTeam: result.alreadyOnTeam,
      failed: result.failed,
      sourceTeamName: pack.sourceOrganizationName,
    };
  } catch (error) {
    await updateImportJob(jobId, {
      status: "failed",
      errors: error instanceof Error ? error.message : "Import failed",
    });
    throw error;
  }
}

export async function recordMaappAcknowledgmentAction(
  teamId: string,
  membershipId: string,
  data: {
    signerName: string;
    signerEmail: string;
    acknowledgedBy: "parent_guardian" | "athlete" | "adult_athlete";
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, ["owner", "head_coach"]);

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined;

  await createMaappAcknowledgment({
    membershipId,
    acknowledgedBy: data.acknowledgedBy,
    signerName: data.signerName,
    signerEmail: data.signerEmail,
    ipAddress: ip,
    userAgent: headerStore.get("user-agent") ?? undefined,
  });

  if (session?.user?.id) {
    await writeAuditLog({
      organizationId: teamId,
      actorUserId: session.user.id,
      action: "maapp.acknowledged",
      resourceType: "team_swimmer_membership",
      resourceId: membershipId,
      ipAddress: ip,
    });
  }

  revalidatePath(`/team/${teamId}/settings/safesport`);
}

type ParsedRosterFileRow = Awaited<ReturnType<typeof parseRosterCsv>>[number];

function buildRosterImportValidationInput(parsed: ParsedRosterFileRow[]) {
  return parsed.map((row, index) => ({
    row: rosterImportRowNumber(row, index + 2),
    data: parsedRosterRowToImportRaw(row),
  }));
}

function parseRosterFileRows(
  filename: string,
  text: string,
  encoding: "utf8" | "base64",
): ParsedRosterFileRow[] {
  if (filename.toLowerCase().endsWith(".zip")) {
    if (encoding !== "base64") {
      throw new Error("ZIP roster packs must be uploaded as binary files.");
    }
    const bytes = Uint8Array.from(Buffer.from(text, "base64"));
    return parseRosterFileFromBytes(bytes, filename);
  }

  const importError = rosterImportErrorForFile(filename, text);
  if (importError) {
    throw new Error(importError);
  }

  const format = detectRosterFileFormat(filename, text);
  if (!format) {
    throw new Error(
      "Unsupported file type. Use a Lane4 HQ share pack (.lane4hq.json), CSV, SD3, CL2, HY3, or a roster ZIP.",
    );
  }

  return parseRosterFile(text, format);
}

export type RosterFileImportPreviewResult = {
  validCount: number;
  invalidCount: number;
  totalRows: number;
  errors: RosterImportRowError[];
};

export async function previewRosterFileImportAction(
  teamId: string,
  filename: string,
  content: string,
  encoding: "utf8" | "base64" = "utf8",
): Promise<RosterFileImportPreviewResult> {
  const session = await getSession();
  await requireRosterImportExportAccess(session?.user?.id, teamId);

  if (filename.toLowerCase().endsWith(".zip")) {
    const parsed = parseRosterFileRows(filename, content, encoding);
    if (parsed.length === 0) {
      throw new Error("No swimmers found in file");
    }
    const { valid, invalid } = validateRosterImportRows(
      buildRosterImportValidationInput(parsed),
    );
    const invalidRows = new Set(invalid.map((e) => e.row));
    return {
      validCount: valid.length,
      invalidCount: invalidRows.size,
      totalRows: parsed.length,
      errors: invalid,
    };
  }

  const text =
    encoding === "base64"
      ? Buffer.from(content, "base64").toString("utf8")
      : content;

  if (isRosterSharePack(text)) {
    throw new Error("Share packs import directly without row preview.");
  }

  const parsed = parseRosterFileRows(filename, text, encoding);
  if (parsed.length === 0) {
    throw new Error("No swimmers found in file");
  }

  const { valid, invalid } = validateRosterImportRows(
    buildRosterImportValidationInput(parsed),
  );

  const invalidRows = new Set(invalid.map((e) => e.row));

  return {
    validCount: valid.length,
    invalidCount: invalidRows.size,
    totalRows: parsed.length,
    errors: invalid,
  };
}

export type RosterFileImportResult = {
  imported: number;
  reactivated: number;
  linkedExisting: number;
  skipped: number;
  invalidRowCount: number;
  errors: RosterImportRowError[];
};

async function importValidatedRosterRows(
  teamId: string,
  rows: RosterImportValidatedRow[],
  jobType: string,
  summary: { invalidRowCount: number; errors: RosterImportRowError[] },
) {
  const session = await getSession();
  await requireRosterImportExportAccess(session?.user?.id, teamId);

  if (rows.length === 0 && summary.invalidRowCount === 0) {
    throw new Error("No swimmers found in file");
  }

  const jobId = await createImportJob(teamId, jobType);
  await updateImportJob(jobId, { status: "processing" });

  try {
    let imported = 0;
    let reactivated = 0;
    let linkedExisting = 0;
    let skipped = summary.invalidRowCount;

    for (const { data: row } of rows) {
      try {
        const result = await addSwimmer(teamId, row, {
          viewerUserId: session?.user?.id,
        });
        if ("reactivated" in result && result.reactivated) {
          reactivated++;
        } else if ("linkedExisting" in result && result.linkedExisting) {
          linkedExisting++;
        } else {
          imported++;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Swimmer is already on this team"
        ) {
          skipped++;
          continue;
        }
        throw error;
      }
    }

    revalidatePath(`/team/${teamId}/roster`);
    await updateImportJob(jobId, {
      status: "complete",
      resultSummary: JSON.stringify({
        imported,
        reactivated,
        linkedExisting,
        skipped,
        invalidRowCount: summary.invalidRowCount,
      }),
    });

    if (session?.user?.email && rows.length > 0) {
      await sendRosterImportComplete(session.user.email, {
        teamName: "Your team",
        added: imported + linkedExisting,
        updated: reactivated,
      });
    }

    return {
      imported,
      reactivated,
      linkedExisting,
      skipped,
      invalidRowCount: summary.invalidRowCount,
      errors: summary.errors,
    };
  } catch (error) {
    await updateImportJob(jobId, {
      status: "failed",
      errors: error instanceof Error ? error.message : "Import failed",
    });

    if (session?.user?.email) {
      await sendRosterImportFailed(session.user.email, {
        teamName: "Your team",
        errorSummary: error instanceof Error ? error.message : "Import failed",
      });
    }

    throw error;
  }
}

async function importRosterRows(
  teamId: string,
  parsed: ParsedRosterFileRow[],
  jobType: string,
) {
  const validation = validateRosterImportRows(
    buildRosterImportValidationInput(parsed),
  );
  const invalidRows = new Set(validation.invalid.map((e) => e.row));
  if (validation.valid.length === 0) {
    throw new Error(
      validation.invalid[0]?.message ??
        "No valid swimmers found in file. Fix errors and try again.",
    );
  }
  return importValidatedRosterRows(teamId, validation.valid, jobType, {
    invalidRowCount: invalidRows.size,
    errors: validation.invalid,
  });
}

export async function importRosterCsvAction(teamId: string, content: string) {
  const result = await importRosterRows(
    teamId,
    parseRosterCsv(content),
    "roster_csv",
  );
  return {
    ...result,
    added: result.imported + result.linkedExisting,
  };
}

export type ImportRosterFileResult =
  | RosterFileImportResult
  | {
      added: number;
      linked: number;
      merged: number;
      reactivated: number;
      alreadyOnTeam: number;
      failed: Array<{ swimmerId: string; name: string; reason: string }>;
      sourceTeamName: string;
    };

export async function importRosterFileAction(
  teamId: string,
  filename: string,
  content: string,
  encoding: "utf8" | "base64" = "utf8",
): Promise<ImportRosterFileResult> {
  if (filename.toLowerCase().endsWith(".zip")) {
    if (encoding !== "base64") {
      throw new Error("ZIP roster packs must be uploaded as binary files.");
    }
    const bytes = Uint8Array.from(Buffer.from(content, "base64"));
    const rows = parseRosterFileFromBytes(bytes, filename);
    return importRosterRows(teamId, rows, "roster_zip");
  }

  const text =
    encoding === "base64"
      ? Buffer.from(content, "base64").toString("utf8")
      : content;

  if (isRosterSharePack(text)) {
    return importRosterSharePackRows(teamId, text);
  }

  const parsed = parseRosterFileRows(filename, text, encoding);
  const format = detectRosterFileFormat(filename, text) ?? "csv";
  return importRosterRows(teamId, parsed, `roster_${format}`);
}

export async function saveRosterViewPreferencesAction(
  teamId: string,
  view: {
    columnVisibility?: Record<string, boolean>;
    sorting?: { id: string; desc: boolean }[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { ok: false, error: "Unauthorized" };
    }
    await requireTeamMember(session.user.id, teamId);
    await patchTeamUiPreferences(session.user.id, teamId, {
      roster: {
        columnVisibility: view.columnVisibility,
        sorting: view.sorting,
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to save roster view preferences",
    };
  }
}
