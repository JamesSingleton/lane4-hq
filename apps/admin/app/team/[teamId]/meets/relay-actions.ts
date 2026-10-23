"use server";

import { openai } from "@ai-sdk/openai";
import { tagException } from "@lane4hq/analytics";
import { getSession } from "@lane4hq/auth/session";
import { ingestAiGenerationEvent } from "@lane4hq/billing/polar";
import { requireTeamRole } from "@lane4hq/db/authz";
import { assertAndRecordAiGeneration } from "@lane4hq/db/queries/ai-quota";
import {
  getMeetById,
  getMeetCommitments,
  getMeetEntriesDetailed,
  getMeetEvents,
  getMeetRelayLegs,
  getMeetRelayTeams,
  getRosterBestTimesForEvents,
  replaceMeetRelayLegs,
  replaceMeetRelayTeams,
  updateMeetRelayTeamSeed,
} from "@lane4hq/db/queries/meets";
import { getRoster } from "@lane4hq/db/queries/roster";
import { associationCountWithinCap } from "@lane4hq/swim-core/association-event-caps";
import type { SharedDraftQuota } from "@lane4hq/swim-core/draft-quota";
import {
  checkMeetEntryCounts,
  isRelayStroke,
  type MeetEntryLimits,
} from "@lane4hq/swim-core/entry-limits";
import {
  formatEventName,
  type Gender,
  isSwimmerEligibleForEvent,
  parseEventKey,
} from "@lane4hq/swim-core/events";
import { indexMeetCommitments } from "@lane4hq/swim-core/meet-attendance";
import { getPlanLimits } from "@lane4hq/swim-core/plans";
import {
  deriveRelayLetter,
  RELAY_MAX_LEGS,
  RELAY_PRIMARY_LEG_COUNT,
  RELAY_TEAM_LETTERS,
  racingRelayKeysByMember,
  relayLegBestTimeKeys,
  relayLegTimeKey,
  strokeForRelayLeg,
} from "@lane4hq/swim-core/relay-legs";
import { blocksMeetEntries } from "@lane4hq/swim-core/team-types";
import { formatTime } from "@lane4hq/swim-core/times";
import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import { resolvedAssociationCapsForMeet } from "./association-caps";

export type RelaySuggestInput = {
  meetId: string;
  meetEventId: string;
  /** Number of relay teams to fill: 1=A, 2=A+B, 3=A+B+C */
  numberOfRelays?: 1 | 2 | 3;
  allowDoubles?: boolean;
  optimizeFor?: "speed" | "participation";
};

export type RelayLegSuggestion = {
  membershipId: string;
  legOrder: number;
  stroke?: string;
  reasoning?: string;
  teamLetter: string;
  name: string;
};

