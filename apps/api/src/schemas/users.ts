import { z } from "@hono/zod-openapi";

export const userTeamSchema = z
  .object({
    id: z.string().openapi({ description: "Team id", example: "org_8f2k" }),
    name: z.string().openapi({ example: "Mesa Aquatics" }),
    slug: z.string().nullable().openapi({ example: "mesa-aquatics" }),
    role: z.string().openapi({
      description: "The user's role on this team",
      example: "head_coach",
    }),
    canHostMeets: z.boolean().openapi({
      description: "Whether this user can publish results for the team",
    }),
  })
  .openapi("Team");

export const meResponseSchema = z
  .object({
    user: z.object({
      id: z.string(),
      name: z.string().openapi({ example: "Jordan Coach" }),
      email: z.string().openapi({ example: "coach@example.com" }),
    }),
    teams: z.array(userTeamSchema),
  })
  .openapi("Me");
