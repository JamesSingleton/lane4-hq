import { z } from "@hono/zod-openapi";

/** Mirrors `HeatPublication` in `@lane4hq/meet-engine/publish`. */
export const HEAT_PUBLICATION_SCHEMA = "lane4.heat-results/v1";

const Millis = z.number().int().nonnegative();

const PublishedAthlete = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    gender: z.enum(["male", "female"]).optional(),
    dateOfBirth: z.string().optional(),
    usaMemberId: z.string().optional(),
  })
  .openapi("PublishedAthlete");

const Dive = z.object({
  code: z.string(),
  position: z.enum(["A", "B", "C", "D"]),
  dd: z.number(),
  awards: z.array(z.number()),
  failed: z.boolean().optional(),
  balk: z.boolean().optional(),
});

export const ResultStatus = z.enum(["ok", "dq", "ns", "dnf"]);

const PublishedLane = z
  .object({
    lane: z.number().int().positive(),
    teamCode: z.string(),
    athlete: PublishedAthlete.optional(),
    relay: z
      .object({ letter: z.string(), legs: z.array(PublishedAthlete) })
      .optional(),
    status: ResultStatus,
    timeMs: Millis.nullable(),
    splitsMs: z.array(Millis),
    place: z.number().int().positive().nullable(),
    exhibition: z.boolean(),
    dqCode: z.string().optional(),
    dive: z.object({ dives: z.array(Dive), total: z.number() }).optional(),
  })
  .openapi("PublishedLane");

export const EventRound = z.enum(["timed_final", "prelim", "final"]);

export const PublishedEvent = z
  .object({
    number: z.number().int().positive(),
    distance: z.number().int().positive(),
    stroke: z.string(),
    gender: z.enum(["male", "female", "mixed"]),
    ageGroup: z.string().optional(),
    isRelay: z.boolean(),
    kind: z.enum(["swim", "dive"]),
    round: EventRound,
  })
  .openapi("PublishedEvent");

export const HeatPublication = z
  .object({
    schema: z.literal(HEAT_PUBLICATION_SCHEMA),
    idempotencyKey: z.string().min(1).max(300),
    meet: z.object({
      id: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      course: z.enum(["SCY", "SCM", "LCM"]),
      location: z.string().max(200).optional(),
    }),
    event: PublishedEvent,
    heat: z.number().int().positive(),
    revision: z.number().int().positive(),
    verifiedAt: z.iso.datetime({ offset: true }),
    lanes: z.array(PublishedLane).max(20),
  })
  .openapi("HeatPublication");

export type HeatPublication = z.infer<typeof HeatPublication>;
export type PublishedLane = z.infer<typeof PublishedLane>;