export async function saveMeetRelayLegsAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  legs: Array<{
    membershipId: string;
    legOrder: number;
    relayLetter: string;
    stroke?: string;
    reasoning?: string;
  }>,
  teams: Array<{
    relayLetter: string;
    seedTimeMs?: number | null;
    seedTimeSource?: "personal_best" | "manual" | "no_time";
  }> = [],
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const events = await getMeetEvents(meetId);
  const event = events.find((row) => row.id === meetEventId);
  if (!event || !isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error("Selected event is not a relay");
  }

  const cleaned = legs
    .filter((leg) => leg.membershipId && leg.legOrder >= 1)
    .slice(0, RELAY_MAX_LEGS * 3)
    .map((leg) => ({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      stroke: leg.stroke,
      reasoning: leg.reasoning,
    }));

  const racingLetters = new Set(
    cleaned
      .filter(
        (leg) => leg.legOrder >= 1 && leg.legOrder <= RELAY_PRIMARY_LEG_COUNT,
      )
      .map((leg) => leg.relayLetter),
  );
  const caps = await resolvedAssociationCapsForMeet(teamId, meet);
  const relayCapCheck = associationCountWithinCap(
    caps.maxRelayTeamsPerEvent,
    racingLetters.size,
    "relay",
  );
  if (!relayCapCheck.ok) throw new Error(relayCapCheck.reason);

  const [existingLegs, entries, roster] = await Promise.all([
    getMeetRelayLegs(meetId),
    getMeetEntriesDetailed(meetId),
    getRoster(teamId),
  ]);
  const limits: MeetEntryLimits = {
    maxIndividualEntries: meet.maxIndividualEntries,
    maxRelayEntries: meet.maxRelayEntries,
    maxCombinedEntries: meet.maxCombinedEntries,
    entryLimitPackages: meet.entryLimitPackages,
  };
  const individualByMember = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === "scratched") continue;
    if (isRelayStroke(entry.stroke, entry.eventKey)) continue;
    individualByMember.set(
      entry.membershipId,
      (individualByMember.get(entry.membershipId) ?? 0) + 1,
    );
  }
  const otherLegs = existingLegs.filter(
    (leg) => leg.meetEventId !== meetEventId,
  );
  const combined = [
    ...otherLegs.map((leg) => ({
      membershipId: leg.membershipId,
      meetEventId: leg.meetEventId,
      relayLetter: leg.relayLetter,
      legOrder: leg.legOrder,
    })),
    ...cleaned.map((leg) => ({
      membershipId: leg.membershipId,
      meetEventId,
      relayLetter: leg.relayLetter,
      legOrder: leg.legOrder,
    })),
  ];
  const nameById = new Map(
    roster.map(
      (row) => [row.membershipId, `${row.firstName} ${row.lastName}`] as const,
    ),
  );
  const genderById = new Map(
    roster.map((row) => [row.membershipId, row.gender] as const),
  );
  for (const leg of cleaned) {
    const gender = genderById.get(leg.membershipId);
    if (!gender || !isSwimmerEligibleForEvent(gender, event.gender)) {
      const name = nameById.get(leg.membershipId) ?? "A swimmer";
      throw new Error(
        `${name} cannot be assigned to this ${event.gender} relay.`,
      );
    }
  }
  for (const [membershipId, keys] of racingRelayKeysByMember(combined)) {
    const check = checkMeetEntryCounts(limits, {
      individual: individualByMember.get(membershipId) ?? 0,
      relay: keys.size,
    });
    if (!check.ok) {
      const name = nameById.get(membershipId) ?? "A swimmer";
      throw new Error(`${name}: ${check.reason}`);
    }
  }

  const cleanedTeams = teams.map((team) => ({
    relayLetter: deriveRelayLetter(team.relayLetter, 1),
    seedTimeMs: team.seedTimeMs ?? null,
    seedTimeSource: team.seedTimeSource ?? "no_time",
  }));

  await replaceMeetRelayLegs({
    meetId,
    meetEventId,
    legs: cleaned,
  });
  await replaceMeetRelayTeams({
    meetId,
    meetEventId,
    teams: cleanedTeams,
  });
  revalidatePath(`/team/${teamId}/meets/${meetId}`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/entries`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/report`);
}

export async function assignRacingRelaySwimmerAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  membershipId: string,
  relayLetter: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const letter = deriveRelayLetter(relayLetter, 1);
  const [legs, teams] = await Promise.all([
    getMeetRelayLegs(meetId),
    getMeetRelayTeams(meetId),
  ]);
  const eventLegs = legs.filter((leg) => leg.meetEventId === meetEventId);
  const racing = eventLegs.filter(
    (leg) =>
      deriveRelayLetter(leg.relayLetter, leg.legOrder) === letter &&
      leg.legOrder >= 1 &&
      leg.legOrder <= RELAY_PRIMARY_LEG_COUNT,
  );
  if (racing.some((leg) => leg.membershipId === membershipId)) {
    throw new Error("That swimmer is already on this relay team.");
  }
  const used = new Set(racing.map((leg) => leg.legOrder));
  let nextOrder = 1;
  while (used.has(nextOrder) && nextOrder <= RELAY_PRIMARY_LEG_COUNT) {
    nextOrder += 1;
  }
  if (nextOrder > RELAY_PRIMARY_LEG_COUNT) {
    throw new Error(
      `Relay ${letter} already has four racing legs. Edit order in Relay lineup.`,
    );
  }

  const nextLegs = [
    ...eventLegs.map((leg) => ({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      stroke: leg.stroke ?? undefined,
      reasoning: leg.reasoning ?? undefined,
    })),
    {
      membershipId,
      legOrder: nextOrder,
      relayLetter: letter,
    },
  ];
  const eventTeams = teams.filter((team) => team.meetEventId === meetEventId);
  const nextTeams = eventTeams.some(
    (team) => deriveRelayLetter(team.relayLetter, 1) === letter,
  )
    ? eventTeams.map((team) => ({
        relayLetter: deriveRelayLetter(team.relayLetter, 1),
        seedTimeMs: team.seedTimeMs,
        seedTimeSource: team.seedTimeSource ?? "no_time",
      }))
    : [
        ...eventTeams.map((team) => ({
          relayLetter: deriveRelayLetter(team.relayLetter, 1),
          seedTimeMs: team.seedTimeMs,
          seedTimeSource: team.seedTimeSource ?? "no_time",
        })),
        { relayLetter: letter },
      ];

  await saveMeetRelayLegsAction(
    teamId,
    meetId,
    meetEventId,
    nextLegs,
    nextTeams,
  );
}

export async function setMeetRelaySlotAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  relayLetter: string,
  legOrder: number,
  membershipId: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  if (legOrder < 1 || legOrder > RELAY_MAX_LEGS) {
    throw new Error("Invalid relay slot");
  }

  const letter = deriveRelayLetter(relayLetter, legOrder);
  const [legs, teams] = await Promise.all([
    getMeetRelayLegs(meetId),
    getMeetRelayTeams(meetId),
  ]);
  const eventLegs = legs.filter((leg) => leg.meetEventId === meetEventId);
  const nextLegs = eventLegs
    .filter(
      (leg) =>
        !(
          deriveRelayLetter(leg.relayLetter, leg.legOrder) === letter &&
          leg.legOrder === legOrder
        ),
    )
    .map((leg) => ({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      stroke: leg.stroke ?? undefined,
      reasoning: leg.reasoning ?? undefined,
    }));
  if (membershipId) {
    const onTeam = nextLegs.some(
      (leg) => leg.relayLetter === letter && leg.membershipId === membershipId,
    );
    if (onTeam) {
      throw new Error("That swimmer is already on this relay team.");
    }
    nextLegs.push({
      membershipId,
      legOrder,
      relayLetter: letter,
      stroke: undefined,
      reasoning: undefined,
    });
  }
  const eventTeams = teams.filter((team) => team.meetEventId === meetEventId);
  const mappedTeams = eventTeams.map((team) => ({
    relayLetter: deriveRelayLetter(team.relayLetter, 1),
    seedTimeMs: team.seedTimeMs,
    seedTimeSource: team.seedTimeSource ?? "no_time",
  }));
  const nextTeams = mappedTeams.some((team) => team.relayLetter === letter)
    ? mappedTeams
    : [...mappedTeams, { relayLetter: letter }];

  await saveMeetRelayLegsAction(
    teamId,
    meetId,
    meetEventId,
    nextLegs,
    nextTeams,
  );
}

export async function removeMeetRelaySlotAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  relayLetter: string,
  legOrder: number,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const letter = deriveRelayLetter(relayLetter, legOrder);
  const legs = await getMeetRelayLegs(meetId);
  const remaining = legs
    .filter((leg) => leg.meetEventId === meetEventId)
    .filter(
      (leg) =>
        !(
          deriveRelayLetter(leg.relayLetter, leg.legOrder) === letter &&
          leg.legOrder === legOrder
        ),
    )
    .map((leg) => ({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      stroke: leg.stroke ?? undefined,
      reasoning: leg.reasoning ?? undefined,
    }));

  await replaceMeetRelayLegs({
    meetId,
    meetEventId,
    legs: remaining,
  });
  revalidatePath(`/team/${teamId}/meets/${meetId}`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/entries`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/report`);
}

