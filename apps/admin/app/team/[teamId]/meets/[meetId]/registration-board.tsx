"use client";

import { swimmerAgeOnDate } from "@lane4hq/swim-core/age";
import type { AssociationEventCaps } from "@lane4hq/swim-core/association-event-caps";
import { consecutivePairsForMember } from "@lane4hq/swim-core/consecutive-events";
import {
  canAddMeetEntry,
  checkMeetEntryCounts,
  checkQualifyingTime,
  formatEntryCountsSentence,
  formatEntryLimitsSummary,
  formatFilledCapAdvice,
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
  MEET_ATTENDANCE_UI_LABELS,
  type MeetAttendanceUiStatus,
  resolveMeetAttendanceUiStatus,
} from "@lane4hq/swim-core/meet-attendance";
import { isRelayOnlyMeetAthlete } from "@lane4hq/swim-core/meet-lineup-snapshot";
import {
  deriveRelayLetter,
  formatAssignmentCountLine,
  isRelayAlternateSlot,
  racingRelayCount,
  racingRelayKeysByMember,
  relayLegRoleLabel,
} from "@lane4hq/swim-core/relay-legs";
import {
  blocksMeetEntries,
  ELIGIBILITY_STATUS_LABELS,
  type EligibilityStatus,
} from "@lane4hq/swim-core/team-types";
import {
  formatTime,
  formatTypedSwimTime,
  parseTime,
} from "@lane4hq/swim-core/times";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@lane4hq/ui/components/dropdown-menu";
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
import { Spinner } from "@lane4hq/ui/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lane4hq/ui/components/tooltip";
import { cn } from "@lane4hq/ui/lib/utils";
import {
  AlertTriangleIcon,
  ArrowDownUpIcon,
  InfoIcon,
  Minus,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addMeetEntryAction,
  deleteMeetEntryAction,
  setMeetAttendanceAction,
  setMeetAttendanceBulkAction,
  setMeetRelayOnlyAction,
  updateMeetEntryAction,
} from "../actions";
import { removeMeetRelaySlotAction } from "../relay-actions";

type RosterRow = {
  membershipId: string;
  swimmerId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  practiceGroup: string | null;
  groupId: string | null;
  groupName: string | null;
  gender: "male" | "female";
  dateOfBirth: Date | string | null;
  eligibilityStatus: EligibilityStatus | null;
  eligibilityNotes: string | null;
};

type EventRow = {
  id: string;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup: string | null;
  eventKey: string;
  qualifyingTimeMs: number | null;
};

type EntryRow = {
  id: string;
  meetEventId: string;
  membershipId: string;
  seedTimeMs: number | null;
  status: string;
  exhibition?: boolean;
  entryNotes?: string | null;
  firstName: string;
  lastName: string;
  distance: number;
  stroke: string;
  eventNumber: number | null;
  gender: string;
  eventKey?: string;
};

type AttendanceRow = {
  membershipId: string;
  status: string;
  relayOnly: boolean;
  notes?: string | null;
  firstName: string;
  lastName: string;
};

type BestTimeRow = {
  membershipId: string;
  eventKey: string;
  timeMs: number;
};

type RelayLegRow = {
  meetEventId: string;
  membershipId: string;
  legOrder: number;
  relayLetter: string | null;
  stroke: string | null;
};

type RosterFilter =
  | "all"
  | "has_entries"
  | "no_entries"
  | "committed"
  | "pending"
  | "not_going"
  | "not_eligible"
  | "ineligible";

const ATTENDANCE_FILTERS: MeetAttendanceUiStatus[] = [
  "committed",
  "pending",
  "not_going",
  "not_eligible",
];

function rowStatusLabel(
  attendance: MeetAttendanceUiStatus,
  eligibilityStatus: EligibilityStatus | null,
) {
  if (blocksMeetEntries(eligibilityStatus)) {
    return ELIGIBILITY_STATUS_LABELS.ineligible;
  }
  if (attendance !== "committed") {
    return MEET_ATTENDANCE_UI_LABELS[attendance];
  }
  return null;
}

function attendanceFilterCount(
  roster: RosterRow[],
  attendanceByMembership: Map<string, string>,
  status: MeetAttendanceUiStatus,
) {
  return roster.filter(
    (row) =>
      resolveMeetAttendanceUiStatus(
        attendanceByMembership.get(row.membershipId),
      ) === status,
  ).length;
}

type RosterSort = "last_name" | "first_name" | "group";

function formatEventLine(event: {
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup?: string | null;
}) {
  const gender = formatGenderLabel(event.gender);
  const genderShort =
    gender === "Female"
      ? "F"
      : gender === "Male"
        ? "M"
        : gender === "Mixed"
          ? "X"
          : "";
  const age = event.ageGroup ? ` ${event.ageGroup}` : "";
  return `#${event.eventNumber ?? "—"} ${genderShort}${age} ${formatEventName(event.distance, event.stroke)}`.replace(
    /\s+/g,
    " ",
  );
}

function qtDisplay(ms: number | null | undefined) {
  if (ms == null || ms <= 0) return null;
  return formatTime(ms);
}

function groupLabel(row: RosterRow) {
  return row.groupName ?? row.practiceGroup ?? "No group";
}

