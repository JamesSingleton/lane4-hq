"use client";

import type { AssociationEventCaps } from "@lane4hq/swim-core/association-event-caps";
import type { SharedDraftQuota } from "@lane4hq/swim-core/draft-quota";
import {
  isRelayStroke,
  type MeetEntryLimits,
} from "@lane4hq/swim-core/entry-limits";
import { formatEventName } from "@lane4hq/swim-core/events";
import type { EligibilityStatus } from "@lane4hq/swim-core/team-types";
import { blocksMeetEntries } from "@lane4hq/swim-core/team-types";
import { Button } from "@lane4hq/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@lane4hq/ui/components/tabs";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { writeUnconfirmedMeetEntriesView } from "../meet-entries-view";
import { EntryMatrix } from "./entry-matrix";
import { LineupSuggestPanel } from "./lineup-suggest-panel";
import { ProgramEntriesBoard } from "./program-entries-board";
import { RegistrationBoard } from "./registration-board";
import { RelaySuggestPanel } from "./relay-suggest-panel";

type EntriesView = "swimmer" | "event";

export type MeetEntriesSharedRosterRow = {
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

export type MeetEntriesSharedEventRow = {
  id: string;
  eventNumber: number | null;
  distance: number;
  stroke: string;
  gender: string;
  ageGroup: string | null;
  eventKey: string;
  qualifyingTimeMs: number | null;
};

export type MeetEntriesSharedEntryRow = {
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
  eventKey: string;
};

export type MeetEntriesSharedCommitmentRow = {
  membershipId: string;
  status: string;
  relayOnly: boolean;
  notes?: string | null;
  firstName: string;
  lastName: string;
};

export type MeetEntriesSharedBestTimeRow = {
  membershipId: string;
  eventKey: string;
  timeMs: number;
};

export type MeetEntriesSharedRelayLegRow = {
  meetEventId: string;
  membershipId: string;
  legOrder: number;
  relayLetter: string | null;
  stroke: string | null;
  reasoning: string | null;
};

export type MeetEntriesSharedRelayTeamRow = {
  meetEventId: string;
  relayLetter: string;
  seedTimeMs: number | null;
};

/** Serializable meet entries payload mapped once on the server. */
export type MeetEntriesSharedData = {
  teamId: string;
  meetId: string;
  course: string;
  meetStartDate: Date;
  limits: MeetEntryLimits | null;
  roster: MeetEntriesSharedRosterRow[];
  events: MeetEntriesSharedEventRow[];
  entries: MeetEntriesSharedEntryRow[];
  commitments: MeetEntriesSharedCommitmentRow[];
  bestTimes: MeetEntriesSharedBestTimeRow[];
  relayLegs: MeetEntriesSharedRelayLegRow[];
  relayTeams: MeetEntriesSharedRelayTeamRow[];
  notGoingMembershipIds: string[];
  pendingMembershipIds: string[];
};

function isRelayEvent(event: { stroke: string; eventKey: string }) {
  return (
    event.stroke.includes("relay") ||
    event.eventKey.includes("relay") ||
    event.stroke === "free_relay" ||
    event.stroke === "medley_relay"
  );
}

function registrationPropsFromShared(
  shared: MeetEntriesSharedData,
): Omit<ComponentProps<typeof RegistrationBoard>, "associationCaps"> {
  return {
    teamId: shared.teamId,
    meetId: shared.meetId,
    course: shared.course,
    meetStartDate: shared.meetStartDate,
    limits: shared.limits,
    roster: shared.roster,
    events: shared.events,
    entries: shared.entries,
    attendance: shared.commitments,
    bestTimes: shared.bestTimes,
    relayLegs: shared.relayLegs.map(
      ({ meetEventId, membershipId, legOrder, relayLetter, stroke }) => ({
        meetEventId,
        membershipId,
        legOrder,
        relayLetter,
        stroke,
      }),
    ),
  };
}

function programPropsFromShared(
  shared: MeetEntriesSharedData,
): Omit<ComponentProps<typeof ProgramEntriesBoard>, "caps"> {
  return {
    teamId: shared.teamId,
    meetId: shared.meetId,
    roster: shared.roster.map(
      ({ membershipId, firstName, lastName, gender, eligibilityStatus }) => ({
        membershipId,
        firstName,
        lastName,
        gender,
        eligibilityStatus,
      }),
    ),
    events: shared.events.map(
      ({ id, eventNumber, distance, stroke, gender, eventKey }) => ({
        id,
        eventNumber,
        distance,
        stroke,
        gender,
        eventKey,
      }),
    ),
    entries: shared.entries.map(
      ({
        id,
        meetEventId,
        membershipId,
        firstName,
        lastName,
        status,
        stroke,
        eventKey,
        exhibition,
        seedTimeMs,
      }) => ({
        id,
        meetEventId,
        membershipId,
        firstName,
        lastName,
        status,
        stroke,
        eventKey,
        exhibition,
        seedTimeMs,
      }),
    ),
    limits: shared.limits,
    relayLegs: shared.relayLegs.map(
      ({ meetEventId, membershipId, legOrder, relayLetter }) => ({
        meetEventId,
        membershipId,
        legOrder,
        relayLetter,
      }),
    ),
    relayTeams: shared.relayTeams,
    notGoingMembershipIds: shared.notGoingMembershipIds,
    bestTimes: shared.bestTimes,
  };
}

function relayPanelPropsFromShared(
  shared: MeetEntriesSharedData,
  draftQuota: SharedDraftQuota,
): ComponentProps<typeof RelaySuggestPanel> | null {
  const relayEvents = shared.events.filter(isRelayEvent).map((event) => {
    const gender =
      event.gender === "female"
        ? "Female"
        : event.gender === "male"
          ? "Male"
          : event.gender === "mixed"
            ? "Mixed"
            : event.gender;
    return {
      id: event.id,
      label: `#${event.eventNumber ?? "—"} ${gender} ${formatEventName(event.distance, event.stroke)}`,
      stroke: event.stroke,
      eventKey: event.eventKey,
      gender: event.gender,
    };
  });
  if (relayEvents.length === 0) return null;

  const nameByMembership = new Map(
    shared.roster.map(
      (r) => [r.membershipId, `${r.firstName} ${r.lastName}`] as const,
    ),
  );
  const notGoing = new Set(shared.notGoingMembershipIds);

  const individualCountByMembership: Record<string, number> = {};
  for (const entry of shared.entries) {
    if (entry.status === "scratched") continue;
    if (isRelayStroke(entry.stroke, entry.eventKey)) continue;
    individualCountByMembership[entry.membershipId] =
      (individualCountByMembership[entry.membershipId] ?? 0) + 1;
  }

  const candidates = shared.roster
    .filter(
      (r) =>
        !notGoing.has(r.membershipId) &&
        !blocksMeetEntries(r.eligibilityStatus),
    )
    .map((r) => ({
      membershipId: r.membershipId,
      name: `${r.firstName} ${r.lastName}`,
      gender: r.gender,
    }));

  return {
    teamId: shared.teamId,
    meetId: shared.meetId,
    events: relayEvents,
    initialLegs: shared.relayLegs.map((leg) => ({
      meetEventId: leg.meetEventId,
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: leg.relayLetter,
      stroke: leg.stroke,
      reasoning: leg.reasoning,
      name: nameByMembership.get(leg.membershipId) ?? "Unknown",
    })),
    initialTeams: shared.relayTeams,
    limits: shared.limits,
    individualCountByMembership,
    candidates,
    draftQuota,
  };
}

export function EntriesWorkspace({
  shared,
  initialView,
  caps,
  meetLimitsLine,
  canSuggestLineup,
  draftQuota,
}: {
  shared: MeetEntriesSharedData;
  initialView: EntriesView;
  caps: AssociationEventCaps;
  meetLimitsLine: string | null;
  canSuggestLineup: boolean;
  draftQuota: SharedDraftQuota;
}) {
  const [view, setView] = useState<EntriesView>(initialView);

  const registration = useMemo(
    () => registrationPropsFromShared(shared),
    [shared],
  );
  const program = useMemo(() => programPropsFromShared(shared), [shared]);
  const relayPanel = useMemo(
    () => relayPanelPropsFromShared(shared, draftQuota),
    [shared, draftQuota],
  );

  useEffect(() => {
    writeUnconfirmedMeetEntriesView(shared.teamId, initialView);
  }, [shared.teamId, initialView]);

  function onViewChange(next: string | null) {
    if (next !== "swimmer" && next !== "event") return;
    setView(next);
    writeUnconfirmedMeetEntriesView(shared.teamId, next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          {meetLimitsLine ? (
            <p className="text-muted-foreground text-sm">
              Meet allows {meetLimitsLine}.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {relayPanel ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<a href="#relay-lineup" />}
            >
              Relay lineup
            </Button>
          ) : null}
          <Tabs value={view} onValueChange={onViewChange}>
            <TabsList>
              <TabsTrigger value="swimmer">By swimmer</TabsTrigger>
              <TabsTrigger value="event">By event</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {view === "swimmer" ? (
        <>
          <RegistrationBoard {...registration} associationCaps={caps} />
          <EntryMatrix
            teamId={shared.teamId}
            meetId={shared.meetId}
            events={shared.events}
            swimmers={shared.roster.map((row) => ({
              membershipId: row.membershipId,
              firstName: row.firstName,
              lastName: row.lastName,
            }))}
            entries={shared.entries.map((entry) => ({
              id: entry.id,
              meetEventId: entry.meetEventId,
              membershipId: entry.membershipId,
              status: entry.status,
              seedTimeMs: entry.seedTimeMs,
              exhibition: entry.exhibition,
            }))}
            relayLegs={shared.relayLegs.map((leg, index) => ({
              id: `${leg.meetEventId}:${leg.membershipId}:${leg.legOrder}:${index}`,
              meetEventId: leg.meetEventId,
              membershipId: leg.membershipId,
              relayLetter: leg.relayLetter ?? "A",
              legOrder: leg.legOrder,
              stroke: leg.stroke,
            }))}
            limits={shared.limits}
            pendingMembershipIds={shared.pendingMembershipIds}
          />
        </>
      ) : (
        <ProgramEntriesBoard {...program} caps={caps} />
      )}

      {relayPanel ? (
        <section id="relay-lineup" className="scroll-mt-8 flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-medium">Relay lineup</h2>
            <p className="text-muted-foreground text-sm">
              Leg order, seeds, and alternates. Who is on A/B can also be set in
              By event.
            </p>
          </div>
          <RelaySuggestPanel {...relayPanel} />
        </section>
      ) : null}

      <LineupSuggestPanel
        teamId={shared.teamId}
        meetId={shared.meetId}
        available={canSuggestLineup}
      />
    </div>
  );
}