export async function removeMeetRelayTeamAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  relayLetter: string,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");

  const fromLetter = deriveRelayLetter(relayLetter, 1);
  const fromIndex = (RELAY_TEAM_LETTERS as readonly string[]).indexOf(
    fromLetter,
  );
  if (fromIndex < 0) {
    throw new Error("Unknown relay team");
  }
  const dropping = new Set<string>(RELAY_TEAM_LETTERS.slice(fromIndex));

  const [legs, teams] = await Promise.all([
    getMeetRelayLegs(meetId),
    getMeetRelayTeams(meetId),
  ]);
  const nextLegs = legs
    .filter((leg) => leg.meetEventId === meetEventId)
    .filter(
      (leg) => !dropping.has(deriveRelayLetter(leg.relayLetter, leg.legOrder)),
    )
    .map((leg) => ({
      membershipId: leg.membershipId,
      legOrder: leg.legOrder,
      relayLetter: deriveRelayLetter(leg.relayLetter, leg.legOrder),
      stroke: leg.stroke ?? undefined,
      reasoning: leg.reasoning ?? undefined,
    }));
  const nextTeams = teams
    .filter((team) => team.meetEventId === meetEventId)
    .filter((team) => !dropping.has(deriveRelayLetter(team.relayLetter, 1)))
    .map((team) => ({
      relayLetter: deriveRelayLetter(team.relayLetter, 1),
      seedTimeMs: team.seedTimeMs,
      seedTimeSource: team.seedTimeSource ?? "no_time",
    }));

  await saveMeetRelayLegsAction(
    teamId,
    meetId,
    meetEventId,
    nextLegs,
    nextTeams,
  );
}

