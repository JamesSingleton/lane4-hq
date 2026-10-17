import {
  scoringPreset,
  setScoring,
  updateMeetDetails,
} from "@lane4hq/meet-engine/create";
import {
  detectTeam,
  type MergeSummary,
  mergeTeamEntries,
} from "@lane4hq/meet-engine/entries";
import {
  genderOrder,
  hasNumberGaps,
  renumberEvents,
  swapGenderOrder,
  updateEvent,
} from "@lane4hq/meet-engine/event-edits";
import { eventTitle } from "@lane4hq/meet-engine/labels";
import type { Meet, Team } from "@lane4hq/meet-engine/model";
import { seedAllEvents } from "@lane4hq/meet-engine/seeding";
import { eventProgress } from "@lane4hq/meet-engine/standings";
import {
  addEvents,
  nextEventNumber,
  removeEvents,
} from "@lane4hq/meet-engine/templates";
import type { ParsedMeet } from "@lane4hq/swim-formats";
import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lane4hq/ui/components/dialog";
import { Input } from "@lane4hq/ui/components/input";
import { Label } from "@lane4hq/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lane4hq/ui/components/table";
import {
  ArrowUpDown,
  CheckCircle2,
  ListOrdered,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { ChoiceSelect } from "../components/choice-select";
import { DatePicker } from "../components/date-picker";
import { EditEventDialog } from "../components/edit-event-dialog";
import { AddEventsDialog } from "../components/event-builder";
import { Section } from "../components/section";
import { pickMeetFiles } from "../hooks/pick-files";
import { missingMeetEventsMessage } from "../lib/entry-import";
import { COURSES, LANES, SCORING } from "../lib/meet-choices";
import { errorMessage } from "../lib/native";
import { useMeet } from "../state/meet-context";

function ImportSummary({ summary }: { summary: MergeSummary }) {
  const missing = missingMeetEventsMessage(summary.skipped);
  const otherSkipped = summary.skipped.filter(
    (row) => row.reason !== "Event isn't in this meet",
  );
  const onlyMissing =
    summary.added === 0 &&
    summary.replaced === 0 &&
    summary.kept === 0 &&
    otherSkipped.length === 0 &&
    missing != null;

  return (
    <div className="flex flex-col gap-2">
      {missing ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Some entries weren't imported</AlertTitle>
          <AlertDescription>{missing}</AlertDescription>
        </Alert>
      ) : null}
      {onlyMissing ? null : (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>
            {summary.team.code}: {summary.added} entries added
            {summary.replaced ? `, ${summary.replaced} replaced` : ""}
            {summary.kept ? `, ${summary.kept} kept (already swum)` : ""}
          </AlertTitle>
          <AlertDescription>
            {summary.athletes} swimmers.
            {otherSkipped.length > 0
              ? ` ${otherSkipped.length} skipped: ${otherSkipped
                  .slice(0, 4)
                  .map(
                    (s) =>
                      `${s.name} (event ${s.eventNumber ?? "?"}: ${s.reason})`,
                  )
                  .join("; ")}${otherSkipped.length > 4 ? "…" : ""}`
              : ""}
            {summary.heatsNeedingReseed.length > 0
              ? ` ${summary.heatsNeedingReseed.length} seeded event(s) lost swimmers; reseed them on the heat sheet.`
              : ""}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function SetupScreen({ onSeeded }: { onSeeded: () => void }) {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    parsed: ParsedMeet;
    team: Team;
    files: string[];
  } | null>(null);
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const entriesByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of meet.entries) {
      if (!e.scratched) counts.set(e.eventId, (counts.get(e.eventId) ?? 0) + 1);
    }
    return counts;
  }, [meet.entries]);
  const entriesByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of meet.entries)
      counts.set(e.teamCode, (counts.get(e.teamCode) ?? 0) + 1);
    return counts;
  }, [meet.entries]);

  function importEntries() {
    setError(null);
    startTransition(async () => {
      try {
        const files = await pickMeetFiles(
          "Choose a team's entry file (HY3, CL2, SD3, or ZIP)",
        );
        if (files.length === 0) return;
        const parsed = parseMeetFilesFromBytes(files);
        setPendingImport({
          parsed,
          team: detectTeam(parsed, files[0]!.filename),
          files: files.map((f) => f.filename),
        });
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  function confirmImport(team: Team) {
    if (!pendingImport) return;
    try {
      update((m) => {
        const merged = mergeTeamEntries(m, pendingImport.parsed, team);
        setSummary(merged.summary);
        return merged.meet;
      });
      setPendingImport(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function seedAll() {
    try {
      update((m) => seedAllEvents(m));
      onSeeded();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Setup</h1>
          <p className="text-sm text-muted-foreground">
            Meet details, events, and each team's entries. Then seed heats.
          </p>
        </div>
        <Button onClick={seedAll} disabled={meet.entries.length === 0}>
          <ListOrdered />
          Seed all events
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>That didn't work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Section title="Meet">
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Name" className="sm:col-span-3">
            <Input
              defaultValue={meet.name}
              onBlur={(e) =>
                update((m) =>
                  updateMeetDetails(m, {
                    name: e.currentTarget.value.trim() || m.name,
                  }),
                )
              }
            />
          </Field>
          <Field label="Location" className="sm:col-span-3">
            <Input
              defaultValue={meet.location ?? ""}
              onBlur={(e) =>
                update((m) =>
                  updateMeetDetails(m, {
                    location: e.currentTarget.value.trim() || undefined,
                  }),
                )
              }
            />
          </Field>
          <LabeledControl
            id="meet-start"
            label={meet.endDate ? "First day" : "Date"}
            className="sm:col-span-2"
          >
            <DatePicker
              id="meet-start"
              value={meet.startDate}
              onChange={(startDate) =>
                update((m) =>
                  updateMeetDetails(m, {
                    startDate,
                    ...(startDate && m.endDate && m.endDate <= startDate
                      ? { endDate: undefined }
                      : {}),
                  }),
                )
              }
            />
          </LabeledControl>
          <LabeledControl
            id="meet-end"
            label="Last day"
            hint={meet.endDate ? undefined : "One-day meet"}
            className="sm:col-span-2"
          >
            <DatePicker
              id="meet-end"
              value={meet.endDate}
              placeholder="Add a last day"
              allowClear
              notBefore={meet.startDate}
              onChange={(endDate) =>
                update((m) =>
                  updateMeetDetails(m, {
                    endDate:
                      endDate && endDate !== m.startDate ? endDate : undefined,
                  }),
                )
              }
            />
          </LabeledControl>
          <LabeledControl
            id="meet-lanes"
            label="Pool"
            className="sm:col-span-2"
          >
            <ChoiceSelect
              id="meet-lanes"
              value={String(meet.poolLanes) as (typeof LANES)[number]["value"]}
              onValueChange={(v) =>
                update((m) => updateMeetDetails(m, { poolLanes: Number(v) }))
              }
              items={LANES}
            />
          </LabeledControl>
          <LabeledControl
            id="meet-course"
            label="Course"
            className="sm:col-span-3"
          >
            <ChoiceSelect
              id="meet-course"
              value={meet.course}
              onValueChange={(course) =>
                update((m) => updateMeetDetails(m, { course }))
              }
              items={COURSES}
            />
          </LabeledControl>
          <LabeledControl
            id="meet-scoring"
            label="Scoring"
            className="sm:col-span-3"
          >
            <ChoiceSelect
              id="meet-scoring"
              value={meet.scoring.preset}
              onValueChange={(preset) =>
                update((m) => setScoring(m, scoringPreset(preset)))
              }
              items={SCORING}
            />
          </LabeledControl>
        </div>
      </Section>

      <Section
        title="Teams"
        description="Import each team's entry pack from Team Manager, TeamUnify, SwimTopia, or Commit. Re-importing a team replaces its unswum entries."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={importEntries}
            disabled={isPending || meet.events.length === 0}
          >
            <Users />
            {isPending ? "Reading…" : "Import team entries"}
          </Button>
        }
      >
        {summary ? <ImportSummary summary={summary} /> : null}
        {meet.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {meet.teams.map((t) => (
              <div
                key={t.code}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span className="font-mono text-sm font-semibold">
                  {t.code}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t.name !== t.code ? t.name : ""}
                </span>
                {t.lsc ? <Badge variant="outline">{t.lsc}</Badge> : null}
                <Badge variant="secondary">
                  {entriesByTeam.get(t.code) ?? 0} entries
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Section>

      <EventsSection entriesByEvent={entriesByEvent} onError={setError} />

      <ConfirmTeamDialog
        pending={pendingImport}
        onCancel={() => setPendingImport(null)}
        onConfirm={confirmImport}
      />
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label
      className={`flex flex-col gap-1.5 text-sm font-medium ${className ?? ""}`}
    >
      {label}
      {children}
    </label>
  );
}

/** For controls that render a button (pickers, selects), which can't nest in a label. */
function LabeledControl({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ConfirmTeamDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: { parsed: ParsedMeet; team: Team; files: string[] } | null;
  onCancel: () => void;
  onConfirm: (team: Team) => void;
}) {
  const individual = pending?.parsed.entries.length ?? 0;
  const relays = pending?.parsed.relays?.length ?? 0;
  return (
    <Dialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {pending ? (
          <form
            key={pending.files.join("|")}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              onConfirm({
                code: String(data.get("code") ?? ""),
                name:
                  String(data.get("name") ?? "").trim() ||
                  String(data.get("code") ?? ""),
                lsc:
                  String(data.get("lsc") ?? "")
                    .trim()
                    .toUpperCase() || undefined,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Import entries</DialogTitle>
              <DialogDescription>
                {pending.files.join(", ")}: {individual} individual entries,{" "}
                {relays} relays. Confirm which team these belong to.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1 flex flex-col gap-1.5">
                <Label htmlFor="team-code">Code</Label>
                <Input
                  id="team-code"
                  name="code"
                  defaultValue={pending.team.code}
                  required
                  maxLength={5}
                  className="font-mono uppercase"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="team-name">Team name</Label>
                <Input
                  id="team-name"
                  name="name"
                  defaultValue={pending.team.name}
                />
              </div>
              <div className="col-span-1 flex flex-col gap-1.5">
                <Label htmlFor="team-lsc">LSC</Label>
                <Input
                  id="team-lsc"
                  name="lsc"
                  defaultValue={pending.team.lsc ?? ""}
                  maxLength={2}
                  className="font-mono uppercase"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit">Import</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EventsSection({
  entriesByEvent,
  onError,
}: {
  entriesByEvent: Map<string, number>;
  onError: (message: string | null) => void;
}) {
  const {
    state: { meet },
    actions: { update },
  } = useMeet();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const rows = meet.events.map((event) => ({
    event,
    progress: eventProgress(meet, event.id),
  }));
  const editing = meet.events.find((e) => e.id === editingId) ?? null;
  const order = genderOrder(meet);
  const gaps = hasNumberGaps(meet);

  function run(fn: (m: Meet) => Meet) {
    try {
      onError(null);
      update(fn);
    } catch (e) {
      onError(errorMessage(e));
    }
  }
  const removable = rows.filter((r) => r.progress.verified === 0);
  const chosen = removable.filter((r) => selected.has(r.event.id));
  const allChosen = removable.length > 0 && chosen.length === removable.length;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function remove(ids: string[]) {
    const n = ids.length;
    if (
      !window.confirm(
        n === 1
          ? "Remove this event and its entries?"
          : `Remove ${n} events and their entries?`,
      )
    )
      return;
    try {
      onError(null);
      update((m) => removeEvents(m, ids));
      setSelected(new Set());
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <Section
      title={`Events (${meet.events.length})`}
      description={
        order === "girls"
          ? "Girls swim before boys in each race."
          : order === "boys"
            ? "Boys swim before girls in each race."
            : order === "mixed"
              ? "Some races have boys first and some girls first."
              : undefined
      }
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {chosen.length === 0 && order ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run((m) => swapGenderOrder(m))}
            >
              <ArrowUpDown />
              {order === "girls"
                ? "Switch to boys first"
                : order === "boys"
                  ? "Switch to girls first"
                  : "Swap girls and boys"}
            </Button>
          ) : null}
          {chosen.length === 0 && gaps ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run((m) => renumberEvents(m))}
            >
              <ListOrdered />
              Renumber 1, 2, 3…
            </Button>
          ) : null}
          {chosen.length > 0 ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => remove(chosen.map((r) => r.event.id))}
              >
                <Trash2 />
                Remove {chosen.length}
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant={meet.events.length === 0 ? "default" : "outline"}
            onClick={() => setAdding(true)}
          >
            <Plus />
            Add events
          </Button>
        </div>
      }
    >
      {meet.events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <ListPlus className="size-6 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No events yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start from a high school, age group, or summer league template, or
              build your own list of races in one go.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add events
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all events"
                    checked={allChosen}
                    indeterminate={chosen.length > 0 && !allChosen}
                    disabled={removable.length === 0}
                    onCheckedChange={(on) =>
                      setSelected(
                        new Set(on ? removable.map((r) => r.event.id) : []),
                      )
                    }
                  />
                </TableHead>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="w-24 text-right">Entries</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ event, progress }) => {
                const locked = progress.verified > 0;
                const isSelected = selected.has(event.id);
                return (
                  <TableRow
                    key={event.id}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Select event ${event.number}`}
                        checked={isSelected}
                        disabled={locked}
                        onCheckedChange={(on) => toggle(event.id, on)}
                      />
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {event.number}
                    </TableCell>
                    <TableCell>{eventTitle(event)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {entriesByEvent.get(event.id) ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          progress.state === "complete" ? "default" : "outline"
                        }
                      >
                        {progress.state === "unseeded"
                          ? "Not seeded"
                          : progress.state === "seeded"
                            ? `${progress.heats} heat${progress.heats === 1 ? "" : "s"}`
                            : `${progress.verified}/${progress.heats} heats`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Edit event ${event.number}`}
                          title={
                            event.round === "final"
                              ? "Finals follow their prelim event"
                              : undefined
                          }
                          disabled={locked || event.round === "final"}
                          onClick={() => {
                            onError(null);
                            setEditingId(event.id);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Remove event ${event.number}`}
                          disabled={locked}
                          onClick={() => remove([event.id])}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddEventsDialog
        open={adding}
        onOpenChange={setAdding}
        firstNumber={nextEventNumber(meet)}
        onAdd={(events) => {
          update((m) => addEvents(m, events));
          setAdding(false);
        }}
      />

      <EditEventDialog
        event={editing}
        open={editOpen && editing != null}
        hasEntries={
          editing != null && meet.entries.some((e) => e.eventId === editing.id)
        }
        onOpenChange={setEditOpen}
        onClosed={() => setEditingId(null)}
        onSave={(patch) => {
          if (!editing) return;
          update((m) => updateEvent(m, editing.id, patch));
          setEditOpen(false);
        }}
      />
    </Section>
  );
}
