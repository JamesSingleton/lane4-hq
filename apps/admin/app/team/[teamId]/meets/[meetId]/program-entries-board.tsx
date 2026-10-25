"use client";

import {
  type AssociationEventCaps,
  canAddRelayTeam,
  formatAssociationCapLine,
} from "@lane4hq/swim-core/association-event-caps";
import { previousSameGenderEvent } from "@lane4hq/swim-core/consecutive-events";
import {
  isRelayStroke,
  type MeetEntryLimits,
} from "@lane4hq/swim-core/entry-limits";
import {
  formatEventName,
  formatGenderLabel,
  isSwimmerEligibleForEvent,
} from "@lane4hq/swim-core/events";
import {
  admitClearExhibition,
  admitNewIndividualEntry,
} from "@lane4hq/swim-core/individual-entry-admission";
import {
  deriveRelayLetter,
  RELAY_MAX_LEGS,
  RELAY_PRIMARY_LEG_COUNT,
  RELAY_TEAM_LETTERS,
  relayLegRoleLabel,
  relaySlotLabel,
} from "@lane4hq/swim-core/relay-legs";
import {
  blocksMeetEntries,
  type EligibilityStatus,
} from "@lane4hq/swim-core/team-types";
import {
  formatTime,
  formatTypedSwimTime,
  parseTime,
} from "@lane4hq/swim-core/times";
import { Button } from "@lane4hq/ui/components/button";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@lane4hq/ui/components/input-group";
import { ScrollArea } from "@lane4hq/ui/components/scroll-area";
import { Spinner } from "@lane4hq/ui/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lane4hq/ui/components/tooltip";
import { cn } from "@lane4hq/ui/lib/utils";
import { Minus, Plus, Search, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMeetEntryAction,
  deleteMeetEntryAction,
  updateMeetEntryAction,
} from "../actions";
import {
  removeMeetRelayTeamAction,
  setMeetRelaySlotAction,
  updateMeetRelayTeamSeedAction,
} from "../relay-actions";
import { RelaySwimmerCombobox } from "./relay-swimmer-combobox";

type EventRow = {
  id: string;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  eventKey: string;
};

type RosterRow = {
  membershipId: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  eligibilityStatus: EligibilityStatus | null;
};

type EntryRow = {
  id: string;
  meetEventId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  status: string;
  stroke?: string;
  eventKey?: string;
  exhibition?: boolean;
  seedTimeMs?: number | null;
};

type RelayLegRow = {
  meetEventId: string;
  membershipId: string;
  legOrder: number;
  relayLetter: string | null;
};

type RelayTeamRow = {
  meetEventId: string;
  relayLetter: string;
  seedTimeMs: number | null;
};

type BestTimeRow = {
  membershipId: string;
  eventKey: string;
  timeMs: number;
};

function eventTitle(event: EventRow) {
  const num = event.eventNumber != null ? `#${event.eventNumber}` : "#—";
  return `${num} ${formatGenderLabel(event.gender)} ${formatEventName(event.distance, event.stroke)}`;
}

function lastNameSortKey(row: RosterRow) {
  return `${row.lastName} ${row.firstName}`.toLowerCase();
}

/** Pause-in-typing delay for seed fields. */
const SEED_AUTOSAVE_MS = 600;
/** Wait until edits go quiet before refreshing server data. */
const SERVER_SYNC_IDLE_MS = 1500;

function parseSeedInput(raw: string):
  | {
      ok: true;
      seedTimeMs: number | null;
      seedTimeSource: "manual" | "no_time";
    }
  | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, seedTimeMs: null, seedTimeSource: "no_time" };
  }
  const parsed = parseTime(trimmed);
  if (!parsed || parsed <= 0) return { ok: false };
  return { ok: true, seedTimeMs: parsed, seedTimeSource: "manual" };
}

function ConsecutiveHint({ prevEvent }: { prevEvent: EventRow }) {
  const label = eventTitle(prevEvent);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="text-amber-700 dark:text-amber-400 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
            aria-label={`Back-to-back with ${label}`}
          />
        }
      >
        <TriangleAlert className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        Also in {label}. Consecutive for {formatGenderLabel(prevEvent.gender)}{" "}
        in this program. This is a warning only.
      </TooltipContent>
    </Tooltip>
  );
}

