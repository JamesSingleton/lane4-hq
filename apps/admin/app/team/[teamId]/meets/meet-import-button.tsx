"use client";

import {
  buildEventKey,
  type Course,
  type EventGender,
  formatEventName,
  parseEventGender,
  type RelayStroke,
  type Stroke,
} from "@lane4hq/swim-core/events";
import { formatTime } from "@lane4hq/swim-core/times";
import {
  detectMeetFileFormat,
  isZipFilename,
} from "@lane4hq/swim-formats/meet";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lane4hq/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { Label } from "@lane4hq/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lane4hq/ui/components/tooltip";
import { cn } from "@lane4hq/ui/lib/utils";
import { AlertTriangleIcon, Loader, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect, useId, useRef, useState } from "react";
import { DatePickerField } from "@/components/date-picker-field";
import { LabeledCombobox } from "@/components/labeled-combobox";
import { useTeamCapabilities } from "@/components/team-capabilities";
import { TEAM_MANAGE_ROLE_TOOLTIP } from "@/lib/team-role-messages";
import {
  type AthleteMapAction,
  importMeetFileAction,
  type MeetImportFilePayload,
  type MeetImportPreview,
  parseMeetFilePreviewAction,
} from "./actions";

const MEET_ACCEPT = ".sd3,.sdif,.cl2,.hy3,.ev3,.hyv,.xls,.xlsx,.txt,.zip";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_STEPS = ["upload", "review", "done"] as const;
type ImportStep = (typeof IMPORT_STEPS)[number];
const importStepParser = parseAsStringEnum([...IMPORT_STEPS]).withDefault(
  "upload",
);
const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "mixed", label: "Mixed" },
] as const;

/** Entries/results packs omit empty events; EV3/HYV/XLS carry the full schedule. */
function isEntriesOnlyIncompleteSchedule(
  format: ReturnType<typeof detectMeetFileFormat> | string,
  sourceFiles?: string[],
): boolean {
  const fromSources = (sourceFiles ?? [])
    .map((name) => detectMeetFileFormat(name))
    .filter((f): f is NonNullable<typeof f> => f != null);
  const formats =
    fromSources.length > 0
      ? fromSources
      : format
        ? [format as NonNullable<ReturnType<typeof detectMeetFileFormat>>]
        : [];
  if (formats.length === 0) return false;
  const hasEventTemplate = formats.some(
    (f) => f === "ev3" || f === "hyv" || f === "xls",
  );
  if (hasEventTemplate) return false;
  return formats.some((f) => f === "hy3" || f === "cl2" || f === "sdif");
}

export type MeetImportOption = {
  id: string;
  name: string;
  startDateLabel: string;
};

