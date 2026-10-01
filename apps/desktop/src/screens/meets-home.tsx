import {
  type CreateMeetInput,
  createMeet,
  createMeetFromEventFile,
  type EventInput,
} from "@lane4hq/meet-engine/create";
import type { Course, Meet, ScoringPreset } from "@lane4hq/meet-engine/model";
import {
  addEvents,
  expandProgram,
  meetTemplate,
  type ProgramGenders,
} from "@lane4hq/meet-engine/templates";
import { formatLocalDateOnly } from "@lane4hq/swim-core/calendar-date";
import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
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
import { Switch } from "@lane4hq/ui/components/switch";
import {
  ArchiveRestore,
  CalendarPlus,
  FileSearch,
  FileUp,
  Trash2,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { AccountButton } from "../components/account-panel";
import { ChoiceSelect } from "../components/choice-select";
import { DatePicker } from "../components/date-picker";
import { BLANK_TEMPLATE, TemplatePicker } from "../components/event-builder";
import { UpdateBanner } from "../components/update-banner";
import { pickBackupInBrowser, pickMeetFiles } from "../hooks/pick-files";
import { COURSES, GENDER_ORDERS, LANES, SCORING } from "../lib/meet-choices";
import { formatDateRange } from "../lib/meet-labels";
import {
  type MeetRepository,
  type MeetSummary,
  parseMeet,
} from "../lib/meet-repository";
import { errorMessage, isTauri, pickBackupPath } from "../lib/native";
import { importBackup } from "../lib/tauri-repository";

export function MeetsHome({
  repository,
  onOpen,
  onInspect,
}: {
  repository: MeetRepository;
  onOpen: (meet: Meet) => void;
  onInspect: () => void;
}) {
  const [meets, setMeets] = useState<MeetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    repository.list().then(setMeets, (e) => setError(errorMessage(e)));
  }
  useEffect(refresh, [repository]);

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  async function saveAndOpen(meet: Meet) {
    await repository.save(meet);
    onOpen(meet);
  }

  function fromEventFile() {
    run(async () => {
      const files = await pickMeetFiles(
        "Choose the meet's event file (EV3, HYV, or ZIP)",
      );
      if (files.length === 0) return;
      const parsed = parseMeetFilesFromBytes(files);
      if (parsed.events.length === 0) {
        throw new Error(
          "That file has no events. Choose the host's EV3/HYV event file.",
        );
      }
      await saveAndOpen(createMeetFromEventFile(parsed));
    });
  }

  function openBackup() {
    run(async () => {
      if (isTauri()) {
        const path = await pickBackupPath();
        if (!path) return;
        const id = await importBackup(path);
        onOpen(await repository.load(id));
      } else {
        const json = await pickBackupInBrowser();
        if (json) await saveAndOpen(parseMeet(json));
      }
    });
  }

  function remove(meet: MeetSummary) {
    if (
      !window.confirm(
        `Move “${meet.name}” to the trash? Its files are kept in the app data folder.`,
      )
    )
      return;
    run(async () => {
      await repository.remove(meet.id);
      refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            L4
          </span>
          Lane4 Meet Manager
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onInspect}>
            <FileSearch />
            Inspect a file
          </Button>
          <AccountButton />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
          <UpdateBanner />
          <section className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Meets on this computer
            </h1>
            <p className="text-sm text-muted-foreground">
              Everything runs offline. Results publish when a connection is
              available, and every team gets an import file for Team Manager,
              TeamUnify, SwimTopia, or Commit.
            </p>
          </section>

          <section className="grid gap-2 sm:grid-cols-3">
            <ActionCard
              icon={<FileUp />}
              title="New meet from event file"
              description="Start from the host's EV3, HYV, or event ZIP."
              onClick={fromEventFile}
              disabled={isPending}
            />
            <ActionCard
              icon={<CalendarPlus />}
              title="New blank meet"
              description="Start from a template or build your own events."
              onClick={() => setCreating(true)}
              disabled={isPending}
            />
            <ActionCard
              icon={<ArchiveRestore />}
              title="Open a backup"
              description="A .lane4meet file from another deck machine."
              onClick={openBackup}
              disabled={isPending}
            />
          </section>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <section className="flex flex-col divide-y rounded-xl border">
            {meets == null ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : meets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <Waves className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No meets yet</p>
                <p className="text-sm text-muted-foreground">
                  Create one from the host's event file to get started.
                </p>
              </div>
            ) : (
              meets.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left outline-none focus-visible:underline"
                    onClick={() =>
                      run(async () => onOpen(await repository.load(m.id)))
                    }
                  >
                    <span className="truncate text-sm font-medium">
                      {m.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        formatDateRange(
                          m.startDate ?? undefined,
                          m.endDate ?? undefined,
                        ),
                        `${m.events} events`,
                        `${m.teams} teams`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  {m.course ? (
                    <Badge variant="outline">{m.course}</Badge>
                  ) : null}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${m.name} to trash`}
                    onClick={() => remove(m)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}
          </section>
        </div>
      </main>

      <NewMeetDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(input, events) =>
          run(() => {
            const meet = createMeet(input);
            return saveAndOpen(
              events.length > 0 ? addEvents(meet, events) : meet,
            );
          })
        }
      />
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function NewMeetDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateMeetInput, events: EventInput[]) => void;
}) {
  const [session, setSession] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setSession((n) => n + 1);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <NewMeetForm
          key={session}
          onCancel={() => onOpenChange(false)}
          onCreate={(input, events) => {
            onCreate(input, events);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewMeetForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: CreateMeetInput, events: EventInput[]) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState<string | undefined>(() =>
    formatLocalDateOnly(new Date()),
  );
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState<string | undefined>();
  const [course, setCourse] = useState<Course>("SCY");
  const [lanes, setLanes] = useState<(typeof LANES)[number]["value"]>("8");
  const [scoring, setScoring] = useState<ScoringPreset>("invitational");
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE);
  const [genderOrder, setGenderOrder] =
    useState<(typeof GENDER_ORDERS)[number]["value"]>("girls_boys");

  const template = meetTemplate(templateId);
  const bothGenders =
    template?.program.genders === "girls_boys" ||
    template?.program.genders === "boys_girls";
  const needsEnd = multiDay && !endDate;

  function templateEvents(): EventInput[] {
    if (!template) return [];
    const genders: ProgramGenders = bothGenders
      ? genderOrder
      : template.program.genders;
    return expandProgram({ ...template.program, genders });
  }

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = meetTemplate(id);
    if (template) {
      setCourse(template.course);
      setScoring(template.scoring);
    }
  }

  function changeStart(value: string | undefined) {
    setStartDate(value);
    if (value && endDate && endDate <= value) setEndDate(undefined);
  }

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsEnd) return;
        onCreate(
          {
            name,
            location: location.trim() || undefined,
            course,
            poolLanes: Number(lanes),
            scoring,
            startDate,
            endDate: multiDay ? endDate : undefined,
          },
          templateEvents(),
        );
      }}
    >
      <DialogHeader className="border-b p-4">
        <DialogTitle>New meet</DialogTitle>
        <DialogDescription>
          You can change all of this later in Setup.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-meet-name">Name</Label>
            <Input
              id="new-meet-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Fall Invitational"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-meet-location">Location (optional)</Label>
            <Input
              id="new-meet-location"
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
              placeholder="Aquatic Center"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-meet-start">
                {multiDay ? "First day" : "Date"}
              </Label>
              <DatePicker
                id="new-meet-start"
                value={startDate}
                onChange={changeStart}
              />
            </div>
            {multiDay ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-meet-end">Last day</Label>
                <DatePicker
                  id="new-meet-end"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Pick the last day"
                  notBefore={startDate}
                />
              </div>
            ) : null}
          </div>
          <Label className="flex w-fit items-center gap-2 font-normal">
            <Switch checked={multiDay} onCheckedChange={setMultiDay} />
            Multi-day meet
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-meet-course">Course</Label>
            <ChoiceSelect
              id="new-meet-course"
              value={course}
              onValueChange={setCourse}
              items={COURSES}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-meet-lanes">Pool</Label>
            <ChoiceSelect
              id="new-meet-lanes"
              value={lanes}
              onValueChange={setLanes}
              items={LANES}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="new-meet-scoring">Scoring</Label>
            <ChoiceSelect
              id="new-meet-scoring"
              value={scoring}
              onValueChange={setScoring}
              items={SCORING}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">Events</h3>
            <p className="text-xs text-muted-foreground">
              Start from a standard order of events. You can add, remove, and
              renumber events in Setup.
            </p>
          </div>
          <TemplatePicker
            value={templateId}
            onChange={chooseTemplate}
            blankLabel="No events yet"
            blankDescription="Add events yourself in Setup."
          />
          {bothGenders ? (
            <div className="flex flex-col gap-1.5 sm:w-1/2">
              <Label htmlFor="new-meet-gender-order">
                Which gender swims event 1
              </Label>
              <ChoiceSelect
                id="new-meet-gender-order"
                value={genderOrder}
                onValueChange={setGenderOrder}
                items={GENDER_ORDERS}
              />
              <p className="text-xs text-muted-foreground">
                {genderOrder === "girls_boys"
                  ? "Girls swim the odd-numbered events."
                  : "Boys swim the odd-numbered events."}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter className="m-0 items-center border-t p-4">
        {needsEnd ? (
          <p className="mr-auto text-sm text-muted-foreground">
            Pick the last day, or turn off multi-day.
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={needsEnd}>
          Create meet
        </Button>
      </DialogFooter>
    </form>
  );
}