export async function suggestRelayOrderAction(
  teamId: string,
  input: RelaySuggestInput,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);

  if (!process.env.OPENAI_API_KEY) {
    throw tagException(
      new Error("Relay suggestions are not available right now."),
      "openai_unconfigured",
    );
  }

  const numberOfRelays = input.numberOfRelays ?? 1;
  const allowDoubles = input.allowDoubles ?? false;
  const optimizeFor = input.optimizeFor ?? "speed";

  const quotaRecord = await assertAndRecordAiGeneration({
    organizationId: teamId,
    userId: session?.user?.id,
    kind: "relay",
  });
  if (session?.user?.id) {
    await ingestAiGenerationEvent({
      externalCustomerId: session.user.id,
      organizationId: teamId,
      kind: "relay",
    });
  }

  const [meet, events, roster, commitments, existingLegs] = await Promise.all([
    getMeetById(input.meetId, teamId),
    getMeetEvents(input.meetId),
    getRoster(teamId),
    getMeetCommitments(input.meetId),
    getMeetRelayLegs(input.meetId),
  ]);

  if (!meet) throw new Error("Meet not found");
  const event = events.find((e) => e.id === input.meetEventId);
  if (!event) throw new Error("Meet event not found");
  if (!isRelayStroke(event.stroke, event.eventKey)) {
    throw new Error("Selected event is not a relay");
  }

  const commitmentMaps = indexMeetCommitments(commitments);
  const pool = roster.filter(
    (r) =>
      !commitmentMaps.notGoingIds.has(r.membershipId) &&
      !commitmentMaps.meetNotEligibleIds.has(r.membershipId) &&
      !blocksMeetEntries(r.eligibilityStatus),
  );

  if (pool.length < 4) {
    throw new Error(
      commitmentMaps.notGoingIds.size > 0 ||
        commitmentMaps.meetNotEligibleIds.size > 0
        ? "Need at least 4 eligible swimmers attending this meet for a relay"
        : "Need at least 4 eligible roster swimmers for a relay",
    );
  }

  const maxRelayEntries = meet.maxRelayEntries;
  const relayEntryCountByMember = racingRelayKeysByMember(
    existingLegs
      .filter((leg) => leg.meetEventId !== input.meetEventId)
      .map((leg) => ({
        membershipId: leg.membershipId,
        meetEventId: leg.meetEventId,
        relayLetter: leg.relayLetter,
        legOrder: leg.legOrder,
      })),
  );

  const eligible = pool.filter((s) => {
    if (maxRelayEntries == null) return true;
    const current = relayEntryCountByMember.get(s.membershipId)?.size ?? 0;
    return current < maxRelayEntries;
  });

  if (eligible.length < 4) {
    throw new Error(
      maxRelayEntries != null
        ? `Not enough swimmers under the relay entry limit (${maxRelayEntries}).`
        : "Not enough eligible swimmers for a relay",
    );
  }

  const relayGenders: Gender[] =
    event.gender === "male" || event.gender === "female"
      ? [event.gender]
      : ["female", "male"];
  const times = await getRosterBestTimesForEvents(
    teamId,
    relayLegBestTimeKeys(event.eventKey, relayGenders),
  );

  const timeByMemberAndKey = new Map<string, number>();
  for (const t of times) {
    const key = `${t.membershipId}|${t.eventKey}`;
    const prev = timeByMemberAndKey.get(key);
    if (prev == null || t.timeMs < prev) timeByMemberAndKey.set(key, t.timeMs);
  }

  const parsedRelay = parseEventKey(event.eventKey);
  const legDistance =
    parsedRelay != null && parsedRelay.distance % 4 === 0
      ? parsedRelay.distance / 4
      : null;
  const isMedley =
    event.stroke === "medley_relay" || event.eventKey.includes("medley");
  const swimmerLines = eligible
    .map((s) => {
      const gender: Gender | null =
        s.gender === "male" || s.gender === "female" ? s.gender : null;
      const slots = isMedley ? [1, 2, 3, 4] : [1];
      const timesForSwimmer = slots
        .map((slot) => {
          const stroke = strokeForRelayLeg(event.stroke, slot);
          const key = gender
            ? relayLegTimeKey(event.eventKey, slot, gender)
            : null;
          const ms = key
            ? timeByMemberAndKey.get(`${s.membershipId}|${key}`)
            : null;
          const label =
            legDistance != null ? `${legDistance} ${stroke}` : stroke;
          return `${label} ${ms != null ? formatTime(ms) : "no time"}`;
        })
        .join(", ");
      const relayCount = relayEntryCountByMember.get(s.membershipId)?.size ?? 0;
      return `${s.firstName} ${s.lastName} (${s.membershipId}): ${timesForSwimmer}; currentRelayEntries=${relayCount}; gender=${s.gender}`;
    })
    .join("\n");

  const letters = RELAY_TEAM_LETTERS.slice(0, numberOfRelays).join(", ");

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are a competitive swim coach assigning relay teams.
Return ONLY valid JSON:
{"teams":[{"letter":"A","order":[{"membershipId":"...","stroke":"free|back|breast|fly","reason":"..."}]}],"summary":"..."}

Rules:
- Create exactly ${numberOfRelays} team(s): letters ${letters}.
- Each team has exactly 4 swimmers.
- ${allowDoubles ? "Doubles ARE allowed: a swimmer may appear on multiple teams, but prefer not to overload anyone." : "NO doubles: each membershipId may appear at most once across all teams."}
- Optimize for ${optimizeFor === "participation" ? "participation (spread opportunity; B/C teams get solid athletes too)" : "speed (fastest possible A team, then B, then C)"}.
- Times are one leg of the relay (a 200 relay is four 50s, a 400 relay is four 100s).
- ${isMedley ? "Medley order must be back, breast, fly, free. Use each stroke's time." : "Free relay: every leg is freestyle. Put the fastest freestyler last (anchor)."}
- Prefer swimmers with fewer currentRelayEntries when near the meet relay entry limit.
- Never invent membershipIds; use only candidates provided.`,
    prompt: `Event: ${formatEventName(event.distance, event.stroke)} (${event.eventKey})