type ReviewState = {
  name: string;
  startDate: string;
  endDate: string;
  entryDeadline: string;
  course: "SCY" | "SCM" | "LCM";
  location: string;
  address: string;
  opponents: string;
  maxIndividualEntries: string;
  maxRelayEntries: string;
  maxCombinedEntries: string;
  events: MeetImportPreview["events"];
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isExistingMeetTarget(target: string): boolean {
  return target !== "" && target !== "auto" && target !== "new";
}

function optionalLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function rebuildEventKey(
  event: MeetImportPreview["events"][number],
  course: Course,
  gender: EventGender,
) {
  return buildEventKey(
    event.distance,
    event.stroke as Stroke | RelayStroke,
    course,
    gender,
  );
}

export function MeetImportButton({
  teamId,
  meets,
  defaultMeetId,
  triggerLabel = "Import",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  teamId: string;
  meets: MeetImportOption[];
  /** When set (e.g. meet detail page), default target to that meet */
  defaultMeetId?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
}) {
  const { canManageTeam } = useTeamCapabilities();
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [importStep, setImportStep] = useQueryState(
    "importStep",
    importStepParser,
  );
  const step = (importStep ?? "upload") as ImportStep;
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{
    label: string;
    sizeLabel: string;
    files: MeetImportFilePayload[];
  } | null>(null);
  const [preview, setPreview] = useState<MeetImportPreview | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultMeetId, setResultMeetId] = useState<string | null>(null);
  const [resultIsResults, setResultIsResults] = useState(false);
  const [target, setTarget] = useState<string>(
    defaultMeetId ? defaultMeetId : "auto",
  );
  const [addNewAthletes, setAddNewAthletes] = useState(false);
  const [athleteMaps, setAthleteMaps] = useState<
    Record<string, AthleteMapAction>
  >({});
  const [eventConflictResolutions, setEventConflictResolutions] = useState<
    Record<number, "keep_manual" | "use_import">
  >({});

  function resetFlow() {
    void setImportStep("upload");
    setBusy(false);
    setError(null);
    setFileMeta(null);
    setPreview(null);
    setReview(null);
    setResultMessage(null);
    setResultMeetId(null);
    setResultIsResults(false);
    setAddNewAthletes(false);
    setAthleteMaps({});
    setEventConflictResolutions({});
  }

  useEffect(() => {
    if (step === "review" && (!preview || !review || !fileMeta)) {
      void setImportStep("upload");
      setError(null);
    }
    if (step === "done" && !resultMessage) {
      void setImportStep("upload");
    }
  }, [step, preview, review, fileMeta, resultMessage, setImportStep]);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setError(null);

    if (files.some((f) => isZipFilename(f.name)) && files.length > 1) {
      setError(
        "Choose one ZIP meet pack, or select multiple non-ZIP files (like an HFILE + CFILE pair) — not both together.",
      );
      return;
    }

    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(
        `“${oversized.name}” is larger than the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit. Export a smaller file and try again.`,
      );
      return;
    }

    setBusy(true);
    try {
      const decoded = await Promise.all(
        files.map(async (file) => {
          const lower = file.name.toLowerCase();
          const isBinary =
            lower.endsWith(".xls") ||
            lower.endsWith(".xlsx") ||
            lower.endsWith(".zip");
          const encoding = isBinary ? ("base64" as const) : ("utf8" as const);
          let content: string;
          if (isBinary) {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            content = btoa(binary);
          } else {
            content = await file.text();
          }
          return { filename: file.name, content, encoding, size: file.size };
        }),
      );

      if (decoded.length === 1) {
        const [only] = decoded;
        if (!isZipFilename(only!.filename)) {
          const format = detectMeetFileFormat(
            only!.filename,
            only!.encoding === "utf8" ? only!.content : undefined,
          );
          if (!format) {
            setError(
              "This file isn't a supported meet format. Choose an SD3/SDIF, HY3, EV3, HYV, CL2, XLS, or ZIP file exported from Meet Manager or Team Manager.",
            );
            return;
          }
        }
      }

      const payloads: MeetImportFilePayload[] = decoded.map((d) => ({
        content: d.content,
        filename: d.filename,
        encoding: d.encoding,
      }));

      const previewMeetId =
        target !== "auto" && target !== "new" ? target : defaultMeetId;
      const parsed = await parseMeetFilePreviewAction(
        teamId,
        payloads,
        previewMeetId ? { meetId: previewMeetId } : undefined,
      );

      const conflictDefaults: Record<number, "keep_manual" | "use_import"> = {};
      for (const conflict of parsed.eventConflicts ?? []) {
        conflictDefaults[conflict.eventNumber] = "keep_manual";
      }
      setEventConflictResolutions(conflictDefaults);

      const namesLabel = decoded.map((d) => d.filename).join(" + ");
      const totalSize = decoded.reduce((sum, d) => sum + d.size, 0);
      setFileMeta({
        label:
          parsed.sourceFilename && parsed.sourceFilename !== namesLabel
            ? `${namesLabel} → ${parsed.sourceFilename}`
            : namesLabel,
        sizeLabel: formatBytes(totalSize),
        files: payloads,
      });
      setPreview(parsed);
      setReview({
        name: parsed.name,
        startDate: parsed.startDate?.slice(0, 10) ?? "",
        endDate: parsed.endDate?.slice(0, 10) ?? "",
        entryDeadline: parsed.entryDeadline?.slice(0, 10) ?? "",
        course: parsed.course,
        location: parsed.location ?? "",
        address: parsed.address ?? "",
        opponents: "",
        maxIndividualEntries:
          parsed.entryLimits?.maxIndividualEntries?.toString() ?? "",
        maxRelayEntries: parsed.entryLimits?.maxRelayEntries?.toString() ?? "",
        maxCombinedEntries:
          parsed.entryLimits?.maxCombinedEntries?.toString() ?? "",
        events: parsed.events.map((e) => ({ ...e })),
      });
      setAddNewAthletes(false);
      setAthleteMaps({});
      if (parsed.resultsFile && target === "auto") {
        if (parsed.suggestedMeetId) setTarget(parsed.suggestedMeetId);
        else if (meets.length === 0) setTarget("new");
        else setTarget("");
      }
      void setImportStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!fileMeta || !review) return;
    setBusy(true);
    setError(null);
    try {
      const attachingResults =
        preview?.resultsFile === true && isExistingMeetTarget(target);
      const options = attachingResults
        ? { target: "existing" as const, meetId: target }
        : target === "auto"
          ? { target: "auto" as const }
          : target === "new"
            ? { target: "new" as const }
            : { target: "existing" as const, meetId: target };

      const result = await importMeetFileAction(teamId, fileMeta.files, {
        ...options,
        athleteMaps,
        addNewAthletes,
        eventConflictResolutions,
        review: {
          name: review.name,
          startDate: review.startDate || undefined,
          endDate: review.endDate,
          entryDeadline: review.entryDeadline,
          course: review.course,
          location: review.location || undefined,
          address: review.address || undefined,
          opponents: review.opponents.trim() || undefined,
          maxIndividualEntries: optionalLimit(review.maxIndividualEntries),
          maxRelayEntries: optionalLimit(review.maxRelayEntries),
          maxCombinedEntries: optionalLimit(review.maxCombinedEntries),
          events: review.events,
        },
      });

      const parts = [
        result.events ? `${result.events} events` : null,
        result.entries ? `${result.entries} entries` : null,
        result.results ? `${result.results} results` : null,
        result.relays ? `${result.relays} relays` : null,
        result.swimmersCreated
          ? `${result.swimmersCreated} swimmers added`
          : null,
        result.entriesSkipped
          ? `${result.entriesSkipped} entries skipped (unmatched)`
          : null,
        result.resultsSkipped
          ? `${result.resultsSkipped} results skipped (other teams / unmatched)`
          : null,
      ].filter(Boolean);

      setResultMeetId(result.meetId);
      setResultIsResults(preview?.resultsFile === true);
      setResultMessage(
        result.warning
          ? result.warning
          : result.linkedExisting
            ? `Linked to existing meet · ${parts.join(" · ") || "done"}`
            : `Created meet · ${parts.join(" · ") || "done"}`,
      );
      void setImportStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function updateEventGender(index: number, genderRaw: string) {
    setReview((prev) => {
      if (!prev) return prev;
      const gender = parseEventGender(genderRaw);
      const events = prev.events.map((event, i) => {
        if (i !== index) return event;
        return {
          ...event,
          gender,
          eventKey: rebuildEventKey(event, prev.course, gender),
        };
      });
      return { ...prev, events };
    });
  }

  function updateEventAgeGroup(index: number, ageGroup: string) {
    setReview((prev) => {
      if (!prev) return prev;
      const events = prev.events.map((event, i) =>
        i === index
          ? { ...event, ageGroup: ageGroup.trim() || undefined }
          : event,
      );
      return { ...prev, events };
    });
  }

  const reviewHasAgeGroups =
    review?.events.some((event) => event.ageGroup != null) ?? false;

  if (!canManageTeam) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={triggerVariant}
              size={triggerSize}
              disabled
            />
          }
        >
          <Upload data-icon="inline-start" />
          {triggerLabel}
        </TooltipTrigger>
        <TooltipContent>{TEAM_MANAGE_ROLE_TOOLTIP}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetFlow();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant={triggerVariant} size={triggerSize} />
        }
      >
        <Upload data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {step === "review"
              ? preview?.resultsFile && target !== "new"
                ? "Add results"
                : "Review import"
              : step === "done"
                ? "Import complete"
                : "Import meet file"}
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? preview?.resultsFile && target !== "new"
                ? "Choose the meet these results belong to."
                : "Confirm meet details and entry limits before adding."
              : step === "done"
                ? "Your file has been imported."
                : "Meet Events: EV3 or EV3+HYV zip. Results: CL2/HY3/SD3 or zip (including CL2-only). Entries: CL2+HY3 zip. Roster-only zips go under Roster import."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          {step === "upload" ? (
            <>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`${inputId}-target`}>Attach to</FieldLabel>
                <Select
                  items={[
                    {
                      value: "auto",
                      label: "Auto (match results if possible)",
                    },
                    { value: "new", label: "Always create a new meet" },
                    ...meets.map((meet) => ({
                      value: meet.id,
                      label: `${meet.name} · ${meet.startDateLabel}`,
                    })),
                  ]}
                  value={target}
                  onValueChange={(v) => {
                    if (v != null) setTarget(v);
                  }}
                >
                  <SelectTrigger id={`${inputId}-target`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="auto">
                        Auto (match results if possible)
                      </SelectItem>
                      <SelectItem value="new">
                        Always create a new meet
                      </SelectItem>
                      {meets.map((meet) => (
                        <SelectItem key={meet.id} value={meet.id}>
                          {meet.name} · {meet.startDateLabel}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <div
                role="button"
                tabIndex={0}
                data-dragging={dragging || undefined}
                aria-disabled={busy}
                className={cn(
                  "border-input has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 data-[dragging=true]:bg-accent/50 flex min-h-40 w-full min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-sm border border-dashed p-6 text-center has-[input:focus]:ring-[3px]",
                  busy && "pointer-events-none opacity-60",
                )}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.length) {
                    void handleFiles(e.dataTransfer.files);
                  }
                }}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  type="file"
                  accept={MEET_ACCEPT}
                  multiple
                  disabled={busy}
                  className="sr-only"
                  aria-label="Upload meet file"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void handleFiles(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                {busy ? (
                  <Loader
                    className="size-10 animate-spin stroke-1"
                    aria-hidden
                  />
                ) : (
                  <Upload className="size-10 shrink-0 stroke-1" aria-hidden />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-base font-medium text-balance">
                    {busy
                      ? "Parsing file…"
                      : "Drag & Drop or Choose files to upload"}
                  </p>
                  <p className="text-muted-foreground text-sm text-balance">
                    SD3, HY3, EV3, HYV, CL2, XLS, or ZIP · Select multiple files
                    (e.g. HFILE + CFILE) or one ZIP pack · Up to{" "}
                    {MAX_FILE_BYTES / (1024 * 1024)} MB each
                  </p>
                </div>
              </div>
            </>
          ) : null}

          {step === "review" && review && preview && fileMeta ? (
            <>
              <p className="text-muted-foreground text-sm">
                {fileMeta.label} · {fileMeta.sizeLabel} · {preview.format} ·{" "}
                {preview.events.length} events
                {preview.entryCount ? ` · ${preview.entryCount} entries` : ""}
                {preview.resultCount ? ` · ${preview.resultCount} results` : ""}
                {preview.exhibitionCount
                  ? ` · ${preview.exhibitionCount} exhibition`
                  : ""}
              </p>

              {preview.resultsFile ? (
                <Field>
                  <FieldLabel htmlFor={`${inputId}-results-meet`}>
                    Meet
                  </FieldLabel>
                  <Select
                    items={[
                      ...meets.map((meet) => ({
                        value: meet.id,
                        label: `${meet.name} · ${meet.startDateLabel}`,
                      })),
                      { value: "new", label: "Create a new meet" },
                    ]}
                    value={
                      isExistingMeetTarget(target) || target === "new"
                        ? target
                        : null
                    }
                    onValueChange={(value) => {
                      if (value != null) setTarget(value);
                    }}
                  >
                    <SelectTrigger
                      id={`${inputId}-results-meet`}
                      className="w-full"
                    >
                      <SelectValue placeholder="Choose a meet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {meets.map((meet) => (
                          <SelectItem key={meet.id} value={meet.id}>
                            {meet.name} · {meet.startDateLabel}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">Create a new meet</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Individual and relay results for your roster are added to
                    this meet.
                  </FieldDescription>
                </Field>
              ) : null}

              {preview.skippedDiveEvents != null &&
              preview.skippedDiveEvents > 0 ? (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertTitle>Diving events skipped</AlertTitle>
                  <AlertDescription>
                    {preview.skippedDiveEvents === 1
                      ? "1 diving event was found in this file and was not imported."
                      : `${preview.skippedDiveEvents} diving events were found in this file and were not imported.`}{" "}
                    Lane4 HQ currently supports swim events only; diving support
                    is planned.
                  </AlertDescription>
                </Alert>
              ) : null}

              {!preview.resultsFile &&
              isEntriesOnlyIncompleteSchedule(
                preview.format,
                preview.sourceFiles,
              ) ? (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertTitle>Event list may be incomplete</AlertTitle>
                  <AlertDescription>
                    Entries files (CL2/HY3/SD3) only include events that have at
                    least one swimmer or relay team. Empty events and relays
                    with no teams will not appear. If you have the host EV3 or
                    HYV event file, upload it with this pack (or as a ZIP) for
                    the full schedule.
                  </AlertDescription>
                </Alert>
              ) : null}

              {preview.eventConflicts && preview.eventConflicts.length > 0 ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Event conflicts</p>
                    <p className="text-muted-foreground text-sm">
                      These event numbers already exist on the meet with
                      different strokes. Hand-added events keep their identity.
                      Imported events can be replaced from the file.
                    </p>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {preview.eventConflicts.map((conflict) => (
                      <div
                        key={conflict.eventNumber}
                        className="grid gap-2 border-b border-border/60 py-2 last:border-0 sm:grid-cols-[1fr_minmax(12rem,16rem)] sm:items-center"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="font-medium">
                            Event #{conflict.eventNumber}
                          </p>
                          <p className="text-muted-foreground">
                            Current: {conflict.manual.distance}{" "}
                            {conflict.manual.stroke} ({conflict.manual.gender})
                            {conflict.manual.importedFromFile
                              ? ""
                              : " — hand-added"}
                          </p>
                          <p className="text-muted-foreground">
                            Import: {conflict.imported.distance}{" "}
                            {conflict.imported.stroke} (
                            {conflict.imported.gender})
                          </p>
                        </div>
                        {conflict.manual.importedFromFile ? (
                          <Select
                            items={[
                              {
                                value: "keep_manual",
                                label: "Keep current event",
                              },
                              {
                                value: "use_import",
                                label: "Use imported event",
                              },
                            ]}
                            value={
                              eventConflictResolutions[conflict.eventNumber] ??
                              "keep_manual"
                            }
                            onValueChange={(value) => {
                              if (!value) return;
                              setEventConflictResolutions((current) => ({
                                ...current,
                                [conflict.eventNumber]: value as
                                  | "keep_manual"
                                  | "use_import",
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="keep_manual">
                                  Keep current event
                                </SelectItem>
                                <SelectItem value="use_import">
                                  Use imported event
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Hand-added events keep their identity.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {preview.athleteMatch &&
              (preview.resultCount > 0 || preview.entryCount > 0) ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Athlete matching</p>
                    <p className="text-muted-foreground text-sm">
                      Meet files include every team. Only athletes on your
                      roster are imported unless you map or add them.
                    </p>
                    <p className="text-sm">
                      {preview.athleteMatch.matchedCount} matched
                      {preview.athleteMatch.reviewCount
                        ? ` · ${preview.athleteMatch.reviewCount} need review`
                        : ""}
                      {preview.athleteMatch.unmatchedResultCount
                        ? ` · ${preview.athleteMatch.unmatchedResultCount} from unmatched athletes`
                        : ""}
                    </p>
                  </div>

                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox
                      id={`${inputId}-add-athletes`}
                      checked={addNewAthletes}
                      onCheckedChange={(checked) =>
                        setAddNewAthletes(checked === true)
                      }
                    />
                    <FieldLabel
                      htmlFor={`${inputId}-add-athletes`}
                      className="font-normal"
                    >
                      Add unmatched athletes to roster
                    </FieldLabel>
                  </Field>
                  <FieldDescription>
                    Off by default (like Team Manager). Requires DOB and gender
                    in the file.
                  </FieldDescription>

                  {preview.athleteMatch.reviewAthletes.length > 0 ? (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {preview.athleteMatch.reviewAthletes.map((athlete) => {
                        const canCreate = Boolean(
                          athlete.dateOfBirth && athlete.gender,
                        );
                        const selectItems = [
                          { value: "skip", label: "Skip" },
                          ...(canCreate
                            ? [{ value: "create", label: "Add to roster" }]
                            : []),
                          ...athlete.candidates.map((c) => ({
                            value: c.membershipId,
                            label: `${c.displayName} (${c.reason.replaceAll("_", " ")})`,
                          })),
                          ...preview
                            .athleteMatch!.rosterOptions.filter(
                              (r) =>
                                !athlete.candidates.some(
                                  (c) => c.membershipId === r.membershipId,
                                ),
                            )
                            .slice(0, 40)
                            .map((r) => ({
                              value: r.membershipId,
                              label: r.displayName,
                            })),
                        ];
                        const value = athleteMaps[athlete.key] ?? "skip";
                        return (
                          <div
                            key={athlete.key}
                            className="grid gap-2 border-b border-border/60 py-2 last:border-0 sm:grid-cols-[1fr_minmax(12rem,16rem)] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {athlete.swimmerName}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {athlete.teamCode
                                  ? `${athlete.teamCode} · `
                                  : ""}
                                {athlete.dateOfBirth ?? "no DOB"}
                                {athlete.usaMemberId
                                  ? ` · ${athlete.usaMemberId}`
                                  : ""}
                                {` · ${athlete.resultCount} result${athlete.resultCount === 1 ? "" : "s"}`}
                                {athlete.status === "ambiguous"
                                  ? " · ambiguous"
                                  : " · unmatched"}
                              </p>
                            </div>
                            <LabeledCombobox
                              items={selectItems}
                              value={value}
                              onChange={(v) => {
                                if (!v) return;
                                setAthleteMaps((prev) => ({
                                  ...prev,
                                  [athlete.key]: v as AthleteMapAction,
                                }));
                              }}
                              placeholder="Map athlete…"
                              emptyText="No athletes found."
                              showClear={false}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!preview.resultsFile || target === "new" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`${inputId}-name`}>Meet name</Label>
                      <Input
                        id={`${inputId}-name`}
                        value={review.name}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <Field>
                      <FieldLabel htmlFor={`${inputId}-start`}>
                        Start date
                      </FieldLabel>
                      <DatePickerField
                        id={`${inputId}-start`}
                        value={review.startDate}
                        onChange={(startDate) =>
                          setReview((prev) =>
                            prev ? { ...prev, startDate } : prev,
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${inputId}-end`}>
                        End date
                      </FieldLabel>
                      <DatePickerField
                        id={`${inputId}-end`}
                        value={review.endDate}
                        onChange={(endDate) =>
                          setReview((prev) =>
                            prev ? { ...prev, endDate } : prev,
                          )
                        }
                        placeholder="Same as start (optional)"
                        allowClear
                      />
                      <FieldDescription>
                        Clear if the Hy-Tek file lists an extra day you don’t
                        want.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${inputId}-deadline`}>
                        Entry deadline
                      </FieldLabel>
                      <DatePickerField
                        id={`${inputId}-deadline`}
                        value={review.entryDeadline}
                        onChange={(entryDeadline) =>
                          setReview((prev) =>
                            prev ? { ...prev, entryDeadline } : prev,
                          )
                        }
                        placeholder="Required"
                      />
                      <FieldDescription>
                        Required: when entries are due to the meet host.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${inputId}-course`}>
                        Course
                      </FieldLabel>
                      <Select
                        value={review.course}
                        onValueChange={(v) => {
                          if (v == null) return;
                          const course = v as Course;
                          setReview((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              course,
                              events: prev.events.map((event) => ({
                                ...event,
                                eventKey: rebuildEventKey(
                                  event,
                                  course,
                                  parseEventGender(event.gender),
                                ),
                              })),
                            };
                          });
                        }}
                      >
                        <SelectTrigger
                          id={`${inputId}-course`}
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="SCY">SCY</SelectItem>
                            <SelectItem value="SCM">SCM</SelectItem>
                            <SelectItem value="LCM">LCM</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="space-y-2">
                      <Label htmlFor={`${inputId}-location`}>Venue</Label>
                      <Input
                        id={`${inputId}-location`}
                        value={review.location}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev ? { ...prev, location: e.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${inputId}-address`}>Address</Label>
                      <Input
                        id={`${inputId}-address`}
                        value={review.address}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev ? { ...prev, address: e.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`${inputId}-opponents`}>Opponents</Label>
                      <Input
                        id={`${inputId}-opponents`}
                        maxLength={500}
                        placeholder="Optional"
                        value={review.opponents}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev
                              ? { ...prev, opponents: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor={`${inputId}-max-ind`}>
                        Max individual
                      </Label>
                      <Input
                        id={`${inputId}-max-ind`}
                        inputMode="numeric"
                        placeholder="—"
                        value={review.maxIndividualEntries}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  maxIndividualEntries: e.target.value,
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${inputId}-max-relay`}>Max relay</Label>
                      <Input
                        id={`${inputId}-max-relay`}
                        inputMode="numeric"
                        placeholder="—"
                        value={review.maxRelayEntries}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev
                              ? { ...prev, maxRelayEntries: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${inputId}-max-combined`}>
                        Max combined
                      </Label>
                      <Input
                        id={`${inputId}-max-combined`}
                        inputMode="numeric"
                        placeholder="—"
                        value={review.maxCombinedEntries}
                        onChange={(e) =>
                          setReview((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  maxCombinedEntries: e.target.value,
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>

                  {review.events.length > 0 ? (
                    <div className="flex max-h-48 min-w-0 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                      <p className="text-muted-foreground text-xs tracking-wide uppercase">
                        Events ({review.events.length})
                      </p>
                      {review.events.map((event, index) => (
                        <div
                          key={`${event.eventKey}-${index}`}
                          className={cn(
                            "grid items-center gap-2 text-sm",
                            reviewHasAgeGroups
                              ? "grid-cols-[auto_1fr_auto_auto]"
                              : "grid-cols-[auto_1fr_auto]",
                          )}
                        >
                          <span className="text-muted-foreground tabular-nums">
                            #{event.eventNumber ?? "—"}
                            {event.eventSuffix ?? ""}
                          </span>
                          <span className="truncate">
                            {formatEventName(event.distance, event.stroke)}
                            {event.qualifyingTimeMs != null &&
                            event.qualifyingTimeMs > 0 ? (
                              <span className="text-muted-foreground ml-1.5 tabular-nums">
                                QT {formatTime(event.qualifyingTimeMs)}
                              </span>
                            ) : null}
                          </span>
                          <Select
                            items={GENDER_OPTIONS}
                            value={parseEventGender(event.gender)}
                            onValueChange={(v) => {
                              if (v != null) updateEventGender(index, v);
                            }}
                          >
                            <SelectTrigger className="h-8 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="mixed">Mixed</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {reviewHasAgeGroups ? (
                            <Input
                              className="h-8 w-20"
                              aria-label={`Age group for event ${event.eventNumber ?? index + 1}`}
                              placeholder="Age"
                              value={event.ageGroup ?? ""}
                              onChange={(e) =>
                                updateEventAgeGroup(index, e.target.value)
                              }
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No events in this file (entries/results only).
                    </p>
                  )}
                </>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (target === "") setTarget(defaultMeetId ?? "auto");
                    void setImportStep("upload");
                    setPreview(null);
                    setReview(null);
                    setFileMeta(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    (preview.resultsFile && target !== "new"
                      ? !isExistingMeetTarget(target)
                      : !review.name.trim() || !review.entryDeadline.trim())
                  }
                  onClick={() => void commitImport()}
                >
                  {busy
                    ? "Importing…"
                    : preview.resultsFile && target !== "new"
                      ? "Add results"
                      : "Confirm import"}
                </Button>
              </div>
            </>
          ) : null}

          {step === "done" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{resultMessage}</p>
              <div className="flex flex-wrap gap-2">
                {resultMeetId ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(
                        resultIsResults
                          ? `/team/${teamId}/meets/${resultMeetId}/results`
                          : `/team/${teamId}/meets/${resultMeetId}`,
                      );
                    }}
                  >
                    {resultIsResults ? "View results" : "Open meet"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resetFlow()}
                >
                  Import another
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