export function ProgramEntriesBoard({
  teamId,
  meetId,
  caps,
  limits,
  roster,
  events,
  entries,
  relayLegs,
  relayTeams,
  notGoingMembershipIds,
  bestTimes = [],
}: {
  teamId: string;
  meetId: string;
  caps: AssociationEventCaps;
  limits: MeetEntryLimits | null;
  roster: RosterRow[];
  events: EventRow[];
  entries: EntryRow[];
  relayLegs: RelayLegRow[];
  relayTeams: RelayTeamRow[];
  notGoingMembershipIds: string[];
  bestTimes?: BestTimeRow[];
}) {
  const notGoing = useMemo(
    () => new Set(notGoingMembershipIds),
    [notGoingMembershipIds],
  );
  const bestTimeByMembershipAndEvent = useMemo(() => {
    const byMembership = new Map<string, Map<string, number>>();
    for (const bestTime of bestTimes) {
      const byEvent = byMembership.get(bestTime.membershipId) ?? new Map();
      if (!byEvent.has(bestTime.eventKey)) {
        byEvent.set(bestTime.eventKey, bestTime.timeMs);
      }
      byMembership.set(bestTime.membershipId, byEvent);
    }
    return byMembership;
  }, [bestTimes]);

  function bestSeedFor(membershipId: string, eventKey: string) {
    return (
      bestTimeByMembershipAndEvent.get(membershipId)?.get(eventKey) ?? null
    );
  }
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [seedDrafts, setSeedDrafts] = useState<Record<string, string>>({});
  const [relaySeedDrafts, setRelaySeedDrafts] = useState<
    Record<string, string>
  >({});
  const [localEntries, setLocalEntries] = useState(entries);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const inflightRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const cancelledAddsRef = useRef(new Set<string>());
  const localEntriesRef = useRef(localEntries);
  const seedDraftsRef = useRef(seedDrafts);
  localEntriesRef.current = localEntries;
  seedDraftsRef.current = seedDrafts;

  useEffect(() => {
    if (inflightRef.current === 0) setLocalEntries(entries);
  }, [entries]);

  useEffect(() => {
    const seedTimers = seedTimersRef.current;
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      for (const timer of seedTimers.values()) clearTimeout(timer);
      seedTimers.clear();
    };
  }, []);

  function markBusy(key: string, next: boolean) {
    setBusyKeys((current) => {
      const copy = new Set(current);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
  }

  function scheduleServerSync() {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (inflightRef.current === 0) router.refresh();
      else scheduleServerSync();
    }, SERVER_SYNC_IDLE_MS);
  }

  function runInBackground(task: () => Promise<void>) {
    inflightRef.current += 1;
    void task()
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Couldn't save that change.",
        );
      })
      .finally(() => {
        inflightRef.current -= 1;
        scheduleServerSync();
      });
  }

  const orderedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => (a.eventNumber ?? 9999) - (b.eventNumber ?? 9999),
      ),
    [events],
  );

  useEffect(() => {
    if (
      selectedEventId &&
      orderedEvents.some((event) => event.id === selectedEventId)
    ) {
      return;
    }
    if (selectedEventId) setSelectedEventId("");
  }, [orderedEvents, selectedEventId]);

  const programRefs = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        eventNumber: event.eventNumber,
        gender: event.gender,
      })),
    [events],
  );

  const membersByEvent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of localEntries) {
      if (entry.status === "scratched") continue;
      const set = map.get(entry.meetEventId) ?? new Set();
      set.add(entry.membershipId);
      map.set(entry.meetEventId, set);
    }
    for (const leg of relayLegs) {
      if (leg.legOrder < 1 || leg.legOrder > RELAY_PRIMARY_LEG_COUNT) continue;
      const set = map.get(leg.meetEventId) ?? new Set();
      set.add(leg.membershipId);
      map.set(leg.meetEventId, set);
    }
    return map;
  }, [localEntries, relayLegs]);

  const nameById = useMemo(
    () =>
      new Map(
        roster.map((row) => [
          row.membershipId,
          `${row.firstName} ${row.lastName}`,
        ]),
      ),
    [roster],
  );

  const capLine = formatAssociationCapLine(caps);
  const selected = orderedEvents.find((event) => event.id === selectedEventId);
  const prevPair = selected
    ? previousSameGenderEvent(selected.id, programRefs)
    : null;
  const prevEvent = prevPair
    ? (events.find((event) => event.id === prevPair.firstEventId) ?? null)
    : null;
  const prevMembers = prevPair
    ? (membersByEvent.get(prevPair.firstEventId) ?? new Set())
    : new Set<string>();

  function eventCount(event: EventRow) {
    if (isRelayStroke(event.stroke, event.eventKey)) {
      const letters = new Set(
        relayLegs
          .filter(
            (leg) =>
              leg.meetEventId === event.id &&
              leg.legOrder >= 1 &&
              leg.legOrder <= RELAY_PRIMARY_LEG_COUNT,
          )
          .map((leg) => deriveRelayLetter(leg.relayLetter, leg.legOrder)),
      );
      return letters.size;
    }
    return localEntries.filter(
      (entry) => entry.meetEventId === event.id && entry.status !== "scratched",
    ).length;
  }

  return (
    <div className="flex min-h-112 min-w-0 w-full flex-col gap-4 lg:flex-row lg:items-stretch">
      <aside className="border-border bg-card flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border lg:w-[36%] lg:max-w-md">
        <div className="border-border border-b p-3">
          <h2 className="text-sm font-medium">Program</h2>
          {capLine ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Association: {capLine}.
            </p>
          ) : null}
        </div>
        {error ? (
          <p className="text-destructive px-3 py-2 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {orderedEvents.length === 0 ? (
            <li className="text-muted-foreground p-4 text-sm">
              No events on this meet yet.
            </li>
          ) : (
            orderedEvents.map((event) => {
              const active = event.id === selectedEventId;
              const count = eventCount(event);
              return (
                <li key={event.id} className="border-border border-b">
                  <button
                    type="button"
                    className={cn(
                      "hover:bg-muted/60 flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left text-sm",
                      active && "bg-muted",
                    )}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setError(null);
                    }}
                  >
                    <span>
                      {event.eventNumber != null
                        ? `#${event.eventNumber} `
                        : ""}
                      {formatGenderLabel(event.gender)}{" "}
                      {formatEventName(event.distance, event.stroke)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <section
        className={cn(
          "border-border bg-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
        )}
        key={selectedEventId || "empty"}
      >
        {!selected ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
            Select an event from the program.
          </div>
        ) : isRelayStroke(selected.stroke, selected.eventKey) ? (
          <RelayProgramEvent
            event={selected}
            title={eventTitle(selected)}
            caps={caps}
            roster={roster}
            relayLegs={relayLegs.filter(
              (leg) => leg.meetEventId === selected.id,
            )}
            relayTeams={relayTeams.filter(
              (team) => team.meetEventId === selected.id,
            )}
            nameById={nameById}
            notGoingMembershipIds={notGoing}
            prevEvent={prevEvent}
            prevMembers={prevMembers}
            seedDrafts={relaySeedDrafts}
            onSeedDraft={(letter, value) =>
              setRelaySeedDrafts((current) => ({
                ...current,
                [`${selected.id}:${letter}`]: value,
              }))
            }
            onSeedCommit={(letter, raw) => {
              setError(null);
              const parsed = parseSeedInput(raw);
              if (!parsed.ok) {
                setError("Enter a valid seed time.");
                return;
              }
              runInBackground(async () => {
                await updateMeetRelayTeamSeedAction(
                  teamId,
                  meetId,
                  selected.id,
                  letter,
                  parsed.seedTimeMs,
                );
              });
            }}
            onError={setError}
            onAssign={(membershipId, letter, legOrder) => {
              setError(null);
              runInBackground(async () => {
                await setMeetRelaySlotAction(
                  teamId,
                  meetId,
                  selected.id,
                  letter,
                  legOrder,
                  membershipId,
                );
              });
            }}
            onRemoveTeam={(letter) => {
              setError(null);
              runInBackground(async () => {
                await removeMeetRelayTeamAction(
                  teamId,
                  meetId,
                  selected.id,
                  letter,
                );
              });
            }}
          />
        ) : (
          <IndividualProgramEvent
            event={selected}
            title={eventTitle(selected)}
            caps={caps}
            roster={roster}
            eventEntries={localEntries.filter(
              (entry) =>
                entry.meetEventId === selected.id &&
                entry.status !== "scratched",
            )}
            notGoing={notGoing}
            prevEvent={prevEvent}
            prevMembers={prevMembers}
            busyKeys={busyKeys}
            seedDrafts={seedDrafts}
            error={error}
            onSeedDraft={(entryId, value) => {
              setSeedDrafts((current) => ({ ...current, [entryId]: value }));
              const existing = seedTimersRef.current.get(entryId);
              if (existing) clearTimeout(existing);
              seedTimersRef.current.set(
                entryId,
                setTimeout(() => {
                  seedTimersRef.current.delete(entryId);
                  const parsed = parseSeedInput(value);
                  if (!parsed.ok) {
                    setError("Enter a valid seed time.");
                    return;
                  }
                  setError(null);
                  setLocalEntries((current) =>
                    current.map((entry) =>
                      entry.id === entryId
                        ? { ...entry, seedTimeMs: parsed.seedTimeMs }
                        : entry,
                    ),
                  );
                  runInBackground(async () => {
                    const result = await updateMeetEntryAction(
                      teamId,
                      meetId,
                      entryId,
                      {
                        seedTimeMs: parsed.seedTimeMs,
                        seedTimeSource: parsed.seedTimeSource,
                      },
                    );
                    if (!result.ok) setError(result.message);
                  });
                }, SEED_AUTOSAVE_MS),
              );
            }}
            onAdd={(membershipId, exhibition) => {
              const row = roster.find(
                (item) => item.membershipId === membershipId,
              );
              if (!row) return;
              const admission = admitNewIndividualEntry({
                commitments: notGoingMembershipIds.map((id) => ({
                  membershipId: id,
                  status: "not_going",
                })),
                membershipId,
                eligibilityStatus: row.eligibilityStatus,
                swimmerGender: row.gender,
                event: selected,
                limits,
                entries: localEntries,
                relayLegs,
                scoringCap: caps.maxScoringEntriesPerIndividualEvent,
                exhibition,
              });
              if (!admission.ok) {
                setError(admission.reason);
                return;
              }
              const bestSeed = bestSeedFor(membershipId, selected.eventKey);
              const seedTimeMs =
                bestSeed != null && bestSeed > 0 ? bestSeed : null;
              const tempId = `optimistic:${membershipId}:${crypto.randomUUID()}`;
              cancelledAddsRef.current.delete(tempId);
              setError(null);
              setLocalEntries((current) => [
                ...current,
                {
                  id: tempId,
                  meetEventId: selected.id,
                  membershipId,
                  firstName: row.firstName,
                  lastName: row.lastName,
                  status: "approved",
                  exhibition,
                  seedTimeMs,
                },
              ]);
              markBusy(membershipId, true);
              runInBackground(async () => {
                try {
                  const saved = await addMeetEntryAction(teamId, meetId, {
                    meetEventId: selected.id,
                    membershipId,
                    status: "approved",
                    exhibition,
                    ...(seedTimeMs != null
                      ? { seedTimeMs, seedTimeSource: "personal_best" as const }
                      : {}),
                  });
                  if (!saved.ok) {
                    setLocalEntries((current) =>
                      current.filter((entry) => entry.id !== tempId),
                    );
                    setError(saved.message);
                    return;
                  }
                  const savedId = saved.id;
                  if (cancelledAddsRef.current.has(tempId)) {
                    cancelledAddsRef.current.delete(tempId);
                    await deleteMeetEntryAction(teamId, meetId, savedId);
                    return;
                  }
                  setLocalEntries((current) =>
                    current.map((entry) =>
                      entry.id === tempId ? { ...entry, id: savedId } : entry,
                    ),
                  );
                  const timer = seedTimersRef.current.get(tempId);
                  if (timer) {
                    clearTimeout(timer);
                    seedTimersRef.current.delete(tempId);
                  }
                  setSeedDrafts((current) => {
                    if (current[tempId] === undefined) return current;
                    const next = { ...current };
                    next[savedId] = next[tempId]!;
                    delete next[tempId];
                    return next;
                  });
                  const live = localEntriesRef.current.find(
                    (entry) => entry.id === tempId || entry.id === savedId,
                  );
                  if (live && live.exhibition !== exhibition) {
                    const updated = await updateMeetEntryAction(
                      teamId,
                      meetId,
                      savedId,
                      { exhibition: live.exhibition },
                    );
                    if (!updated.ok) {
                      setError(updated.message);
                      setLocalEntries((current) =>
                        current.map((entry) =>
                          entry.id === savedId || entry.id === tempId
                            ? { ...entry, id: savedId, exhibition }
                            : entry,
                        ),
                      );
                    }
                  }
                  const draft =
                    seedDraftsRef.current[savedId] ??
                    seedDraftsRef.current[tempId];
                  if (draft !== undefined) {
                    const parsed = parseSeedInput(draft);
                    if (parsed.ok) {
                      const updated = await updateMeetEntryAction(
                        teamId,
                        meetId,
                        savedId,
                        {
                          seedTimeMs: parsed.seedTimeMs,
                          seedTimeSource: parsed.seedTimeSource,
                        },
                      );
                      if (!updated.ok) setError(updated.message);
                    }
                  }
                } catch (err) {
                  setLocalEntries((current) =>
                    current.filter((entry) => entry.id !== tempId),
                  );
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Couldn't add this entry.",
                  );
                } finally {
                  markBusy(membershipId, false);
                }
              });
            }}
            onRemove={(entryId) => {
              const existing = localEntries.find(
                (entry) => entry.id === entryId,
              );
              if (!existing) return;
              setError(null);
              setLocalEntries((current) =>
                current.filter((entry) => entry.id !== entryId),
              );
              markBusy(entryId, true);
              if (entryId.startsWith("optimistic:")) {
                cancelledAddsRef.current.add(entryId);
                markBusy(entryId, false);
                return;
              }
              runInBackground(async () => {
                try {
                  await deleteMeetEntryAction(teamId, meetId, entryId);
                } catch (err) {
                  setLocalEntries((current) => [...current, existing]);
                  throw err;
                } finally {
                  markBusy(entryId, false);
                }
              });
            }}
            onExhibition={(entryId, exhibition) => {
              const previous = localEntries.find(
                (entry) => entry.id === entryId,
              );
              if (previous?.exhibition && !exhibition) {
                const admission = admitClearExhibition({
                  entries: localEntries,
                  meetEventId: previous.meetEventId,
                  entryId,
                  scoringCap: caps.maxScoringEntriesPerIndividualEvent,
                });
                if (!admission.ok) {
                  setError(admission.reason);
                  return;
                }
              }
              setError(null);
              setLocalEntries((current) =>
                current.map((entry) =>
                  entry.id === entryId ? { ...entry, exhibition } : entry,
                ),
              );
              if (entryId.startsWith("optimistic:")) return;
              runInBackground(async () => {
                const result = await updateMeetEntryAction(
                  teamId,
                  meetId,
                  entryId,
                  { exhibition },
                );
                if (!result.ok) {
                  setError(result.message);
                  if (previous) {
                    setLocalEntries((current) =>
                      current.map((entry) =>
                        entry.id === entryId
                          ? { ...entry, exhibition: previous.exhibition }
                          : entry,
                      ),
                    );
                  }
                }
              });
            }}
            onSeedCommit={(entryId, raw) => {
              const existing = seedTimersRef.current.get(entryId);
              if (existing) {
                clearTimeout(existing);
                seedTimersRef.current.delete(entryId);
              }
              const parsed = parseSeedInput(raw);
              if (!parsed.ok) {
                setError("Enter a valid seed time.");
                return;
              }
              setError(null);
              setLocalEntries((current) =>
                current.map((entry) =>
                  entry.id === entryId
                    ? { ...entry, seedTimeMs: parsed.seedTimeMs }
                    : entry,
                ),
              );
              if (entryId.startsWith("optimistic:")) return;
              runInBackground(async () => {
                const result = await updateMeetEntryAction(
                  teamId,
                  meetId,
                  entryId,
                  {
                    seedTimeMs: parsed.seedTimeMs,
                    seedTimeSource: parsed.seedTimeSource,
                  },
                );
                if (!result.ok) setError(result.message);
              });
            }}
          />
        )}
      </section>
    </div>
  );
}