function sortRosterRows(rows: RosterRow[], sort: RosterSort): RosterRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "first_name") {
      return (
        a.firstName.localeCompare(b.firstName) ||
        a.lastName.localeCompare(b.lastName)
      );
    }
    if (sort === "group") {
      return (
        groupLabel(a).localeCompare(groupLabel(b)) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
      );
    }
    return (
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName)
    );
  });
}

function entryLimitAlert(args: {
  limits: MeetEntryLimits | null | undefined;
  entryCounts: { individual: number; relay: number };
  limitsSummary: string | null;
}): {
  title: string;
  description: string;
  variant: "default" | "destructive";
} | null {
  const { limits, entryCounts, limitsSummary } = args;
  if (!limits) return null;

  const current = formatEntryCountsSentence(entryCounts);
  const limitLine = limitsSummary ? ` Meet allows ${limitsSummary}.` : "";
  const over = checkMeetEntryCounts(limits, entryCounts);
  if (!over.ok) {
    return {
      variant: "destructive",
      title: "Over the entry limit",
      description: `${over.reason} This swimmer has ${current}.${limitLine} Remove an individual entry or a racing relay leg.`,
    };
  }

  const individualCheck = canAddMeetEntry(limits, entryCounts, false);
  const relayCheck = canAddMeetEntry(limits, entryCounts, true);
  if (individualCheck.ok && relayCheck.ok) return null;

  if (!individualCheck.ok && !relayCheck.ok) {
    const advice = formatFilledCapAdvice(limits, entryCounts);
    return {
      variant: "default",
      title: "Entry limit filled",
      description: `This swimmer has ${current}, which fills the meet cap.${limitLine}${
        advice ? ` ${advice}` : ""
      }`,
    };
  }

  if (!individualCheck.ok) {
    return {
      variant: "default",
      title: "Individual slots filled",
      description: `This swimmer has ${current}.${limitLine} Relays can still be assigned in Relay lineup.`,
    };
  }

  return {
    variant: "default",
    title: "Relay slots filled",
    description: `This swimmer has ${current}.${limitLine} Individual events can still be added. To add another racing relay, unassign a racing relay leg first.`,
  };
}

function AddEntryButton({
  disabled,
  limitReason,
  pending,
  onClick,
}: {
  disabled: boolean;
  limitReason?: string;
  pending: boolean;
  onClick: () => void;
}) {
  const label = limitReason
    ? `Add entry unavailable: ${limitReason}`
    : "Add entry";
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {pending ? <Spinner aria-hidden /> : <Plus aria-hidden />}
      <span className="sr-only">{label}</span>
    </Button>
  );

  if (!limitReason) return button;

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex cursor-not-allowed" />}
      >
        {button}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{limitReason}</TooltipContent>
    </Tooltip>
  );
}

