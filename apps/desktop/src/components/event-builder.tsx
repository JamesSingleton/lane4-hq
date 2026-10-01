import type { EventInput } from "@lane4hq/meet-engine/create";
import { eventTitle } from "@lane4hq/meet-engine/labels";
import {
  expandProgram,
  MEET_TEMPLATES,
  meetTemplate,
  type Program,
  type ProgramItem,
} from "@lane4hq/meet-engine/templates";
import { formatEventName } from "@lane4hq/swim-core/events";
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
import { cn } from "@lane4hq/ui/lib/utils";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PROGRAM_GENDERS,
  ROUNDS,
  STROKES,
  type Stroke,
} from "../lib/meet-choices";
import { errorMessage } from "../lib/native";
import { ChoiceSelect } from "./choice-select";

export const BLANK_TEMPLATE = "blank";

const EMPTY_PROGRAM: Program = {
  ageGroups: [],
  genders: "girls_boys",
  round: "timed_final",
  items: [],
};

export function programFor(templateId: string): Program {
  const program = meetTemplate(templateId)?.program ?? EMPTY_PROGRAM;
  return {
    ...program,
    ageGroups: [...program.ageGroups],
    items: program.items.map((i) => ({ ...i })),
  };
}

/** Radio cards: start blank or from one of the meet templates. */
export function TemplatePicker({
  value,
  onChange,
  blankLabel = "Custom",
  blankDescription = "Build your own list of races.",
}: {
  value: string;
  onChange: (templateId: string) => void;
  blankLabel?: string;
  blankDescription?: string;
}) {
  const options = [
    { id: BLANK_TEMPLATE, name: blankLabel, description: blankDescription },
    ...MEET_TEMPLATES,
  ];
  return (
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const events =
          option.id === BLANK_TEMPLATE
            ? null
            : expandProgram(programFor(option.id)).length;
        const checked = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              checked && "border-primary bg-primary/5 hover:bg-primary/5",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
              {option.name}
              {events != null ? (
                <Badge variant="secondary">{events} events</Badge>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function previewTitle(input: EventInput): string {
  const dive = input.stroke === "dive";
  return eventTitle({
    ...input,
    id: "",
    isRelay: input.stroke.endsWith("_relay"),
    kind: dive ? "dive" : "swim",
    round: input.round ?? "timed_final",
    ...(dive ? { diveCount: 6 } : {}),
  });
}

function itemName(item: ProgramItem): string {
  return formatEventName(item.distance, item.stroke);
}

/** Age groups whose distance differs from the item's base distance. */
function itemOverrides(item: ProgramItem, ageGroups: string[]): string[] {
  if (!item.byAge) return [];
  return ageGroups.flatMap((age) => {
    if (!(age in item.byAge!)) return [];
    const d = item.byAge![age];
    return [d == null ? `no ${age}` : `${age}: ${d}`];
  });
}

/**
 * Build many events at once: pick a template (or start blank), adjust age
 * groups, genders, and races, and see the numbered events before adding.
 */
export function AddEventsDialog({
  open,
  onOpenChange,
  firstNumber,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstNumber: number;
  onAdd: (events: EventInput[]) => void;
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
      <DialogContent className="flex h-[min(90vh,780px)] flex-col gap-0 p-0 sm:max-w-5xl">
        <EventBuilder
          key={session}
          firstNumber={firstNumber}
          onCancel={() => onOpenChange(false)}
          onAdd={onAdd}
        />
      </DialogContent>
    </Dialog>
  );
}

function EventBuilder({
  firstNumber,
  onCancel,
  onAdd,
}: {
  firstNumber: number;
  onCancel: () => void;
  onAdd: (events: EventInput[]) => void;
}) {
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE);
  const [program, setProgram] = useState<Program>(() =>
    programFor(BLANK_TEMPLATE),
  );
  const [start, setStart] = useState(firstNumber);
  const [error, setError] = useState<string | null>(null);

  const events = useMemo(
    () =>
      expandProgram(program, Number.isFinite(start) && start > 0 ? start : 1),
    [program, start],
  );

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setProgram(programFor(id));
  }

  function patch(next: Partial<Program>) {
    setProgram((p) => ({ ...p, ...next }));
  }

  function moveItem(index: number, by: -1 | 1) {
    setProgram((p) => {
      const items = [...p.items];
      const [item] = items.splice(index, 1);
      items.splice(index + by, 0, item!);
      return { ...p, items };
    });
  }

  function submit() {
    try {
      setError(null);
      onAdd(events);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <DialogHeader className="border-b p-4">
        <DialogTitle>Add events</DialogTitle>
        <DialogDescription>
          Start from a template or build your own. Every race is added for each
          age group and gender, numbered in order.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Start from</h3>
            <TemplatePicker value={templateId} onChange={chooseTemplate} />
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder-genders">Genders</Label>
              <ChoiceSelect
                id="builder-genders"
                value={program.genders}
                onValueChange={(genders) => patch({ genders })}
                items={PROGRAM_GENDERS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder-round">Swims</Label>
              <ChoiceSelect
                id="builder-round"
                value={program.round}
                onValueChange={(round) => patch({ round })}
                items={ROUNDS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder-start">First event number</Label>
              <Input
                id="builder-start"
                type="number"
                min={1}
                value={start}
                onChange={(e) => setStart(e.currentTarget.valueAsNumber)}
              />
            </div>
          </section>

          <AgeGroups
            value={program.ageGroups}
            onChange={(ageGroups) => patch({ ageGroups })}
          />

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Races, in order</h3>
              {program.items.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => patch({ items: [] })}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            {program.items.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No races yet. Add them below, or pick a template above.
              </p>
            ) : (
              <ol className="flex flex-col divide-y rounded-lg border">
                {program.items.map((item, index) => {
                  const overrides = itemOverrides(item, program.ageGroups);
                  return (
                    <li
                      key={`${index}:${item.stroke}:${item.distance}`}
                      className="flex items-center gap-2 px-3 py-1.5"
                    >
                      <span className="w-6 font-mono text-xs text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <span className="text-sm">{itemName(item)}</span>
                      <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {overrides.map((o) => (
                          <Badge
                            key={o}
                            variant="outline"
                            className="font-normal"
                          >
                            {o}
                          </Badge>
                        ))}
                      </span>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Move ${itemName(item)} up`}
                        disabled={index === 0}
                        onClick={() => moveItem(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Move ${itemName(item)} down`}
                        disabled={index === program.items.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${itemName(item)}`}
                        onClick={() =>
                          patch({
                            items: program.items.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
            <AddRace
              onAdd={(items) =>
                patch({
                  items: [
                    ...program.items,
                    ...items.filter(
                      (n) =>
                        !program.items.some(
                          (i) =>
                            !i.byAge &&
                            i.stroke === n.stroke &&
                            i.distance === n.distance,
                        ),
                    ),
                  ],
                })
              }
            />
          </section>
        </div>

        <aside className="flex min-h-0 flex-col border-t bg-muted/30 md:border-t-0 md:border-l">
          <div className="border-b px-4 py-3 text-sm font-medium">
            {events.length === 0
              ? "Preview"
              : `${events.length} events · ${events[0]!.number}–${events[events.length - 1]!.number}`}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
            {events.map((e) => (
              <li key={e.number} className="flex gap-3 rounded px-2 py-1">
                <span className="w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                  {e.number}
                </span>
                <span className="truncate">{previewTitle(e)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <DialogFooter className="m-0 items-center border-t p-4">
        {error ? (
          <p className="mr-auto text-sm text-destructive">{error}</p>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={events.length === 0} onClick={submit}>
          {`Add ${events.length} ${events.length === 1 ? "event" : "events"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

function AgeGroups({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ageGroups: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const labels = draft
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (labels.length > 0) onChange([...value, ...labels]);
    setDraft("");
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Age groups</h3>
        <span className="text-xs text-muted-foreground">
          {value.length === 0 ? "None: every race is open to all ages." : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((age) => (
          <Badge key={age} variant="secondary" className="gap-1 pr-1">
            {age}
            <button
              type="button"
              aria-label={`Remove age group ${age}`}
              className="rounded-sm opacity-60 hover:opacity-100"
              onClick={() => onChange(value.filter((a) => a !== age))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          aria-label="Add age groups"
          value={draft}
          placeholder={value.length === 0 ? "8&U, 9-10, 11-12…" : "Add…"}
          className="h-7 w-40"
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      </div>
    </section>
  );
}

const QUICK_DISTANCES = [25, 50, 100, 200, 400, 500, 1000, 1650];

/** Add one stroke at one or more distances in a single step. */
function AddRace({ onAdd }: { onAdd: (items: ProgramItem[]) => void }) {
  const [stroke, setStroke] = useState<Stroke>("free");
  const [distances, setDistances] = useState<number[]>([50]);
  const dive = stroke === "dive";

  function toggle(d: number) {
    setDistances((current) =>
      current.includes(d)
        ? current.filter((x) => x !== d)
        : [...current, d].sort((a, b) => a - b),
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceSelect
          value={stroke}
          onValueChange={setStroke}
          items={STROKES}
          className="w-44"
        />
        {dive ? (
          <span className="text-xs text-muted-foreground">
            One diving event per age group and gender.
          </span>
        ) : (
          <div
            role="group"
            aria-label="Distances"
            className="flex flex-wrap gap-1"
          >
            {QUICK_DISTANCES.map((d) => (
              <Button
                key={d}
                type="button"
                size="xs"
                variant={distances.includes(d) ? "default" : "outline"}
                aria-pressed={distances.includes(d)}
                onClick={() => toggle(d)}
                className="tabular-nums"
              >
                {d}
              </Button>
            ))}
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="ml-auto"
          disabled={!dive && distances.length === 0}
          onClick={() =>
            onAdd(
              dive
                ? [{ stroke, distance: 1 }]
                : distances.map((distance) => ({ stroke, distance })),
            )
          }
        >
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}
