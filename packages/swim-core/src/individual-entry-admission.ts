import { canAddScoringEntry } from "./association-event-caps";
import {
  canAddMeetEntry,
  type EntryCounts,
  isRelayStroke,
  type MeetEntryLimits,
} from "./entry-limits";
import { type Gender, isSwimmerEligibleForEvent } from "./events";
import { blocksMeetEntryForAttendance } from "./meet-attendance";
import { type RelayLegCountInput, racingRelayCount } from "./relay-legs";
import { blocksMeetEntries } from "./team-types";

export type EntryAdmission = { ok: true } | { ok: false; reason: string };

export type AdmissionEntryRow = {
  id?: string;
  membershipId: string;
  meetEventId: string;
  status: string;
  stroke?: string;
  eventKey?: string;
  exhibition?: boolean;
};

const ATTENDANCE_REFUSAL =
  "This swimmer cannot be entered in events for this meet.";
const ELIGIBILITY_REFUSAL =
  "This swimmer is ineligible on their profile. Update eligibility on their swimmer page to enter events.";
const GENDER_REFUSAL =
  "Swimmer gender does not match this event. Choose a matching event.";
const RELAY_REFUSAL =
  "Assign relays in Relay lineup, not as individual entries.";

export function entryCountsForMember(
  entries: AdmissionEntryRow[],
  membershipId: string,
  relayLegs: RelayLegCountInput[],
  excludeEntryId?: string,
): EntryCounts {
  let individual = 0;
  for (const entry of entries) {
    if (entry.membershipId !== membershipId) continue;
    if (entry.status === "scratched") continue;
    if (excludeEntryId && entry.id === excludeEntryId) continue;
    if (entry.stroke != null && isRelayStroke(entry.stroke, entry.eventKey)) {
      continue;
    }
    individual += 1;
  }
  return {
    individual,
    relay: racingRelayCount(relayLegs, membershipId),
  };
}

export function scoringCountForEvent(
  entries: AdmissionEntryRow[],
  meetEventId: string,
  excludeEntryId?: string,
): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.meetEventId !== meetEventId) continue;
    if (entry.status === "scratched") continue;
    if (entry.exhibition) continue;
    if (excludeEntryId && entry.id === excludeEntryId) continue;
    count += 1;
  }
  return count;
}

function attendanceBlocks(
  commitments: Array<{ membershipId: string; status: string }>,
  membershipId: string,
): boolean {
  return commitments.some(
    (commitment) =>
      commitment.membershipId === membershipId &&
      blocksMeetEntryForAttendance(commitment.status),
  );
}

/** New individual entry. Exhibition stays whatever the coach marked. */
export function admitNewIndividualEntry(args: {
  commitments: Array<{ membershipId: string; status: string }>;
  membershipId: string;
  eligibilityStatus: string | null | undefined;
  swimmerGender: Gender;
  event: {
    id: string;
    gender: string;
    stroke: string;
    eventKey: string;
  };
  limits: MeetEntryLimits | null | undefined;
  entries: AdmissionEntryRow[];
  relayLegs: RelayLegCountInput[];
  scoringCap: number | null | undefined;
  exhibition: boolean;
}): EntryAdmission {
  if (attendanceBlocks(args.commitments, args.membershipId)) {
    return { ok: false, reason: ATTENDANCE_REFUSAL };
  }
  if (blocksMeetEntries(args.eligibilityStatus)) {
    return { ok: false, reason: ELIGIBILITY_REFUSAL };
  }
  if (!isSwimmerEligibleForEvent(args.swimmerGender, args.event.gender)) {
    return { ok: false, reason: GENDER_REFUSAL };
  }
  if (isRelayStroke(args.event.stroke, args.event.eventKey)) {
    return { ok: false, reason: RELAY_REFUSAL };
  }
  const limitCheck = canAddMeetEntry(
    args.limits,
    entryCountsForMember(args.entries, args.membershipId, args.relayLegs),
    false,
  );
  if (!limitCheck.ok) return limitCheck;
  return canAddScoringEntry({
    cap: args.scoringCap,
    currentScoringCount: scoringCountForEvent(args.entries, args.event.id),
    candidateIsExhibition: args.exhibition,
  });
}

/** Coach cleared exhibition on an entry that was already exhibition. */
export function admitClearExhibition(args: {
  entries: AdmissionEntryRow[];
  meetEventId: string;
  entryId: string;
  scoringCap: number | null | undefined;
}): EntryAdmission {
  return canAddScoringEntry({
    cap: args.scoringCap,
    currentScoringCount: scoringCountForEvent(
      args.entries,
      args.meetEventId,
      args.entryId,
    ),
    candidateIsExhibition: false,
  });
}

/** Scratched individual or relay entry coming back to approved. */
export function admitRestoredEntry(args: {
  entries: AdmissionEntryRow[];
  relayLegs: RelayLegCountInput[];
  membershipId: string;
  entryId: string;
  meetEventId: string;
  event: { stroke: string; eventKey: string };
  limits: MeetEntryLimits | null | undefined;
  exhibition: boolean;
  scoringCap: number | null | undefined;
}): EntryAdmission {
  const limitCheck = canAddMeetEntry(
    args.limits,
    entryCountsForMember(
      args.entries,
      args.membershipId,
      args.relayLegs,
      args.entryId,
    ),
    isRelayStroke(args.event.stroke, args.event.eventKey),
  );
  if (!limitCheck.ok) return limitCheck;
  if (args.exhibition) return { ok: true };
  return canAddScoringEntry({
    cap: args.scoringCap,
    currentScoringCount: scoringCountForEvent(
      args.entries,
      args.meetEventId,
      args.entryId,
    ),
    candidateIsExhibition: false,
  });
}
