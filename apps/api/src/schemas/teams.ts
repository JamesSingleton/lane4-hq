import { MEET_PROGRAM_SCHEMA } from "@api/operations/teams";
import { z } from "@hono/zod-openapi";

export const teamParamsSchema = z.object({
  teamId: z.string().openapi({
    description: "Team id",
    param: { name: "teamId", in: "path" },
  }),
});

export const teamMeetParamsSchema = teamParamsSchema.extend({
  meetId: z.string().openapi({
    description: "Meet id",
    param: { name: "meetId", in: "path" },
  }),
});

export const teamMeetSchema = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: "Fall Invitational" }),
    startDate: z.string().nullable().openapi({ example: "2026-10-17" }),
    endDate: z.string().nullable().openapi({ example: "2026-10-18" }),
    course: z.string().openapi({ example: "SCY" }),
    location: z.string().nullable(),
  })
  .openapi("TeamMeet");

export const teamMeetsResponseSchema = z.object({
  meets: z.array(teamMeetSchema),
});

export const meetProgramSchema = z
  .object({
    schema: z.literal(MEET_PROGRAM_SCHEMA),
    meet: teamMeetSchema,
    events: z.array(
      z.object({
        number: z.number().int(),
        distance: z.number().int(),
        stroke: z.string(),
        gender: z.enum(["male", "female", "mixed"]),
        ageGroup: z.string().nullable(),
        kind: z.enum(["swim", "dive"]),
        diveCount: z.number().int().nullable(),
      }),
    ),
  })
  .openapi("MeetProgram");
