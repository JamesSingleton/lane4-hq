import type {
  HeatPublication,
  PublishedLane,
} from "@api/schemas/heat-publication";
import { ApiError } from "@api/utils/errors";
import type { AuditContext } from "@lane4hq/db/audit";
import { MEET_HOSTING_ROLES, requireTeamRole } from "@lane4hq/db/authz";
import {
  getHostedMeet,
  getHostedMeetsForOrganization,
  getPublishedHeats,
  type RecordHeatOutcome,
  recordHeatPublication,
} from "@lane4hq/db/queries/hosted-meets";

export type PublishHeatResult = Exclude<RecordHeatOutcome, "meet_taken">;

/**
 * Store one verified heat from a deck machine. Safe to retry: the same
 * revision is a no-op, and an older revision never replaces a newer one.
 */
export async function publishHeat(input: {
  userId: string;
  teamId: string;
  meetId: string;
  idempotencyKey: string | undefined;
  publication: HeatPublication;
  audit: AuditContext;
}): Promise<PublishHeatResult> {
  const { userId, teamId, meetId, publication } = input;
  await requireTeamRole(userId, teamId, [...MEET_HOSTING_ROLES]);
  if (publication.meet.id !== meetId) {
    throw new ApiError(
      400,
      "meet_mismatch",
      "The publication is for a different meet than the URL.",
    );
  }
  if (
    input.idempotencyKey != null &&
    input.idempotencyKey !== publication.idempotencyKey
  ) {
    throw new ApiError(
      400,
      "idempotency_key_mismatch",
      "The Idempotency-Key header doesn't match the publication.",
    );
  }
  const outcome = await recordHeatPublication({
    organizationId: teamId,
    userId,
    meet: publication.meet,
    heat: {
      eventNumber: publication.event.number,
      round: publication.event.round,
      heat: publication.heat,
      revision: publication.revision,
      idempotencyKey: publication.idempotencyKey,
      event: publication.event,
      lanes: publication.lanes,
      verifiedAt: new Date(publication.verifiedAt),
    },
    audit: input.audit,
  });
  if (outcome === "meet_taken") {
    throw new ApiError(
      403,
      "meet_taken",
      "Another team already publishes results for this meet.",
    );
  }
  return outcome;
}

export async function listHostedMeets(input: {
  userId: string;
  teamId: string;
}) {
  await requireTeamRole(input.userId, input.teamId, [...MEET_HOSTING_ROLES]);
  const meets = await getHostedMeetsForOrganization(input.teamId);
  return meets.map((m) => ({
    id: m.id,
    name: m.name,
    startDate: m.startDate,
    course: m.course,
    location: m.location,
    lastPublishedAt: m.lastPublishedAt?.toISOString() ?? null,
  }));
}

type PublicAthlete = { firstName: string; lastName: string };

/** Published results are public; birthdays and member ids never leave. */
function publicAthlete(a: {
  firstName: string;
  lastName: string;
}): PublicAthlete {
  return { firstName: a.firstName, lastName: a.lastName };
}

export function publicLane(lane: PublishedLane) {
  return {
    lane: lane.lane,
    teamCode: lane.teamCode,
    ...(lane.athlete ? { athlete: publicAthlete(lane.athlete) } : {}),
    ...(lane.relay
      ? {
          relay: {
            letter: lane.relay.letter,
            legs: lane.relay.legs.map(publicAthlete),
          },
        }
      : {}),
    status: lane.status,
    timeMs: lane.timeMs,
    splitsMs: lane.splitsMs,
    place: lane.place,
    exhibition: lane.exhibition,
    ...(lane.dqCode ? { dqCode: lane.dqCode } : {}),
    ...(lane.dive ? { diveTotal: lane.dive.total } : {}),
  };
}

/** Everything published so far for a meet, for live results. */
export async function getMeetResults(meetId: string) {
  const meet = await getHostedMeet(meetId);
  if (!meet) {
    throw new ApiError(404, "not_found", "No results for this meet yet.");
  }
  const heats = await getPublishedHeats(meetId);
  return {
    meet: {
      id: meet.id,
      name: meet.name,
      startDate: meet.startDate,
      course: meet.course,
      location: meet.location,
      lastPublishedAt: meet.lastPublishedAt?.toISOString() ?? null,
    },
    heats: heats.map((h) => ({
      event: h.event as HeatPublication["event"],
      heat: h.heat,
      revision: h.revision,
      verifiedAt: h.verifiedAt.toISOString(),
      lanes: (h.lanes as PublishedLane[]).map(publicLane),
    })),
  };
}
