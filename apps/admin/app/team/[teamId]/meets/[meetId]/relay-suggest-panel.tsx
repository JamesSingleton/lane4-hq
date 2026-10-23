"use client";

import type { MeetEntryLimits } from "@lane4hq/swim-core/entry-limits";
import {
  type Gender,
  isSwimmerEligibleForEvent,
} from "@lane4hq/swim-core/events";
import {
  canAssignRacingRelayLeg,
  deriveRelayLetter,
  isRelayAlternateSlot,
  RELAY_MAX_LEGS,
  RELAY_TEAM_LETTERS,
  type RelayLegCountInput,
  relaySlotLabel,
  strokeForRelayLeg,
} from "@lane4hq/swim-core/relay-legs";
import { formatTime, parseTime } from "@lane4hq/swim-core/times";
import { Button } from "@lane4hq/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lane4hq/ui/components/card";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import { Field, FieldLabel } from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import { cn } from "@lane4hq/ui/lib/utils";
import { Lock, LockOpen, Minus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DraftQuotaHint,
  isDraftQuotaBlocked,
  type SharedDraftQuota,
} from "@/components/draft-quota-hint";
import {
  type RelayLegSuggestion,
  removeMeetRelayTeamAction,
  saveMeetRelayLegsAction,
  suggestRelayOrderAction,
} from "../relay-actions";
import { RelaySwimmerCombobox } from "./relay-swimmer-combobox";

type RelayEvent = {
  id: string;
  label: string;
  stroke: string;
  eventKey: string;
  gender: string;
};

type SavedLeg = {
  meetEventId: string;
  membershipId: string;
  legOrder: number;
  relayLetter?: string | null;
  stroke: string | null;
  reasoning: string | null;
  name: string;
};

type SavedTeam = {
  meetEventId: string;
  relayLetter: string;
  seedTimeMs: number | null;
};

type Candidate = { membershipId: string; name: string; gender: Gender };

const RELAY_TEAM_COUNT_ITEMS = [
  { value: "1", label: "A only" },
  { value: "2", label: "A + B" },
  { value: "3", label: "A + B + C" },
] as const;

const RELAY_OPTIMIZATION_ITEMS = [
  { value: "speed", label: "Speed" },
  { value: "participation", label: "Participation" },
] as const;

const SLOTS = Array.from({ length: RELAY_MAX_LEGS }, (_, i) => i + 1);

