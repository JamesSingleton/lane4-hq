"use server";

import { openai } from "@ai-sdk/openai";
import { tagException } from "@lane4hq/analytics";
import { getSession } from "@lane4hq/auth/session";
import { ingestAiGenerationEvent } from "@lane4hq/billing/polar";
import { requireTeamRole } from "@lane4hq/db/authz";
import { assertAndRecordAiGeneration } from "@lane4hq/db/queries/ai-quota";
import { getAttendanceSummary } from "@lane4hq/db/queries/attendance";
import { getTeamTopTimes } from "@lane4hq/db/queries/progression";
import {
  attachWorkoutToPractice,
  createWorkout,
  getRecentWorkouts,
  getTrainingVolumeLastDays,
  getWorkoutById,
  listWorkouts,
  updateWorkout,
} from "@lane4hq/db/queries/workouts";
import type { SharedDraftQuota } from "@lane4hq/swim-core/draft-quota";
import { getPlanLimits } from "@lane4hq/swim-core/plans";
import { formatTime } from "@lane4hq/swim-core/times";
import {
  parseWorkoutText,
  textEditDistance,
} from "@lane4hq/swim-core/workout-parser";
import { generateText } from "ai";
import { revalidatePath } from "next/cache";

const SYSTEM_PROMPT = `You are an expert competitive swimming coach writing practice workouts.
Output ONLY plain-text coach notation that can be parsed by a deterministic parser.
Use this style:

Warm-up
4x100 free @ 1:30 easy
Main
8x50 fly @ :50 race
6x100 IM @ 1:40 moderate
Cool-down
200 choice easy

Rules:
- Use section headers: Warm-up, Main, Cool-down (or Kick / Pull / Drill when needed)
- Sets as NxDISTANCE stroke @ interval intensity
- Distances in yards/meters as whole numbers (25, 50, 100, 200, etc.)
- Strokes: free, back, breast, fly, IM, choice, kick, pull, drill
- Intensities: easy, moderate, threshold, race, sprint, recovery
- No markdown, no bullet lists, no athlete names, no medical info
- Match the club's notation style when examples are provided
- Respect volume context (do not overload after a high-yardage week)
- If attendance notes flag missed volume, include a controlled return-to-load warm-up`;

export async function listWorkoutsAction(teamId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  return listWorkouts(teamId);
}

export async function getWorkoutAction(teamId: string, workoutId: string) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
    "admin",
    "member",
  ]);
  return getWorkoutById(workoutId, teamId);
}

export async function parseWorkoutPreviewAction(rawText: string) {
  return parseWorkoutText(rawText);
}