export function RegistrationBoard({
  teamId,
  meetId,
  course,
  meetStartDate,
  limits,
  roster,
  events,
  entries,
  attendance,
  bestTimes,
  relayLegs,
  associationCaps,
}: {
  teamId: string;
  meetId: string;
  course: string;
  meetStartDate: Date;
  limits?: MeetEntryLimits | null;
  associationCaps?: AssociationEventCaps | null;
  roster: RosterRow[];
  events: EventRow[];
  entries: EntryRow[];
  attendance: AttendanceRow[];
  bestTimes: BestTimeRow[];
  relayLegs: RelayLegRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("last_name");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [membershipId, setMembershipId] = useState("");
  const [seedDrafts, setSeedDrafts] = useState<Record<string, string>>({});
  const [exhibitionDrafts, setExhibitionDrafts] = useState<
    Record<string, boolean>
  >({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const attendanceByMembership = useMemo(
    () => new Map(attendance.map((row) => [row.membershipId, row.status])),
    [attendance],
  );

  const relayOnlyByMembership = useMemo(
    () => new Map(attendance.map((row) => [row.membershipId, row.relayOnly])),
    [attendance],
  );

  const relayLegSet = useMemo(
    () => new Set(relayLegs.map((leg) => leg.membershipId)),
    [relayLegs],
  );

  const assignmentByMembership = useMemo(() => {
    const events = new Map<string, number>();
    const alts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.status === "scratched") continue;
      if (isRelayStroke(entry.stroke, entry.eventKey)) continue;
      events.set(entry.membershipId, (events.get(entry.membershipId) ?? 0) + 1);
    }
    for (const [membershipId, keys] of racingRelayKeysByMember(
      relayLegs.map((leg) => ({
        membershipId: leg.membershipId,
        meetEventId: leg.meetEventId,
        relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
        legOrder: leg.legOrder,
      })),
    )) {
      events.set(membershipId, (events.get(membershipId) ?? 0) + keys.size);
    }
    for (const leg of relayLegs) {
      if (!isRelayAlternateSlot(leg.legOrder)) continue;
      alts.set(leg.membershipId, (alts.get(leg.membershipId) ?? 0) + 1);
    }
    return { events, alts };
  }, [entries, relayLegs]);

  const individualCountByMembership = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.status === "scratched") continue;
      if (isRelayStroke(entry.stroke, entry.eventKey)) continue;
      map.set(entry.membershipId, (map.get(entry.membershipId) ?? 0) + 1);
    }
    return map;
  }, [entries]);

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

  const groups = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of roster) {
      if (row.groupId && row.groupName) {
        map.set(row.groupId, row.groupName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [roster]);

  const limitsSummary = formatEntryLimitsSummary(limits);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = roster.filter((row) => {
      const status = attendanceByMembership.get(row.membershipId);
      const events = assignmentByMembership.events.get(row.membershipId) ?? 0;
      const alts = assignmentByMembership.alts.get(row.membershipId) ?? 0;
      const hasAssignment = events + alts > 0;

      if (filter === "has_entries" && !hasAssignment) return false;
      if (filter === "no_entries" && hasAssignment) return false;
      if (ATTENDANCE_FILTERS.includes(filter as MeetAttendanceUiStatus)) {
        const ui = resolveMeetAttendanceUiStatus(status);
        if (ui !== filter) return false;
      }
      if (
        filter === "ineligible" &&
        !blocksMeetEntries(row.eligibilityStatus)
      ) {
        return false;
      }

      if (groupFilter !== "all") {
        if (groupFilter === "none") {
          if (row.groupId) return false;
        } else if (row.groupId !== groupFilter) {
          return false;
        }
      }
      if (!q) return true;
      const name = `${row.firstName} ${row.lastName} ${row.preferredName ?? ""}`
        .toLowerCase()
        .trim();
      return name.includes(q);
    });
    return sortRosterRows(matched, sort);
  }, [
    roster,
    search,
    filter,
    sort,
    groupFilter,
    attendanceByMembership,
    assignmentByMembership,
  ]);

  useEffect(() => {
    if (!membershipId) return;
    if (filteredRoster.some((r) => r.membershipId === membershipId)) {
      return;
    }
    setMembershipId("");
  }, [filteredRoster, membershipId]);

  const selectedSwimmer = roster.find((r) => r.membershipId === membershipId);
  const selectedAttendance = membershipId
    ? resolveMeetAttendanceUiStatus(attendanceByMembership.get(membershipId))
    : "committed";
  const isProfileIneligible = blocksMeetEntries(
    selectedSwimmer?.eligibilityStatus,
  );
  const isBlocked =
    isProfileIneligible ||
    selectedAttendance === "not_going" ||
    selectedAttendance === "not_eligible";
  const isPendingAttendance = selectedAttendance === "pending";

  const swimmerEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.membershipId === membershipId &&
          e.status !== "scratched" &&
          !isRelayStroke(e.stroke, e.eventKey),
      ),
    [entries, membershipId],
  );

  const swimmerRelayLegs = useMemo(
    () => relayLegs.filter((leg) => leg.membershipId === membershipId),
    [relayLegs, membershipId],
  );

  const hasRelayEvents = useMemo(
    () => events.some((event) => isRelayStroke(event.stroke, event.eventKey)),
    [events],
  );

  const enteredRows = useMemo(() => {
    const rows: Array<
      | { kind: "relay"; eventNumber: number | null; leg: RelayLegRow }
      | { kind: "entry"; eventNumber: number | null; entry: EntryRow }
    > = [];
    for (const leg of swimmerRelayLegs) {
      const meetEvent = events.find((event) => event.id === leg.meetEventId);
      if (!meetEvent) continue;
      rows.push({
        kind: "relay",
        eventNumber: meetEvent.eventNumber,
        leg,
      });
    }
    for (const entry of swimmerEntries) {
      rows.push({
        kind: "entry",
        eventNumber: entry.eventNumber,
        entry,
      });
    }
    rows.sort((a, b) => {
      const aNumber = a.eventNumber ?? Number.MAX_SAFE_INTEGER;
      const bNumber = b.eventNumber ?? Number.MAX_SAFE_INTEGER;
      if (aNumber !== bNumber) return aNumber - bNumber;
      if (a.kind === b.kind) return 0;
      return a.kind === "relay" ? -1 : 1;
    });
    return rows;
  }, [events, swimmerEntries, swimmerRelayLegs]);

  const enteredEventIds = useMemo(
    () => new Set(swimmerEntries.map((e) => e.meetEventId)),
    [swimmerEntries],
  );

  const consecutivePairs = useMemo(() => {
    const ids = new Set(enteredEventIds);
    for (const leg of swimmerRelayLegs) {
      if (leg.legOrder >= 1 && leg.legOrder <= 4) {
        ids.add(leg.meetEventId);
      }
    }
    return consecutivePairsForMember(
      ids,
      events.map((event) => ({
        id: event.id,
        eventNumber: event.eventNumber,
        gender: event.gender,
      })),
    );
  }, [enteredEventIds, swimmerRelayLegs, events]);

  const consecutiveAlert = useMemo(() => {
    if (consecutivePairs.length === 0) return null;
    const eventById = new Map(events.map((event) => [event.id, event]));
    const lines = consecutivePairs.map((pair) => {
      const first = eventById.get(pair.firstEventId);
      const second = eventById.get(pair.secondEventId);
      const firstName = first
        ? `#${pair.firstEventNumber} ${formatEventName(first.distance, first.stroke)}`
        : `#${pair.firstEventNumber}`;
      const secondName = second
        ? `#${pair.secondEventNumber} ${formatEventName(second.distance, second.stroke)}`
        : `#${pair.secondEventNumber}`;
      return `${firstName} then ${secondName}`;
    });
    return lines.join("; ");
  }, [consecutivePairs, events]);

  const entryCounts = useMemo(() => {
    return {
      individual: swimmerEntries.length,
      relay: racingRelayCount(
        relayLegs.map((leg) => ({
          membershipId: leg.membershipId,
          meetEventId: leg.meetEventId,
          relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
          legOrder: leg.legOrder,
        })),
        membershipId,
      ),
    };
  }, [swimmerEntries, relayLegs, membershipId]);

  const availableEvents = useMemo(() => {
    if (!selectedSwimmer || isBlocked) return [];
    return events.filter(
      (event) =>
        !isRelayStroke(event.stroke, event.eventKey) &&
        !enteredEventIds.has(event.id) &&
        isSwimmerEligibleForEvent(selectedSwimmer.gender, event.gender),
    );
  }, [events, enteredEventIds, selectedSwimmer, isBlocked]);

  const limitAlert = useMemo(
    () =>
      entryLimitAlert({
        limits,
        entryCounts,
        limitsSummary,
      }),
    [limits, entryCounts, limitsSummary],
  );

  function bestSeedFor(eventKey: string) {
    if (!membershipId) return null;
    return (
      bestTimeByMembershipAndEvent.get(membershipId)?.get(eventKey) ?? null
    );
  }

  function seedInputValue(eventId: string, eventKey: string) {
    if (seedDrafts[eventId] !== undefined) return seedDrafts[eventId]!;
    const best = bestSeedFor(eventKey);
    return best != null ? formatTime(best) : "";
  }

  function resolveSeed(
    eventId: string,
    eventKey: string,
  ): {
    seedTimeMs: number | null;
    seedTimeSource: "personal_best" | "manual" | "no_time";
  } | null {
    const draft = seedDrafts[eventId];
    const best = bestSeedFor(eventKey);

    if (draft === undefined) {
      if (best != null) {
        return { seedTimeMs: best, seedTimeSource: "personal_best" };
      }
      return { seedTimeMs: null, seedTimeSource: "no_time" };
    }

    const raw = draft.trim();
    if (!raw) {
      return { seedTimeMs: null, seedTimeSource: "no_time" };
    }
    const parsed = parseTime(raw);
    if (!parsed || parsed <= 0) return null;
    return { seedTimeMs: parsed, seedTimeSource: "manual" };
  }

  function refresh() {
    router.refresh();
  }

  function enteredSeedValue(entry: EntryRow) {
    if (seedDrafts[entry.id] !== undefined) return seedDrafts[entry.id]!;
    return entry.seedTimeMs != null ? formatTime(entry.seedTimeMs) : "";
  }

  function saveEnteredSeed(entry: EntryRow, raw: string) {
    const trimmed = raw.trim();
    const prevMs = entry.seedTimeMs;
    if (!trimmed) {
      if (prevMs == null) return;
      setPendingAction(`seed:${entry.id}`);
      startTransition(async () => {
        try {
          const result = await updateMeetEntryAction(teamId, meetId, entry.id, {
            seedTimeMs: null,
            seedTimeSource: "no_time",
          });
          if (!result.ok) {
            setActionError(result.message);
            return;
          }
          refresh();
        } finally {
          setPendingAction(null);
        }
      });
      return;
    }
    const parsed = parseTime(trimmed);
    if (!parsed || parsed <= 0) return;
    if (prevMs === parsed) return;
    setPendingAction(`seed:${entry.id}`);
    startTransition(async () => {
      try {
        const result = await updateMeetEntryAction(teamId, meetId, entry.id, {
          seedTimeMs: parsed,
          seedTimeSource: "manual",
        });
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function setAttendanceForMember(
    targetMembershipId: string,
    status: MeetAttendanceUiStatus,
  ) {
    setPendingAction(`attendance:${targetMembershipId}:${status}`);
    startTransition(async () => {
      try {
        await setMeetAttendanceAction(
          teamId,
          meetId,
          targetMembershipId,
          status,
        );
        refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function setAttendanceBulk(status: MeetAttendanceUiStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setPendingAction(`attendance:bulk:${status}`);
    startTransition(async () => {
      try {
        await setMeetAttendanceBulkAction(teamId, meetId, ids, status);
        setSelectedIds(new Set());
        refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function setRelayOnlyForMember(
    targetMembershipId: string,
    relayOnly: boolean,
  ) {
    setPendingAction(`relay-only:${relayOnly ? "on" : "off"}`);
    startTransition(async () => {
      try {
        await setMeetRelayOnlyAction(
          teamId,
          meetId,
          targetMembershipId,
          relayOnly,
        );
        refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function addEntry(event: EventRow) {
    const resolved = resolveSeed(event.id, event.eventKey);
    if (!resolved) return;

    if (!selectedSwimmer) return;
    const admission = admitNewIndividualEntry({
      commitments: attendance.map((row) => ({
        membershipId: row.membershipId,
        status: row.status,
      })),
      membershipId,
      eligibilityStatus: selectedSwimmer.eligibilityStatus,
      swimmerGender: selectedSwimmer.gender,
      event,
      limits,
      entries,
      relayLegs,
      scoringCap: associationCaps?.maxScoringEntriesPerIndividualEvent,
      exhibition: exhibitionDrafts[event.id] === true,
    });
    if (!admission.ok) {
      setActionError(admission.reason);
      return;
    }

    const qtCheck = checkQualifyingTime(
      event.qualifyingTimeMs,
      resolved.seedTimeMs,
    );
    if (!qtCheck.ok) {
      setActionError(qtCheck.reason);
    } else {
      setActionError(null);
    }

    setPendingAction(`add:${event.id}`);
    startTransition(async () => {
      try {
        const result = await addMeetEntryAction(teamId, meetId, {
          meetEventId: event.id,
          membershipId,
          seedTimeMs: resolved.seedTimeMs,
          seedTimeSource: resolved.seedTimeSource,
          status: "approved",
          exhibition: exhibitionDrafts[event.id] === true,
          entryNotes: notesDrafts[event.id]?.trim() || undefined,
        });
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        setSeedDrafts((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        setExhibitionDrafts((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        setNotesDrafts((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Couldn't add this entry.",
        );
      } finally {
        setPendingAction(null);
      }
    });
  }

  const age = selectedSwimmer
    ? swimmerAgeOnDate(selectedSwimmer.dateOfBirth, meetStartDate)
    : null;

  const filterLabel =
    filter === "all"
      ? `All (${roster.length})`
      : filter === "has_entries"
        ? `Has entries (${roster.filter((r) => (assignmentByMembership.events.get(r.membershipId) ?? 0) + (assignmentByMembership.alts.get(r.membershipId) ?? 0) > 0).length})`
        : filter === "no_entries"
          ? `No entries yet (${roster.filter((r) => (assignmentByMembership.events.get(r.membershipId) ?? 0) + (assignmentByMembership.alts.get(r.membershipId) ?? 0) === 0).length})`
          : filter === "ineligible"
            ? `Ineligible (${roster.filter((r) => blocksMeetEntries(r.eligibilityStatus)).length})`
            : `${MEET_ATTENDANCE_UI_LABELS[filter as MeetAttendanceUiStatus]} (${attendanceFilterCount(roster, attendanceByMembership, filter as MeetAttendanceUiStatus)})`;

  return (
    <div className="flex min-h-112 min-w-0 w-full flex-col gap-4 lg:flex-row lg:items-stretch">
      {/* Lane board */}
      <aside className="border-border bg-card flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border lg:w-[36%] lg:max-w-md">
        <div className="border-border space-y-3 border-b p-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a swimmer…"
              className="pl-8"
              aria-label="Search swimmers"
            />
          </div>
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {selectedIds.size} selected
              </span>
              <Select
                onValueChange={(value) => {
                  if (
                    value === "committed" ||
                    value === "pending" ||
                    value === "not_going" ||
                    value === "not_eligible"
                  ) {
                    setAttendanceBulk(value);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-40">
                  <SelectValue placeholder="Set status…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ATTENDANCE_FILTERS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {MEET_ATTENDANCE_UI_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                disabled={pending}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filter}
              onValueChange={(v) => {
                if (v != null) setFilter(v as RosterFilter);
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-36">
                <SelectValue>{filterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has_entries">Has entries</SelectItem>
                  <SelectItem value="no_entries">No entries yet</SelectItem>
                  {ATTENDANCE_FILTERS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {MEET_ATTENDANCE_UI_LABELS[status]}
                    </SelectItem>
                  ))}
                  <SelectItem value="ineligible">
                    Ineligible (profile)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={groupFilter}
              onValueChange={(v) => {
                if (v != null) setGroupFilter(v);
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-32">
                <SelectValue>
                  {groupFilter === "all"
                    ? "All groups"
                    : groupFilter === "none"
                      ? "No group"
                      : (groups.find(([id]) => id === groupFilter)?.[1] ??
                        "Group")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All groups</SelectItem>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0"
                    aria-label="Sort swimmers"
                  >
                    <ArrowDownUpIcon aria-hidden />
                    <span className="sr-only">Sort swimmers</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(value) => {
                    if (
                      value === "last_name" ||
                      value === "first_name" ||
                      value === "group"
                    ) {
                      setSort(value);
                    }
                  }}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuRadioItem value="last_name" closeOnClick>
                      Last name A–Z
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="first_name" closeOnClick>
                      First name A–Z
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="group" closeOnClick>
                      Group
                    </DropdownMenuRadioItem>
                  </DropdownMenuGroup>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ul className="max-h-[70vh] flex-1 overflow-y-auto">
          {filteredRoster.length === 0 ? (
            <li className="text-muted-foreground p-4 text-sm">
              No swimmers match this filter.
            </li>
          ) : (
            filteredRoster.map((row) => {
              const attendance = resolveMeetAttendanceUiStatus(
                attendanceByMembership.get(row.membershipId),
              );
              const profileIneligible = blocksMeetEntries(
                row.eligibilityStatus,
              );
              const events =
                assignmentByMembership.events.get(row.membershipId) ?? 0;
              const alts =
                assignmentByMembership.alts.get(row.membershipId) ?? 0;
              const hasIndividual =
                (individualCountByMembership.get(row.membershipId) ?? 0) > 0;
              const onRelayAssignment = relayLegSet.has(row.membershipId);
              const attendanceBlocksEntry =
                attendance === "not_going" || attendance === "not_eligible";
              const showRelayOnlyBadge =
                !attendanceBlocksEntry &&
                !profileIneligible &&
                isRelayOnlyMeetAthlete({
                  explicitRelayOnly:
                    relayOnlyByMembership.get(row.membershipId) ?? false,
                  onRelayAssignment,
                  hasRacingIndividual: hasIndividual,
                });
              const explicitRelayOnly =
                relayOnlyByMembership.get(row.membershipId) ?? false;
              const active = row.membershipId === membershipId;
              const rowAge = swimmerAgeOnDate(row.dateOfBirth, meetStartDate);
              const statusLabel = rowStatusLabel(
                attendance,
                row.eligibilityStatus,
              );

              return (
                <li key={row.membershipId} className="border-border border-b">
                  <div
                    className={cn(
                      "flex items-start gap-1 px-2 py-1.5",
                      active && "bg-muted/60",
                    )}
                  >
                    <Checkbox
                      className="mt-2 shrink-0"
                      checked={selectedIds.has(row.membershipId)}
                      onCheckedChange={(checked) =>
                        toggleSelected(row.membershipId, checked === true)
                      }
                      aria-label={`Select ${row.firstName} ${row.lastName}`}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-0.5 py-1 pl-1 text-left"
                      onClick={() => setMembershipId(row.membershipId)}
                    >
                      <span className="truncate text-sm font-medium">
                        {row.firstName} {row.lastName}
                        {rowAge != null ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {rowAge}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        {statusLabel ? (
                          <>
                            <span
                              className={cn(
                                "inline-block size-1.5 rounded-full",
                                profileIneligible && "bg-amber-500",
                                attendance === "not_going" && "bg-destructive",
                                attendance === "pending" && "bg-amber-500",
                                attendance === "not_eligible" &&
                                  "bg-muted-foreground",
                              )}
                              aria-hidden
                            />
                            {statusLabel}
                            <span>·</span>
                          </>
                        ) : null}
                        <span>{formatAssignmentCountLine(events, alts)}</span>
                        {showRelayOnlyBadge ? (
                          <>
                            <span>·</span>
                            <Badge variant="secondary" className="text-[10px]">
                              Relay only
                            </Badge>
                          </>
                        ) : null}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="mt-1 shrink-0"
                            aria-label={`Actions for ${row.firstName} ${row.lastName}`}
                            disabled={pending}
                          >
                            <MoreVertical aria-hidden />
                            <span className="sr-only">
                              Actions for {row.firstName} {row.lastName}
                            </span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {ATTENDANCE_FILTERS.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() =>
                              setAttendanceForMember(row.membershipId, status)
                            }
                          >
                            {MEET_ATTENDANCE_UI_LABELS[status]}
                          </DropdownMenuItem>
                        ))}
                        {profileIneligible ? (
                          <DropdownMenuItem
                            render={
                              <Link
                                href={`/team/${teamId}/swimmers/${row.swimmerId}`}
                                prefetch={false}
                              />
                            }
                          >
                            Update eligibility on profile
                          </DropdownMenuItem>
                        ) : null}
                        {!profileIneligible &&
                        !attendanceBlocksEntry &&
                        !hasIndividual ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setRelayOnlyForMember(
                                row.membershipId,
                                !explicitRelayOnly,
                              )
                            }
                          >
                            {explicitRelayOnly
                              ? "Clear relay only"
                              : "Mark as relay only"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Timing board */}
      <section
        className={cn(
          "border-border bg-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
        )}
        key={membershipId || "empty"}
      >
        {!selectedSwimmer ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
            Select a swimmer from the lane board.
          </div>
        ) : (
          <>
            <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {selectedSwimmer.firstName} {selectedSwimmer.lastName}
                  {age != null ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {age}
                    </span>
                  ) : null}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {groupLabel(selectedSwimmer)} ·{" "}
                  {formatGenderLabel(selectedSwimmer.gender)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {formatEntryCountsSentence(entryCounts)}
                </p>
              </div>
              {!isProfileIneligible ? (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Label htmlFor="meet-attendance-status" className="sr-only">
                    Meet attendance
                  </Label>
                  <Select
                    value={selectedAttendance}
                    onValueChange={(value) => {
                      if (
                        value === "committed" ||
                        value === "pending" ||
                        value === "not_going" ||
                        value === "not_eligible"
                      ) {
                        setAttendanceForMember(membershipId, value);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="meet-attendance-status"
                      className="h-8 w-[10.5rem]"
                      disabled={pending}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ATTENDANCE_FILTERS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {MEET_ATTENDANCE_UI_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-4">
              {isProfileIneligible ? (
                <Alert>
                  <AlertTitle>Ineligible on profile</AlertTitle>
                  <AlertDescription>
                    {selectedSwimmer.eligibilityNotes?.trim()
                      ? `${selectedSwimmer.eligibilityNotes.trim()} `
                      : ""}
                    This swimmer cannot be entered in meets until eligibility is
                    updated on their{" "}
                    <Link
                      href={`/team/${teamId}/swimmers/${selectedSwimmer.swimmerId}`}
                      className="underline"
                      prefetch={false}
                    >
                      swimmer profile
                    </Link>
                    .
                  </AlertDescription>
                </Alert>
              ) : null}
              {selectedAttendance === "not_going" ? (
                <Alert>
                  <AlertTitle>Not going to this meet</AlertTitle>
                  <AlertDescription>
                    This swimmer will not export and cannot be entered in
                    events. Set status to Committed if plans change.
                  </AlertDescription>
                </Alert>
              ) : null}
              {selectedAttendance === "not_eligible" ? (
                <Alert>
                  <AlertTitle>Not eligible for this meet</AlertTitle>
                  <AlertDescription>
                    This swimmer will not export and cannot be entered in
                    events.
                  </AlertDescription>
                </Alert>
              ) : null}
              {isPendingAttendance ? (
                <Alert>
                  <AlertTriangleIcon />
                  <AlertTitle>Pending commitment</AlertTitle>
                  <AlertDescription>
                    Entries are allowed, but this swimmer is excluded from
                    HY3/CL2/SD3 export until status is Committed.
                  </AlertDescription>
                </Alert>
              ) : null}
              {actionError ? (
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertTitle>Couldn't add entry</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              ) : null}
              {consecutiveAlert ? (
                <Alert>
                  <InfoIcon />
                  <AlertTitle>Back-to-back events</AlertTitle>
                  <AlertDescription>
                    This swimmer is entered in consecutive events for this
                    gender&apos;s program: {consecutiveAlert}. This is a warning
                    only.
                  </AlertDescription>
                </Alert>
              ) : null}

              {limitAlert ? (
                <Alert
                  variant={
                    limitAlert.variant === "destructive"
                      ? "destructive"
                      : "default"
                  }
                >
                  {limitAlert.variant === "destructive" ? (
                    <AlertTriangleIcon />
                  ) : (
                    <InfoIcon />
                  )}
                  <AlertTitle>{limitAlert.title}</AlertTitle>
                  <AlertDescription>{limitAlert.description}</AlertDescription>
                </Alert>
              ) : null}

              {!isBlocked ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      Entered
                    </h3>
                    {hasRelayEvents ? (
                      <a
                        href="#relay-lineup"
                        className="text-muted-foreground text-xs underline underline-offset-2"
                      >
                        Assign relays
                      </a>
                    ) : null}
                  </div>
                  {swimmerEntries.length === 0 &&
                  swimmerRelayLegs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No events yet. Add individual events below, or assign
                      relays in Relay lineup.
                    </p>
                  ) : (
                    <ul className="divide-border divide-y rounded-md border">
                      {enteredRows.map((row) => {
                        if (row.kind === "relay") {
                          const leg = row.leg;
                          const meetEvent = events.find(
                            (e) => e.id === leg.meetEventId,
                          );
                          if (!meetEvent) return null;
                          const letter = deriveRelayLetter(
                            leg.relayLetter,
                            leg.legOrder,
                          );
                          const slotId = `relay:${leg.meetEventId}:${letter}:${leg.legOrder}`;
                          const line = `${formatEventLine(meetEvent)} · ${letter} · ${relayLegRoleLabel(meetEvent.stroke, leg.legOrder)}`;
                          return (
                            <li
                              key={slotId}
                              className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {line}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                aria-label={`Remove ${line}`}
                                onClick={() => {
                                  setPendingAction(`remove:${slotId}`);
                                  startTransition(async () => {
                                    try {
                                      await removeMeetRelaySlotAction(
                                        teamId,
                                        meetId,
                                        leg.meetEventId,
                                        letter,
                                        leg.legOrder,
                                      );
                                      refresh();
                                    } finally {
                                      setPendingAction(null);
                                    }
                                  });
                                }}
                              >
                                {pendingAction === `remove:${slotId}` ? (
                                  <Spinner aria-hidden />
                                ) : (
                                  <Minus aria-hidden />
                                )}
                                <span className="sr-only">Remove {line}</span>
                              </Button>
                            </li>
                          );
                        }
                        const entry = row.entry;
                        const meetEvent = events.find(
                          (e) => e.id === entry.meetEventId,
                        );
                        const qtLabel = qtDisplay(meetEvent?.qualifyingTimeMs);
                        return (
                          <li
                            key={entry.id}
                            className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {formatEventLine(entry)}
                            </span>
                            <span
                              className="text-muted-foreground font-timing w-16 shrink-0 text-right text-xs tabular-nums"
                              title={
                                qtLabel
                                  ? `Qualifying time ${qtLabel}`
                                  : undefined
                              }
                            >
                              {qtLabel ? `QT ${qtLabel}` : ""}
                            </span>
                            <Input
                              className="font-timing h-8 w-24 text-sm tabular-nums"
                              placeholder="NT"
                              value={enteredSeedValue(entry)}
                              onChange={(e) =>
                                setSeedDrafts((prev) => ({
                                  ...prev,
                                  [entry.id]: formatTypedSwimTime(
                                    e.target.value,
                                  ),
                                }))
                              }
                              onBlur={(e) => {
                                saveEnteredSeed(entry, e.target.value);
                                setSeedDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[entry.id];
                                  return next;
                                });
                              }}
                              aria-label={`Seed time for ${formatEventLine(entry)}`}
                            />
                            <label
                              htmlFor={`entered-exh-${entry.id}`}
                              className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                            >
                              <Checkbox
                                id={`entered-exh-${entry.id}`}
                                checked={entry.exhibition === true}
                                disabled={pending}
                                onCheckedChange={(checked) => {
                                  const nextExhibition = checked === true;
                                  if (entry.exhibition && !nextExhibition) {
                                    const admission = admitClearExhibition({
                                      entries,
                                      meetEventId: entry.meetEventId,
                                      entryId: entry.id,
                                      scoringCap:
                                        associationCaps?.maxScoringEntriesPerIndividualEvent,
                                    });
                                    if (!admission.ok) {
                                      setActionError(admission.reason);
                                      return;
                                    }
                                  }
                                  setPendingAction(`exh:${entry.id}`);
                                  startTransition(async () => {
                                    try {
                                      const result =
                                        await updateMeetEntryAction(
                                          teamId,
                                          meetId,
                                          entry.id,
                                          { exhibition: checked === true },
                                        );
                                      if (!result.ok) {
                                        setActionError(result.message);
                                        return;
                                      }
                                      setActionError(null);
                                      refresh();
                                    } finally {
                                      setPendingAction(null);
                                    }
                                  });
                                }}
                                aria-label="Exhibition"
                              />
                              Exh
                            </label>
                            <Input
                              className="h-8 w-36 text-xs"
                              defaultValue={entry.entryNotes ?? ""}
                              placeholder="Notes"
                              aria-label={`Notes for ${formatEventLine(entry)}`}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                const prev = entry.entryNotes?.trim() ?? "";
                                if (next === prev) return;
                                setPendingAction(`notes:${entry.id}`);
                                startTransition(async () => {
                                  try {
                                    const result = await updateMeetEntryAction(
                                      teamId,
                                      meetId,
                                      entry.id,
                                      { entryNotes: next || null },
                                    );
                                    if (!result.ok) {
                                      setActionError(result.message);
                                      return;
                                    }
                                    refresh();
                                  } finally {
                                    setPendingAction(null);
                                  }
                                });
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              aria-label={`Remove ${formatEventLine(entry)}`}
                              onClick={() => {
                                setPendingAction(`remove:${entry.id}`);
                                startTransition(async () => {
                                  try {
                                    await deleteMeetEntryAction(
                                      teamId,
                                      meetId,
                                      entry.id,
                                    );
                                    refresh();
                                  } finally {
                                    setPendingAction(null);
                                  }
                                });
                              }}
                            >
                              {pendingAction === `remove:${entry.id}` ? (
                                <Spinner aria-hidden />
                              ) : (
                                <Minus aria-hidden />
                              )}
                              <span className="sr-only">
                                Remove {formatEventLine(entry)}
                              </span>
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              {!isBlocked ? (
                <div className="space-y-2">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    Available
                  </h3>
                  {events.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Import a meet events file before building entries.
                    </p>
                  ) : availableEvents.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No eligible events left for this swimmer.
                    </p>
                  ) : (
                    <ul className="divide-border divide-y rounded-md border">
                      {availableEvents.map((event) => {
                        const best = bestSeedFor(event.eventKey);
                        const candidateIsRelay = isRelayStroke(
                          event.stroke,
                          event.eventKey,
                        );
                        const limitCheck = canAddMeetEntry(
                          limits,
                          entryCounts,
                          candidateIsRelay,
                        );
                        const resolved = resolveSeed(event.id, event.eventKey);
                        const seedMs = resolved?.seedTimeMs ?? null;
                        const qtMs = event.qualifyingTimeMs;
                        const qtCheck = checkQualifyingTime(qtMs, seedMs);
                        const missesQt = !qtCheck.ok;
                        return (
                          <li
                            key={event.id}
                            className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {formatEventLine(event)}
                            </span>
                            <span
                              className="text-muted-foreground font-timing w-16 shrink-0 text-right text-xs tabular-nums"
                              title={
                                qtMs != null && qtMs > 0
                                  ? `Qualifying time ${formatTime(qtMs)}`
                                  : undefined
                              }
                            >
                              {qtMs != null && qtMs > 0
                                ? `QT ${formatTime(qtMs)}`
                                : ""}
                            </span>
                            <Input
                              className={cn(
                                "font-timing h-8 w-24 text-sm tabular-nums",
                                missesQt && "border-amber-500/80",
                              )}
                              placeholder="NT"
                              value={seedInputValue(event.id, event.eventKey)}
                              onChange={(e) =>
                                setSeedDrafts((prev) => ({
                                  ...prev,
                                  [event.id]: formatTypedSwimTime(
                                    e.target.value,
                                  ),
                                }))
                              }
                              aria-label={`Seed time for ${formatEventName(event.distance, event.stroke)}`}
                              aria-invalid={missesQt || undefined}
                            />
                            {best != null &&
                            seedDrafts[event.id] === undefined ? (
                              <span className="text-muted-foreground sr-only sm:not-sr-only sm:text-xs">
                                best
                              </span>
                            ) : null}
                            {missesQt ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 text-xs" />
                                  }
                                  aria-label="Seed slower than qualifying time"
                                >
                                  <AlertTriangleIcon className="size-3.5 shrink-0" />
                                  <span className="sr-only sm:not-sr-only">
                                    Slower than QT
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {qtCheck.ok
                                    ? null
                                    : `${qtCheck.reason} You can still enter this swim.`}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                            <label
                              htmlFor={`exh-${event.id}`}
                              className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                            >
                              <Checkbox
                                id={`exh-${event.id}`}
                                checked={exhibitionDrafts[event.id] === true}
                                onCheckedChange={(checked) =>
                                  setExhibitionDrafts((prev) => ({
                                    ...prev,
                                    [event.id]: checked === true,
                                  }))
                                }
                                aria-label="Exhibition"
                              />
                              Exh
                            </label>
                            <Input
                              className="h-8 w-36 text-xs"
                              placeholder="Notes"
                              value={notesDrafts[event.id] ?? ""}
                              onChange={(e) =>
                                setNotesDrafts((prev) => ({
                                  ...prev,
                                  [event.id]: e.target.value,
                                }))
                              }
                              aria-label={`Notes for ${formatEventName(event.distance, event.stroke)}`}
                            />
                            <AddEntryButton
                              disabled={
                                pending || !membershipId || !limitCheck.ok
                              }
                              limitReason={
                                !limitCheck.ok ? limitCheck.reason : undefined
                              }
                              pending={pendingAction === `add:${event.id}`}
                              onClick={() => addEntry(event)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