export function RelaySuggestPanel({
  teamId,
  meetId,
  events,
  initialLegs,
  initialTeams,
  limits,
  individualCountByMembership,
  candidates,
  draftQuota: initialDraftQuota,
}: {
  teamId: string;
  meetId: string;
  events: RelayEvent[];
  initialLegs: SavedLeg[];
  initialTeams: SavedTeam[];
  limits?: MeetEntryLimits | null;
  individualCountByMembership: Record<string, number>;
  candidates: Candidate[];
  draftQuota: SharedDraftQuota;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftQuota, setDraftQuota] = useState(initialDraftQuota);
  const suggestBlocked = isDraftQuotaBlocked(draftQuota);
  const [numberOfRelays, setNumberOfRelays] = useState<1 | 2 | 3>(() =>
    maxTeamCount(initialLegs, initialTeams),
  );
  const [allowDoubles, setAllowDoubles] = useState(false);
  const [optimizeFor, setOptimizeFor] = useState<"speed" | "participation">(
    "speed",
  );
  const [lockedByEvent, setLockedByEvent] = useState<Record<string, boolean>>(
    {},
  );
  const [legsByEvent, setLegsByEvent] = useState<
    Record<string, RelayLegSuggestion[]>
  >(() => groupInitialLegs(initialLegs));
  const [seedByEvent, setSeedByEvent] = useState<
    Record<string, Record<string, string>>
  >(() => groupInitialSeeds(initialTeams));
  const [summaryByEvent, setSummaryByEvent] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [hiddenByEvent, setHiddenByEvent] = useState<Record<string, string[]>>(
    {},
  );

  const initialLegSerial = useMemo(
    () => serializeGroupedLegs(groupInitialLegs(initialLegs)),
    [initialLegs],
  );
  const initialSeedSerial = useMemo(
    () => serializeSeeds(groupInitialSeeds(initialTeams)),
    [initialTeams],
  );

  const dirtyByEvent = useMemo(() => {
    const currentLegs = serializeGroupedLegs(legsByEvent);
    const currentSeeds = serializeSeeds(seedByEvent);
    const result: Record<string, boolean> = {};
    for (const event of events) {
      result[event.id] =
        (currentLegs[event.id] ?? "") !== (initialLegSerial[event.id] ?? "") ||
        (currentSeeds[event.id] ?? "") !== (initialSeedSerial[event.id] ?? "");
    }
    return result;
  }, [events, legsByEvent, seedByEvent, initialLegSerial, initialSeedSerial]);

  const anyDirty = events.some((event) => dirtyByEvent[event.id]);

  useEffect(() => {
    if (anyDirty) return;
    setLegsByEvent(groupInitialLegs(initialLegs));
    setSeedByEvent(groupInitialSeeds(initialTeams));
  }, [initialLegs, initialTeams, anyDirty]);

  useEffect(() => {
    if (!anyDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [anyDirty]);

  function combinedLegsForEvent(meetEventId: string): RelayLegCountInput[] {
    const others = initialLegs
      .filter((leg) => leg.meetEventId !== meetEventId)
      .map((leg) => ({
        membershipId: leg.membershipId,
        meetEventId: leg.meetEventId,
        relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
        legOrder: leg.legOrder,
      }));
    const draft = (legsByEvent[meetEventId] ?? []).map((leg) => ({
      membershipId: leg.membershipId,
      meetEventId,
      relayLetter: leg.teamLetter,
      legOrder: leg.legOrder,
    }));
    return [...others, ...draft];
  }

  function assignBlockedReason(
    meetEventId: string,
    letter: string,
    slot: number,
    membershipId: string,
  ): string | null {
    if (!membershipId || isRelayAlternateSlot(slot)) return null;
    const current = assignedMembership(meetEventId, letter, slot);
    if (current === membershipId) return null;
    const prior = combinedLegsForEvent(meetEventId).filter(
      (leg) =>
        !(
          leg.meetEventId === meetEventId &&
          leg.relayLetter === letter &&
          leg.legOrder === slot
        ),
    );
    const check = canAssignRacingRelayLeg({
      limits,
      individualCount: individualCountByMembership[membershipId] ?? 0,
      legs: prior,
      membershipId,
      meetEventId,
      relayLetter: letter,
    });
    return check.ok ? null : check.reason;
  }

  function assignedMembership(
    meetEventId: string,
    letter: string,
    slot: number,
  ) {
    return (legsByEvent[meetEventId] ?? []).find(
      (leg) => leg.teamLetter === letter && leg.legOrder === slot,
    )?.membershipId;
  }

  function regenerate(meetEventId: string) {
    if (lockedByEvent[meetEventId]) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await suggestRelayOrderAction(teamId, {
          meetId,
          meetEventId,
          numberOfRelays,
          allowDoubles,
          optimizeFor,
        });
        setLegsByEvent((prev) => ({
          ...prev,
          [meetEventId]: mergeSuggestedWithAlternates(
            prev[meetEventId] ?? [],
            result.legs,
          ),
        }));
        setSummaryByEvent((prev) => ({
          ...prev,
          [meetEventId]: result.summary,
        }));
        if (result.draftQuota) {
          setDraftQuota(result.draftQuota);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function setSlot(
    meetEventId: string,
    letter: string,
    slot: number,
    membershipId: string,
    event: RelayEvent,
  ) {
    setLegsByEvent((prev) => {
      const current = prev[meetEventId] ?? [];
      let without = current.filter(
        (leg) => !(leg.teamLetter === letter && leg.legOrder === slot),
      );
      if (membershipId) {
        without = without.filter(
          (leg) =>
            !(leg.teamLetter === letter && leg.membershipId === membershipId),
        );
      }
      if (!membershipId) {
        return { ...prev, [meetEventId]: without };
      }
      const candidate = candidates.find((c) => c.membershipId === membershipId);
      if (
        !candidate ||
        !isSwimmerEligibleForEvent(candidate.gender, event.gender)
      ) {
        return prev;
      }
      without.push({
        membershipId,
        legOrder: slot,
        teamLetter: letter,
        name: candidate?.name ?? "Unknown",
        stroke: strokeForRelayLeg(event.stroke, slot),
      });
      return { ...prev, [meetEventId]: without };
    });
  }

  function visibleLettersForEvent(meetEventId: string): string[] {
    const hidden = new Set(hiddenByEvent[meetEventId] ?? []);
    const shown = RELAY_TEAM_LETTERS.slice(0, numberOfRelays).filter(
      (letter) => !hidden.has(letter),
    );
    return shown.length > 0 ? shown : ["A"];
  }

  function persistedLettersForEvent(meetEventId: string): Set<string> {
    const letters = new Set<string>();
    for (const leg of initialLegs) {
      if (leg.meetEventId !== meetEventId) continue;
      letters.add(deriveRelayLetter(leg.relayLetter, leg.legOrder));
    }
    for (const team of initialTeams) {
      if (team.meetEventId !== meetEventId) continue;
      letters.add(deriveRelayLetter(team.relayLetter, 1));
    }
    return letters;
  }

  function dropRelayTeams(meetEventId: string, fromLetter: string) {
    const fromIndex = (RELAY_TEAM_LETTERS as readonly string[]).indexOf(
      fromLetter,
    );
    if (fromIndex < 0) return;
    const dropping = RELAY_TEAM_LETTERS.slice(fromIndex);
    const dropSet = new Set<string>(dropping);
    const wasDirty = dirtyByEvent[meetEventId] ?? false;
    const persisted = persistedLettersForEvent(meetEventId);
    const shouldPersist = dropping.some((letter) => persisted.has(letter));

    setHiddenByEvent((prev) => ({
      ...prev,
      [meetEventId]: [...new Set([...(prev[meetEventId] ?? []), ...dropping])],
    }));
    setLegsByEvent((prev) => ({
      ...prev,
      [meetEventId]: (prev[meetEventId] ?? []).filter(
        (leg) => !dropSet.has(leg.teamLetter),
      ),
    }));
    setSeedByEvent((prev) => {
      const seeds = { ...(prev[meetEventId] ?? {}) };
      for (const letter of dropping) delete seeds[letter];
      return { ...prev, [meetEventId]: seeds };
    });

    if (!wasDirty && shouldPersist) {
      setError(null);
      startTransition(async () => {
        try {
          await removeMeetRelayTeamAction(
            teamId,
            meetId,
            meetEventId,
            fromLetter,
          );
          router.refresh();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to remove relay team",
          );
        }
      });
    }
  }

  function saveEvent(meetEventId: string) {
    const legs = legsByEvent[meetEventId] ?? [];
    const seeds = seedByEvent[meetEventId] ?? {};
    const visibleLetters = visibleLettersForEvent(meetEventId);
    const visible = new Set(visibleLetters);
    const keptLegs = legs.filter((leg) => visible.has(leg.teamLetter));
    setError(null);
    startTransition(async () => {
      try {
        await saveMeetRelayLegsAction(
          teamId,
          meetId,
          meetEventId,
          keptLegs.map((leg) => ({
            membershipId: leg.membershipId,
            legOrder: leg.legOrder,
            relayLetter: leg.teamLetter,
            stroke: leg.stroke,
            reasoning: leg.reasoning,
          })),
          visibleLetters.map((letter) => ({
            relayLetter: letter,
            ...parseSeedFields(seeds[letter] ?? ""),
          })),
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relay lineup</CardTitle>
          <CardDescription>
            Add a free or medley relay event to this meet, then assign legs and
            alternates.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxRelayEntries = limits?.maxRelayEntries;

  return (
    <div className="@container/relay-lineup flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Relay lineup</CardTitle>
          <CardDescription>
            Assign four racing legs plus alternates #5–#8, enter one team seed
            (or NT) per A/B/C relay, then Save — that commits the lineup the
            same way adding an individual event does. Suggest 1–4 fills a draft;
            you still Save. Racing legs 1–4 count toward the relay cap;
            alternates do not.{" "}
            {maxRelayEntries != null
              ? `Max relay entries per swimmer: ${maxRelayEntries}.`
              : "No relay entry limit set on this meet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <Field className="w-36">
            <FieldLabel htmlFor="relay-team-count">Teams (A/B/C)</FieldLabel>
            <Select
              items={RELAY_TEAM_COUNT_ITEMS}
              value={String(numberOfRelays)}
              onValueChange={(v) => {
                if (v === "1" || v === "2" || v === "3") {
                  const next = Number(v) as 1 | 2 | 3;
                  const previous = numberOfRelays;
                  setNumberOfRelays(next);
                  const kept = new Set<string>(
                    RELAY_TEAM_LETTERS.slice(0, next),
                  );
                  if (next > previous) {
                    const newly = RELAY_TEAM_LETTERS.slice(
                      previous,
                      next,
                    ) as readonly string[];
                    setHiddenByEvent((prev) => {
                      const updated: Record<string, string[]> = {};
                      for (const [eventId, hidden] of Object.entries(prev)) {
                        updated[eventId] = hidden.filter(
                          (letter) => !newly.includes(letter),
                        );
                      }
                      return updated;
                    });
                  } else {
                    setHiddenByEvent((prev) => {
                      const updated: Record<string, string[]> = {};
                      for (const [eventId, hidden] of Object.entries(prev)) {
                        updated[eventId] = hidden.filter((letter) =>
                          kept.has(letter),
                        );
                      }
                      return updated;
                    });
                  }
                  setLegsByEvent((prev) => {
                    const updated: Record<string, RelayLegSuggestion[]> = {};
                    for (const [eventId, legs] of Object.entries(prev)) {
                      updated[eventId] = legs.filter((leg) =>
                        kept.has(leg.teamLetter),
                      );
                    }
                    return updated;
                  });
                  setSeedByEvent((prev) => {
                    const updated: Record<string, Record<string, string>> = {};
                    for (const [eventId, seeds] of Object.entries(prev)) {
                      updated[eventId] = Object.fromEntries(
                        Object.entries(seeds).filter(([letter]) =>
                          kept.has(letter),
                        ),
                      );
                    }
                    return updated;
                  });
                }
              }}
            >
              <SelectTrigger id="relay-team-count" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {RELAY_TEAM_COUNT_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-40">
            <FieldLabel htmlFor="relay-optimization">Optimize for</FieldLabel>
            <Select
              items={RELAY_OPTIMIZATION_ITEMS}
              value={optimizeFor}
              onValueChange={(v) => {
                if (v === "speed" || v === "participation") {
                  setOptimizeFor(v);
                }
              }}
            >
              <SelectTrigger id="relay-optimization" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {RELAY_OPTIMIZATION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="w-auto pb-2">
            <Checkbox
              id="relay-allow-doubles"
              checked={allowDoubles}
              onCheckedChange={(checked) => setAllowDoubles(checked === true)}
            />
            <FieldLabel htmlFor="relay-allow-doubles" className="font-normal">
              Allow doubles
            </FieldLabel>
          </Field>
          <DraftQuotaHint surface="relay" quota={draftQuota} />
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          numberOfRelays === 1 && "@min-[40rem]/relay-lineup:grid-cols-2",
          numberOfRelays === 2 && "@min-[72rem]/relay-lineup:grid-cols-2",
          numberOfRelays === 3 && "@min-[108rem]/relay-lineup:grid-cols-2",
        )}
      >
        {events.map((event) => {
          const locked = lockedByEvent[event.id] ?? false;
          const legs = legsByEvent[event.id] ?? [];
          const dirty = dirtyByEvent[event.id] ?? false;
          const letters = visibleLettersForEvent(event.id);
          const nextLetter = RELAY_TEAM_LETTERS.find(
            (letter) => !letters.includes(letter),
          );
          const eligibleCandidates = candidates.filter((candidate) =>
            isSwimmerEligibleForEvent(candidate.gender, event.gender),
          );
          return (
            <Card key={event.id} className="@container/relay-event min-w-0">
              <CardHeader>
                <CardTitle className="text-base text-pretty">
                  {event.label}
                </CardTitle>
                <CardDescription>
                  {dirty
                    ? "Unsaved changes — Save to add these swimmers to the lineup."
                    : summaryByEvent[event.id] ||
                      (legs.length
                        ? `${legs.length} legs assigned`
                        : "No legs yet")}
                </CardDescription>
                <CardAction className="flex max-w-full min-w-0 flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setLockedByEvent((prev) => ({
                        ...prev,
                        [event.id]: !locked,
                      }))
                    }
                  >
                    {locked ? (
                      <Lock data-icon="inline-start" />
                    ) : (
                      <LockOpen data-icon="inline-start" />
                    )}
                    {locked ? "Locked" : "Lock"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || locked || suggestBlocked}
                    onClick={() => regenerate(event.id)}
                  >
                    <RefreshCw data-icon="inline-start" />
                    {pending ? "Working…" : "Suggest 1–4"}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending || locked || !dirty}
                    onClick={() => saveEvent(event.id)}
                  >
                    <Save data-icon="inline-start" />
                    {dirty ? "Save" : "Saved"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 @min-[17rem]/relay-event:grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
                  {letters.map((letter) => (
                    <RelayTeamCard
                      key={letter}
                      letter={letter}
                      event={event}
                      legs={legs}
                      seedValue={seedByEvent[event.id]?.[letter] ?? ""}
                      pending={pending}
                      locked={locked}
                      canRemove={letters.indexOf(letter) > 0}
                      eligibleCandidates={eligibleCandidates}
                      assignBlockedReason={assignBlockedReason}
                      onSeedChange={(value) =>
                        setSeedByEvent((prev) => ({
                          ...prev,
                          [event.id]: {
                            ...(prev[event.id] ?? {}),
                            [letter]: value,
                          },
                        }))
                      }
                      onRemove={() => dropRelayTeams(event.id, letter)}
                      onAssign={(slot, membershipId) => {
                        if (!membershipId) {
                          setError(null);
                          setSlot(event.id, letter, slot, "", event);
                          return;
                        }
                        const blocked = assignBlockedReason(
                          event.id,
                          letter,
                          slot,
                          membershipId,
                        );
                        if (blocked) {
                          setError(blocked);
                          return;
                        }
                        setError(null);
                        setSlot(event.id, letter, slot, membershipId, event);
                      }}
                    />
                  ))}
                </div>
                {nextLetter && letters.length < RELAY_TEAM_LETTERS.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={pending || locked}
                    onClick={() => {
                      setHiddenByEvent((prev) => ({
                        ...prev,
                        [event.id]: (prev[event.id] ?? []).filter(
                          (letter) => letter !== nextLetter,
                        ),
                      }));
                      const idx = (
                        RELAY_TEAM_LETTERS as readonly string[]
                      ).indexOf(nextLetter);
                      if (idx >= 0 && idx + 1 > numberOfRelays) {
                        setNumberOfRelays((idx + 1) as 1 | 2 | 3);
                      }
                    }}
                  >
                    Add Team {nextLetter}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RelayTeamCard({
  letter,
  event,
  legs,
  seedValue,
  pending,
  locked,
  canRemove,
  eligibleCandidates,
  assignBlockedReason,
  onSeedChange,
  onRemove,
  onAssign,
}: {
  letter: string;
  event: RelayEvent;
  legs: RelayLegSuggestion[];
  seedValue: string;
  pending: boolean;
  locked: boolean;
  canRemove: boolean;
  eligibleCandidates: Candidate[];
  assignBlockedReason: (
    meetEventId: string,
    letter: string,
    slot: number,
    membershipId: string,
  ) => string | null;
  onSeedChange: (value: string) => void;
  onRemove: () => void;
  onAssign: (slot: number, membershipId: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">Team {letter}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            className="font-timing h-8 w-24 text-sm tabular-nums"
            placeholder="NT"
            disabled={pending || locked}
            value={seedValue}
            onChange={(e) => onSeedChange(e.target.value)}
            aria-label={`Team ${letter} seed time`}
          />
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={pending || locked}
              aria-label={`Remove Team ${letter}`}
              onClick={onRemove}
            >
              <Minus />
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const assigned = legs.find(
            (leg) => leg.teamLetter === letter && leg.legOrder === slot,
          );
          return (
            <li key={slot} className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                {relaySlotLabel(slot)}
                <span className="sr-only">
                  {isRelayAlternateSlot(slot) ? "alternate" : "racing leg"}
                </span>
              </span>
              <RelaySwimmerCombobox
                label={relaySlotLabel(slot)}
                value={assigned?.membershipId ?? ""}
                displayValue={assigned?.name ?? ""}
                disabled={pending || locked}
                options={eligibleCandidates.map((candidate) => {
                  return {
                    membershipId: candidate.membershipId,
                    label: candidate.name,
                    blocked: assignBlockedReason(
                      event.id,
                      letter,
                      slot,
                      candidate.membershipId,
                    ),
                  };
                })}
                onChange={(membershipId) => onAssign(slot, membershipId)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function parseSeedFields(raw: string): {
  seedTimeMs: number | null;
  seedTimeSource: "manual" | "no_time";
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { seedTimeMs: null, seedTimeSource: "no_time" };
  }
  const parsed = parseTime(trimmed);
  if (!parsed || parsed <= 0) {
    return { seedTimeMs: null, seedTimeSource: "no_time" };
  }
  return { seedTimeMs: parsed, seedTimeSource: "manual" };
}

function groupInitialLegs(
  legs: SavedLeg[],
): Record<string, RelayLegSuggestion[]> {
  const byEvent: Record<string, RelayLegSuggestion[]> = {};
  for (const leg of legs) {
    const letter = deriveRelayLetter(leg.relayLetter, leg.legOrder);
    const list = byEvent[leg.meetEventId] ?? [];
    list.push({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      stroke: leg.stroke ?? undefined,
      reasoning: leg.reasoning ?? undefined,
      teamLetter: letter,
      name: leg.name,
    });
    byEvent[leg.meetEventId] = list;
  }
  for (const key of Object.keys(byEvent)) {
    byEvent[key] = [...(byEvent[key] ?? [])].sort(
      (a, b) =>
        a.teamLetter.localeCompare(b.teamLetter) || a.legOrder - b.legOrder,
    );
  }
  return byEvent;
}

function groupInitialSeeds(
  teams: SavedTeam[],
): Record<string, Record<string, string>> {
  const byEvent: Record<string, Record<string, string>> = {};
  for (const team of teams) {
    const letter = deriveRelayLetter(team.relayLetter, 1);
    const seeds = byEvent[team.meetEventId] ?? {};
    seeds[letter] =
      team.seedTimeMs != null && team.seedTimeMs > 0
        ? formatTime(team.seedTimeMs)
        : "";
    byEvent[team.meetEventId] = seeds;
  }
  return byEvent;
}

function serializeGroupedLegs(
  grouped: Record<string, RelayLegSuggestion[]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [eventId, legs] of Object.entries(grouped)) {
    result[eventId] = [...legs]
      .map((leg) => `${leg.teamLetter}:${leg.legOrder}:${leg.membershipId}`)
      .sort()
      .join("|");
  }
  return result;
}

function serializeSeeds(
  seeds: Record<string, Record<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [eventId, byLetter] of Object.entries(seeds)) {
    result[eventId] = RELAY_TEAM_LETTERS.map(
      (letter) => `${letter}:${(byLetter[letter] ?? "").trim()}`,
    ).join("|");
  }
  return result;
}

function maxTeamCount(legs: SavedLeg[], teams: SavedTeam[]): 1 | 2 | 3 {
  let max = 1;
  for (const leg of legs) {
    const letter = deriveRelayLetter(leg.relayLetter, leg.legOrder);
    const idx = (RELAY_TEAM_LETTERS as readonly string[]).indexOf(letter);
    if (idx >= 0) max = Math.max(max, idx + 1);
  }
  for (const team of teams) {
    const letter = deriveRelayLetter(team.relayLetter, 1);
    const idx = (RELAY_TEAM_LETTERS as readonly string[]).indexOf(letter);
    if (idx >= 0) max = Math.max(max, idx + 1);
  }
  return max as 1 | 2 | 3;
}

function mergeSuggestedWithAlternates(
  current: RelayLegSuggestion[],
  suggested: RelayLegSuggestion[],
): RelayLegSuggestion[] {
  const alts = current.filter((leg) => isRelayAlternateSlot(leg.legOrder));
  return [...suggested, ...alts];
}