export async function suggestWorkoutAction(
  teamId: string,
  input: {
    focus: string;
    durationMinutes?: number;
    energySystem?: string;
    practiceGroup?: string;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);

  if (!process.env.OPENAI_API_KEY) {
    throw tagException(
      new Error("Practice drafts are not available right now."),
      "openai_unconfigured",
    );
  }

  const quotaRecord = await assertAndRecordAiGeneration({
    organizationId: teamId,
    userId: session?.user?.id,
    kind: "workout",
  });
  if (session?.user?.id) {
    await ingestAiGenerationEvent({
      externalCustomerId: session.user.id,
      organizationId: teamId,
      kind: "workout",
    });
  }

  const [recent, volume, topTimes, attendanceSessions] = await Promise.all([
    getRecentWorkouts(teamId, 8),
    getTrainingVolumeLastDays(teamId, 7),
    getTeamTopTimes(teamId),
    getAttendanceSummary(teamId),
  ]);

  const examples =
    recent.length > 0
      ? recent
          .map(
            (w, i) =>
              `Example ${i + 1} (${w.title}, ${w.totalDistance ?? "?"} total):\n${w.rawText}`,
          )
          .join("\n\n")
      : "No prior team workouts yet — use clean standard club notation.";

  const timesContext =
    topTimes.length > 0
      ? topTimes
          .slice(0, 12)
          .map((t) => `${t.eventKey} ${t.course}: ${formatTime(t.timeMs)}`)
          .join("\n")
      : "No best times loaded yet — keep intensities moderate.";

  const avgRate =
    attendanceSessions.length > 0
      ? Math.round(
          attendanceSessions.reduce((sum, s) => sum + s.rate, 0) /
            attendanceSessions.length,
        )
      : null;
  const attendanceNote =
    avgRate == null
      ? "No recent attendance rolls."
      : `Recent attendance average ${avgRate}%. ${
          avgRate < 80
            ? "Missed volume likely — ease into main set."
            : "Attendance looks stable."
        }`;

  const prompt = [
    `Focus: ${input.focus}`,
    input.durationMinutes
      ? `Target duration: ~${input.durationMinutes} minutes`
      : null,
    input.energySystem ? `Energy system: ${input.energySystem}` : null,
    input.practiceGroup ? `Practice group: ${input.practiceGroup}` : null,
    `Recent 7-day volume: ${volume.totalDistance} yards/meters across ${volume.workoutCount} workouts.`,
    attendanceNote,
    "",
    "Recent team best times (performance context):",
    timesContext,
    "",
    "Recent team workouts (match style):",
    examples,
    "",
    "Write one complete practice workout now.",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    prompt,
  });

  const limits = getPlanLimits(quotaRecord.plan);
  const draftQuota: SharedDraftQuota = {
    remaining: quotaRecord.remaining,
    included: limits.aiGenerationsIncluded,
    used: quotaRecord.used,
    allowed: quotaRecord.remaining > 0 || limits.aiOverageAllowed,
    overageAllowed: limits.aiOverageAllowed,
  };

  return {
    draftText: text.trim(),
    prompt,
    draftQuota,
  };
}

export async function saveWorkoutAction(
  teamId: string,
  data: {
    workoutId?: string;
    title: string;
    rawText: string;
    practiceGroup?: string;
    distanceUnit?: "yards" | "meters" | null;
    wasAiGenerated?: boolean;
    aiPrompt?: string | null;
    aiDraftText?: string | null;
    practiceSessionId?: string | null;
  },
) {
  const session = await getSession();
  await requireTeamRole(session?.user?.id, teamId, [
    "owner",
    "head_coach",
    "assistant_coach",
  ]);

  const parsed = parseWorkoutText(data.rawText);
  const editDistance =
    data.aiDraftText != null
      ? textEditDistance(data.aiDraftText, data.rawText)
      : null;

  const payload = {
    title: data.title.trim() || "Practice",
    rawText: data.rawText,
    totalDistance: parsed.totalDistance,
    distanceUnit: data.distanceUnit ?? null,
    practiceGroup: data.practiceGroup ?? null,
    wasAiGenerated: data.wasAiGenerated ?? false,
    aiPrompt: data.aiPrompt ?? null,
    aiDraftText: data.aiDraftText ?? null,
    editDistance,
    createdByUserId: session?.user?.id ?? null,
    sets: parsed.sets.map((s) => ({
      sortOrder: s.sortOrder,
      section: s.section,
      reps: s.reps,
      distance: s.distance,
      stroke: s.stroke,
      intensity: s.intensity,
      interval: s.interval,
      notes: s.notes,
      rawLine: s.rawLine,
    })),
  };

  let id: string;
  if (data.workoutId) {
    const updated = await updateWorkout(data.workoutId, teamId, payload);
    if (!updated) throw new Error("Workout not found");
    id = updated;
  } else {
    id = await createWorkout(teamId, payload);
  }

  if (data.practiceSessionId) {
    await attachWorkoutToPractice(data.practiceSessionId, teamId, id);
    revalidatePath(`/team/${teamId}/attendance/${data.practiceSessionId}`);
  }

  revalidatePath(`/team/${teamId}/workouts`);
  revalidatePath(`/team/${teamId}/analytics`);
  return { id, parsed };
}
