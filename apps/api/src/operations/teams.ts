import { ApiError } from "@api/utils/errors";
import {
  getUserTeams,
  MEET_HOSTING_ROLES,
  requireTeamRole,
} from "@lane4hq/db/authz";
import {
  getMeetById,
  getMeetEvents,
  getMeets,
} from "@lane4hq/db/queries/meets";

export const MEET_PROGRAM_SCHEMA = "lane4.meet-program/v1" as const;

const HOSTING_ROLES = new Set<string>(MEET_HOSTING_ROLES);

/** Admin stores meet dates as UTC midnight timestamps. */
function dateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function teamsForUser(userId: string) {
  const teams = await getUserTeams(userId);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    role: t.role,
    canHostMeets: HOSTING_ROLES.has(t.role),
  }));
}

/** A team's meets, newest first, for picking one to download. */
export async function listTeamMeets(input: { userId: string; teamId: string }) {
  await requireTeamRole(input.userId, input.teamId, [...MEET_HOSTING_ROLES]);
  const meets = await getMeets(input.teamId);
  return meets.map((m) => ({
    id: m.id,
    name: m.name,
    startDate: dateOnly(m.startDate),
    endDate: dateOnly(m.endDate),
    course: m.course,
    location: m.location,
  }));
}

/**
 * A team's meet as a program the desktop meet manager can start from:
 * numbered events in order. Events without a number are left out.
 */
export async function getMeetProgram(input: {
  userId: string;
  teamId: string;
  meetId: string;
}) {
  await requireTeamRole(input.userId, input.teamId, [...MEET_HOSTING_ROLES]);
  const meet = await getMeetById(input.meetId, input.teamId);
  if (!meet) throw new ApiError(404, "not_found", "That meet doesn't exist.");
  const events = await getMeetEvents(meet.id);
  return {
    schema: MEET_PROGRAM_SCHEMA,
    meet: {
      id: meet.id,
      name: meet.name,
      startDate: dateOnly(meet.startDate),
      endDate: dateOnly(meet.endDate),
      course: meet.course,
      location: meet.location,
    },
    events: events
      .flatMap((e) =>
        e.eventNumber == null
          ? []
          : [
              {
                number: e.eventNumber,
                distance: e.distance,
                stroke: e.eventKind === "dive" ? "dive" : e.stroke,
                gender: e.gender,
                ageGroup: e.ageGroup,
                kind: e.eventKind,
                diveCount: e.diveCount,
              },
            ],
      )
      .sort((a, b) => a.number - b.number),
  };
}
