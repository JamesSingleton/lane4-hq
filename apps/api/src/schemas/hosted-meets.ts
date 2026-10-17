import { z } from "@hono/zod-openapi";
import { PublishedEvent, ResultStatus } from "./heat-publication";

export const hostedMeetSchema = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: "Fall Invitational" }),
    startDate: z.string().nullable().openapi({ example: "2026-10-17" }),
    course: z.string().openapi({ example: "SCY" }),
    location: z.string().nullable(),
    lastPublishedAt: z.string().nullable(),
  })
  .openapi("HostedMeet");

export const hostedMeetsResponseSchema = z.object({
  meets: z.array(hostedMeetSchema),
});

export const hostedMeetParamsSchema = z.object({
  meetId: z.string().openapi({
    description: "Hosted meet id",
    param: { name: "meetId", in: "path" },
  }),
});

export const idempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().optional().openapi({
    description: "The publication's `idempotencyKey`",
  }),
});

export const publishResultSchema = z
  .object({ status: z.enum(["created", "updated", "duplicate"]) })
  .openapi("PublishResult");

const publicAthleteSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
});

export const resultLaneSchema = z
  .object({
    lane: z.number().int(),
    teamCode: z.string(),
    athlete: publicAthleteSchema.optional(),
    relay: z
      .object({ letter: z.string(), legs: z.array(publicAthleteSchema) })
      .optional(),
    status: ResultStatus,
    timeMs: z.number().int().nullable(),
    splitsMs: z.array(z.number().int()),
    place: z.number().int().nullable(),
    exhibition: z.boolean(),
    dqCode: z.string().optional(),
    diveTotal: z.number().optional(),
  })
  .openapi("ResultLane");

export const meetResultsSchema = z
  .object({
    meet: hostedMeetSchema,
    heats: z.array(
      z.object({
        event: PublishedEvent,
        heat: z.number().int(),
        revision: z.number().int(),
        verifiedAt: z.string(),
        lanes: z.array(resultLaneSchema),
      }),
    ),
  })
  .openapi("MeetResults");