Meet maxRelayEntries: ${maxRelayEntries ?? "none"}
Candidates:
${swimmerLines}`,
  });

  let parsed: {
    teams: Array<{
      letter?: string;
      order: Array<{ membershipId: string; stroke?: string; reason?: string }>;
    }>;
    summary?: string;
  };
  try {
    const json = text.trim().replace(/^```json\n?|\n?```$/g, "");
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Couldn't parse suggested relay order.");
  }

  if (!Array.isArray(parsed.teams) || parsed.teams.length === 0) {
    throw new Error("No relay teams in the suggestion.");
  }

  const nameById = new Map(
    roster.map(
      (r) => [r.membershipId, `${r.firstName} ${r.lastName}`] as const,
    ),
  );
  const eligibleIds = new Set(eligible.map((s) => s.membershipId));
  const used = new Set<string>();
  const legs: RelayLegSuggestion[] = [];
  const usageCount = new Map<string, number>();

  parsed.teams.slice(0, numberOfRelays).forEach((team, teamIndex) => {
    const letter =
      team.letter?.toUpperCase() || RELAY_TEAM_LETTERS[teamIndex] || "A";
    const order = (team.order ?? []).slice(0, RELAY_PRIMARY_LEG_COUNT);
    if (order.length < RELAY_PRIMARY_LEG_COUNT) {
      throw new Error(
        `Team ${letter} needs ${RELAY_PRIMARY_LEG_COUNT} swimmers`,
      );
    }
    order.forEach((leg, i) => {
      if (!eligibleIds.has(leg.membershipId)) {
        throw tagException(
          new Error("That suggestion included a swimmer who is not eligible."),
          "relay_ineligible",
        );
      }
      if (!allowDoubles && used.has(leg.membershipId)) {
        throw tagException(
          new Error(
            `${nameById.get(leg.membershipId) ?? "A swimmer"} is already on a relay, and doubles are off.`,
          ),
          "relay_double",
        );
      }
      const prior = usageCount.get(leg.membershipId) ?? 0;
      const existing = relayEntryCountByMember.get(leg.membershipId)?.size ?? 0;
      if (maxRelayEntries != null && existing + prior + 1 > maxRelayEntries) {
        throw tagException(
          new Error(
            `${nameById.get(leg.membershipId) ?? "A swimmer"} would be over the relay limit.`,
          ),
          "relay_limit",
        );
      }
      used.add(leg.membershipId);
      usageCount.set(leg.membershipId, prior + 1);
      const slot = i + 1;
      legs.push({
        membershipId: leg.membershipId,
        legOrder: slot,
        stroke: leg.stroke ?? strokeForRelayLeg(event.stroke, slot),
        reasoning: leg.reason
          ? `Team ${letter}: ${leg.reason}`
          : `Team ${letter}`,
        teamLetter: letter,
        name: nameById.get(leg.membershipId) ?? "Unknown",
      });
    });
  });

  const limits = getPlanLimits(quotaRecord.plan);
  const draftQuota: SharedDraftQuota = {
    remaining: quotaRecord.remaining,
    included: limits.aiGenerationsIncluded,
    used: quotaRecord.used,
    allowed: quotaRecord.remaining > 0 || limits.aiOverageAllowed,
    overageAllowed: limits.aiOverageAllowed,
  };

  return { legs, summary: parsed.summary ?? "", draftQuota };
}

export async function getMeetRelayLegsAction(teamId: string, meetId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  return getMeetRelayLegs(meetId);
}

export async function getMeetRelayTeamsAction(teamId: string, meetId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  return getMeetRelayTeams(meetId);
}

export async function updateMeetRelayTeamSeedAction(
  teamId: string,
  meetId: string,
  meetEventId: string,
  relayLetter: string,
  seedTimeMs: number | null,
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);
  const meet = await getMeetById(meetId, teamId);
  if (!meet) throw new Error("Meet not found");
  await updateMeetRelayTeamSeed(meetId, meetEventId, relayLetter, seedTimeMs);
  revalidatePath(`/team/${teamId}/meets/${meetId}`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/entries`);
  revalidatePath(`/team/${teamId}/meets/${meetId}/report`);
}