function IndividualProgramEvent({
  event,
  title,
  caps,
  roster,
  eventEntries,
  notGoing,
  prevEvent,
  prevMembers,
  busyKeys,
  seedDrafts,
  error,
  onSeedDraft,
  onAdd,
  onRemove,
  onExhibition,
  onSeedCommit,
}: {
  event: EventRow;
  title: string;
  caps: AssociationEventCaps;
  roster: RosterRow[];
  eventEntries: EntryRow[];
  notGoing: Set<string>;
  prevEvent: EventRow | null;
  prevMembers: Set<string>;
  busyKeys: Set<string>;
  seedDrafts: Record<string, string>;
  error: string | null;
  onSeedDraft: (entryId: string, value: string) => void;
  onAdd: (membershipId: string, exhibition: boolean) => void;
  onRemove: (entryId: string) => void;
  onExhibition: (entryId: string, exhibition: boolean) => void;
  onSeedCommit: (entryId: string, raw: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [exhibitionAdds, setExhibitionAdds] = useState<Record<string, boolean>>(
    {},
  );
  const scoring = eventEntries.filter((entry) => !entry.exhibition);
  const exhibition = eventEntries.filter((entry) => entry.exhibition);
  const scoringCap = caps.maxScoringEntriesPerIndividualEvent;
  const scoringFull =
    scoringCap != null && scoringCap > 0 && scoring.length >= scoringCap;
  const entryByMembership = useMemo(
    () => new Map(eventEntries.map((entry) => [entry.membershipId, entry])),
    [eventEntries],
  );

  const eligible = useMemo(
    () =>
      roster
        .filter((row) => {
          if (notGoing.has(row.membershipId)) return false;
          if (blocksMeetEntries(row.eligibilityStatus)) return false;
          return isSwimmerEligibleForEvent(row.gender, event.gender);
        })
        .sort((a, b) => lastNameSortKey(a).localeCompare(lastNameSortKey(b))),
    [roster, notGoing, event.gender],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligible.filter((row) => {
      if (entryByMembership.has(row.membershipId)) return false;
      if (!q) return true;
      return `${row.firstName} ${row.lastName}`.toLowerCase().includes(q);
    });
  }, [eligible, entryByMembership, search]);

  const enteredRows = useMemo(
    () =>
      [...eventEntries].sort((a, b) =>
        `${a.lastName} ${a.firstName}`
          .toLowerCase()
          .localeCompare(`${b.lastName} ${b.firstName}`.toLowerCase()),
      ),
    [eventEntries],
  );

  return (
    <>
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm tabular-nums">
          {scoringCap != null && scoringCap > 0
            ? `${scoring.length} / ${scoringCap} scoring`
            : `${scoring.length} scoring`}
          {exhibition.length > 0 ? ` · ${exhibition.length} exhibition` : ""}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search swimmers…"
            aria-label="Search swimmers"
          />
        </InputGroup>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <FieldSet className="flex min-h-0 flex-col gap-2">
            <FieldLegend variant="label">Eligible</FieldLegend>
            {eligible.length === 0 ? (
              <FieldDescription>
                No eligible swimmers for this event.
              </FieldDescription>
            ) : available.length === 0 ? (
              <FieldDescription>
                {search.trim()
                  ? "No names match that search."
                  : "Everyone eligible is already entered."}
              </FieldDescription>
            ) : (
              <ScrollArea className="h-full min-h-48 flex-1">
                <ul className="divide-border mr-3 divide-y rounded-md border">
                  {available.map((row) => {
                    const busy = busyKeys.has(row.membershipId);
                    const exhibition =
                      exhibitionAdds[row.membershipId] === true;
                    const exhId = `add-exh-${row.membershipId}`;
                    return (
                      <li
                        key={row.membershipId}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {row.firstName} {row.lastName}
                        </span>
                        {scoringFull ? (
                          <Field
                            orientation="horizontal"
                            className="w-auto shrink-0"
                          >
                            <Checkbox
                              id={exhId}
                              checked={exhibition}
                              onCheckedChange={(next) =>
                                setExhibitionAdds((current) => ({
                                  ...current,
                                  [row.membershipId]: next === true,
                                }))
                              }
                            />
                            <FieldLabel
                              htmlFor={exhId}
                              className="text-muted-foreground font-normal"
                            >
                              Exh
                            </FieldLabel>
                          </Field>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Enter ${row.firstName} ${row.lastName}`}
                          onClick={() => onAdd(row.membershipId, exhibition)}
                        >
                          {busy ? (
                            <Spinner aria-hidden />
                          ) : (
                            <Plus aria-hidden />
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </FieldSet>
          <FieldSet className="flex min-h-0 flex-col gap-2">
            <FieldLegend variant="label">In this event</FieldLegend>
            {scoringFull ? (
              <FieldDescription>
                Scoring is full. Check Exh to add a swimmer who will not score.
              </FieldDescription>
            ) : null}
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            {enteredRows.length === 0 ? (
              <FieldDescription>
                Add swimmers from Eligible. Seeds and exhibition live here.
              </FieldDescription>
            ) : (
              <ScrollArea className="h-full min-h-48 flex-1">
                <ul className="divide-border mr-3 divide-y rounded-md border">
                  {enteredRows.map((entry) => {
                    const exhId = `exh-${entry.id}`;
                    const busy = busyKeys.has(entry.id);
                    const seedValue =
                      seedDrafts[entry.id] !== undefined
                        ? seedDrafts[entry.id]!
                        : entry.seedTimeMs != null && entry.seedTimeMs > 0
                          ? formatTime(entry.seedTimeMs)
                          : "";
                    const showConsecutive =
                      prevEvent != null && prevMembers.has(entry.membershipId);
                    return (
                      <li
                        key={entry.id}
                        className="flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                          <span className="truncate">
                            {entry.firstName} {entry.lastName}
                          </span>
                          {showConsecutive && prevEvent ? (
                            <ConsecutiveHint prevEvent={prevEvent} />
                          ) : null}
                        </span>
                        <Input
                          aria-label={`Seed for ${entry.firstName} ${entry.lastName}`}
                          className="font-timing h-8 w-24 tabular-nums"
                          value={seedValue}
                          placeholder="NT"
                          onChange={(e) =>
                            onSeedDraft(
                              entry.id,
                              formatTypedSwimTime(e.target.value),
                            )
                          }
                          onBlur={() => onSeedCommit(entry.id, seedValue)}
                        />
                        <Field
                          orientation="horizontal"
                          className="w-auto shrink-0"
                        >
                          <Checkbox
                            id={exhId}
                            checked={entry.exhibition === true}
                            onCheckedChange={(next) =>
                              onExhibition(entry.id, next === true)
                            }
                          />
                          <FieldLabel
                            htmlFor={exhId}
                            className="text-muted-foreground font-normal"
                          >
                            Exh
                          </FieldLabel>
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Remove ${entry.firstName} ${entry.lastName}`}
                          onClick={() => onRemove(entry.id)}
                        >
                          {busy ? (
                            <Spinner aria-hidden />
                          ) : (
                            <Minus aria-hidden />
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </FieldSet>
        </div>
      </div>
    </>
  );
}

function RelayProgramEvent({
  event,
  title,
  caps,
  roster,
  relayLegs,
  relayTeams,
  nameById,
  notGoingMembershipIds,
  prevEvent,
  prevMembers,
  seedDrafts,
  onSeedDraft,
  onSeedCommit,
  onAssign,
  onRemoveTeam,
  onError,
}: {
  event: EventRow;
  title: string;
  caps: AssociationEventCaps;
  roster: RosterRow[];
  relayLegs: RelayLegRow[];
  relayTeams: RelayTeamRow[];
  nameById: Map<string, string>;
  notGoingMembershipIds: Set<string>;
  prevEvent: EventRow | null;
  prevMembers: Set<string>;
  seedDrafts: Record<string, string>;
  onSeedDraft: (letter: string, value: string) => void;
  onSeedCommit: (letter: string, raw: string) => void;
  onAssign: (membershipId: string, letter: string, legOrder: number) => void;
  onRemoveTeam: (letter: string) => void;
  onError: (message: string | null) => void;
}) {
  const [extraLetters, setExtraLetters] = useState<string[]>([]);
  const persistedLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const leg of relayLegs) {
      letters.add(deriveRelayLetter(leg.relayLetter, leg.legOrder));
    }
    for (const team of relayTeams) {
      letters.add(deriveRelayLetter(team.relayLetter, 1));
    }
    return letters;
  }, [relayLegs, relayTeams]);
  useEffect(() => {
    setExtraLetters((current) =>
      current.filter((letter) => !persistedLetters.has(letter)),
    );
  }, [persistedLetters]);
  const letters = useMemo(() => {
    const visible = new Set(persistedLetters);
    for (const letter of extraLetters) visible.add(letter);
    if (visible.size === 0) visible.add("A");
    return RELAY_TEAM_LETTERS.filter((letter) => visible.has(letter));
  }, [persistedLetters, extraLetters]);
  const cap = caps.maxRelayTeamsPerEvent;
  const maxTeams =
    cap != null && cap > 0
      ? Math.min(cap, RELAY_TEAM_LETTERS.length)
      : RELAY_TEAM_LETTERS.length;
  const nextLetter = RELAY_TEAM_LETTERS.find(
    (letter) => !letters.includes(letter),
  );
  const racingLetters = new Set(
    relayLegs
      .filter(
        (leg) => leg.legOrder >= 1 && leg.legOrder <= RELAY_PRIMARY_LEG_COUNT,
      )
      .map((leg) => deriveRelayLetter(leg.relayLetter, leg.legOrder)),
  );
  const addTeamCheck = canAddRelayTeam({
    cap,
    currentRacingTeamCount: racingLetters.size,
  });
  const seedByLetter = new Map(
    relayTeams.map((team) => [team.relayLetter, team.seedTimeMs]),
  );
  const slots = Array.from({ length: RELAY_MAX_LEGS }, (_, i) => i + 1);

  return (
    <>
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {cap != null && cap > 0
            ? `${racingLetters.size} / ${cap} teams`
            : `${racingLetters.size} teams`}
          {" · "}
          <a
            href="#relay-lineup"
            className="underline-offset-4 hover:underline"
          >
            Set order and seeds in Relay lineup
          </a>
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {letters.map((letter) => {
          const teamLegs = relayLegs.filter(
            (leg) =>
              deriveRelayLetter(leg.relayLetter, leg.legOrder) === letter,
          );
          const assignedIds = new Set(teamLegs.map((leg) => leg.membershipId));
          const seedKey = `${event.id}:${letter}`;
          const stored = seedByLetter.get(letter);
          const seedValue =
            seedDrafts[seedKey] !== undefined
              ? seedDrafts[seedKey]!
              : stored != null && stored > 0
                ? formatTime(stored)
                : "";

          return (
            <div key={letter} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Team {letter}</p>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Team ${letter} seed`}
                    className="font-timing h-8 w-28 tabular-nums"
                    value={seedValue}
                    placeholder="NT"
                    onChange={(e) =>
                      onSeedDraft(letter, formatTypedSwimTime(e.target.value))
                    }
                    onBlur={() => onSeedCommit(letter, seedValue)}
                  />
                  {letters.indexOf(letter) > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove Team ${letter}`}
                      onClick={() => {
                        onError(null);
                        const fromIndex = RELAY_TEAM_LETTERS.indexOf(letter);
                        const dropping = new Set<string>(
                          RELAY_TEAM_LETTERS.slice(fromIndex),
                        );
                        setExtraLetters((current) =>
                          current.filter((item) => !dropping.has(item)),
                        );
                        if (
                          [...dropping].some((item) =>
                            persistedLetters.has(item),
                          )
                        ) {
                          onRemoveTeam(letter);
                        }
                      }}
                    >
                      <Minus />
                    </Button>
                  ) : null}
                </div>
              </div>
              <ol className="flex flex-col gap-2">
                {slots.map((slot) => {
                  const assigned = teamLegs.find(
                    (leg) => leg.legOrder === slot,
                  );
                  const eligible = roster.filter((row) => {
                    if (
                      assignedIds.has(row.membershipId) &&
                      row.membershipId !== assigned?.membershipId
                    ) {
                      return false;
                    }
                    if (notGoingMembershipIds.has(row.membershipId)) {
                      return false;
                    }
                    if (blocksMeetEntries(row.eligibilityStatus)) return false;
                    return isSwimmerEligibleForEvent(row.gender, event.gender);
                  });
                  const name = assigned
                    ? (nameById.get(assigned.membershipId) ?? "Unknown")
                    : "";
                  return (
                    <li key={slot} className="flex min-w-0 flex-col gap-1">
                      <span className="text-muted-foreground text-xs">
                        {relayLegRoleLabel(event.stroke, slot)}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <RelaySwimmerCombobox
                            label={`${letter} ${relaySlotLabel(slot)}`}
                            value={assigned?.membershipId ?? ""}
                            displayValue={name}
                            options={eligible.map((row) => ({
                              membershipId: row.membershipId,
                              label: `${row.firstName} ${row.lastName}`,
                            }))}
                            onChange={(membershipId) => {
                              onError(null);
                              onAssign(membershipId, letter, slot);
                            }}
                          />
                        </div>
                        <div className="flex size-7 shrink-0 items-center justify-center">
                          {assigned &&
                          prevEvent &&
                          prevMembers.has(assigned.membershipId) ? (
                            <ConsecutiveHint prevEvent={prevEvent} />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
        {nextLetter && letters.length < maxTeams && addTeamCheck.ok ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              setExtraLetters((current) =>
                current.includes(nextLetter)
                  ? current
                  : [...current, nextLetter],
              )
            }
          >
            Add Team {nextLetter}
          </Button>
        ) : null}
      </div>
    </>
  );
}
