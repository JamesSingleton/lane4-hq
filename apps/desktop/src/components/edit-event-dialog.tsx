import type { EventPatch } from "@lane4hq/meet-engine/event-edits";
import type { MeetEvent } from "@lane4hq/meet-engine/model";
import type { EventGender } from "@lane4hq/swim-core/events";
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
import { useState } from "react";
import {
  DIVE_COUNTS,
  EVENT_GENDERS,
  ROUNDS,
  STROKES,
  type Stroke,
} from "../lib/meet-choices";
import { errorMessage } from "../lib/native";
import { ChoiceSelect } from "./choice-select";

export function EditEventDialog({
  event,
  open,
  hasEntries,
  onOpenChange,
  onClosed,
  onSave,
}: {
  event: MeetEvent | null;
  open: boolean;
  hasEntries: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the close animation, so the form can be cleared. */
  onClosed: () => void;
  /** Throws if the meet refuses the change. */
  onSave: (patch: EventPatch) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {event ? (
          <EditEventForm
            key={event.id}
            event={event}
            hasEntries={hasEntries}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditEventForm({
  event,
  hasEntries,
  onCancel,
  onSave,
}: {
  event: MeetEvent;
  hasEntries: boolean;
  onCancel: () => void;
  onSave: (patch: EventPatch) => void;
}) {
  const [number, setNumber] = useState(String(event.number));
  const [gender, setGender] = useState<EventGender>(event.gender);
  const [ageGroup, setAgeGroup] = useState(event.ageGroup ?? "");
  const [stroke, setStroke] = useState<Stroke>(event.stroke as Stroke);
  const [distance, setDistance] = useState(String(event.distance));
  const [round, setRound] = useState<(typeof ROUNDS)[number]["value"]>(
    event.round === "prelim" ? "prelim" : "timed_final",
  );
  const [diveCount, setDiveCount] = useState<
    (typeof DIVE_COUNTS)[number]["value"]
  >(event.diveCount === 11 ? "11" : "6");
  const [error, setError] = useState<string | null>(null);
  const dive = stroke === "dive";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave({
            number: Number(number),
            gender,
            ageGroup,
            stroke,
            ...(dive
              ? { diveCount: Number(diveCount) }
              : { distance: Number(distance), round }),
          });
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit event {event.number}</DialogTitle>
        <DialogDescription>
          {hasEntries
            ? "This event has entries, so its stroke, distance, and gender are fixed. Remove the entries or the event to change them."
            : "Changes apply before the event is swum."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-event-number">Event number</Label>
          <Input
            id="edit-event-number"
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={number}
            onChange={(e) => setNumber(e.currentTarget.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-event-gender">Gender</Label>
          <ChoiceSelect
            id="edit-event-gender"
            value={gender}
            onValueChange={setGender}
            items={EVENT_GENDERS}
            disabled={hasEntries}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-event-stroke">Stroke</Label>
          <ChoiceSelect
            id="edit-event-stroke"
            value={stroke}
            onValueChange={setStroke}
            items={STROKES}
            disabled={hasEntries}
          />
        </div>
        {dive ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-event-dives">Dives</Label>
            <ChoiceSelect
              id="edit-event-dives"
              value={diveCount}
              onValueChange={setDiveCount}
              items={DIVE_COUNTS}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-event-distance">Distance</Label>
            <Input
              id="edit-event-distance"
              type="number"
              inputMode="numeric"
              min={1}
              required
              disabled={hasEntries}
              value={distance}
              onChange={(e) => setDistance(e.currentTarget.value)}
              className="font-mono tabular-nums"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-event-age">Age group (optional)</Label>
          <Input
            id="edit-event-age"
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.currentTarget.value)}
            placeholder="Open"
          />
        </div>
        {dive ? null : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-event-round">Swims</Label>
            <ChoiceSelect
              id="edit-event-round"
              value={round}
              onValueChange={setRound}
              items={ROUNDS}
            />
          </div>
        )}
      </div>

      <DialogFooter className="items-center">
        {error ? (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
