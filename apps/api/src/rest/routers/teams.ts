import { listHostedMeets, publishHeat } from "@api/operations/hosted-meets";
import {
  getMeetProgram,
  listTeamMeets,
  MEET_PROGRAM_SCHEMA,
} from "@api/operations/teams";
import { rateLimit } from "@api/rest/middleware";
import type { AppEnv } from "@api/rest/types";
import { auditContext } from "@api/rest/utils/audit";
import { authErrors, bearer, errorResponse } from "@api/schemas/errors";
import { HeatPublication } from "@api/schemas/heat-publication";
import {
  hostedMeetsResponseSchema,
  idempotencyHeadersSchema,
  publishResultSchema,
} from "@api/schemas/hosted-meets";
import {
  meetProgramSchema,
  teamMeetParamsSchema,
  teamMeetsResponseSchema,
  teamParamsSchema,
} from "@api/schemas/teams";
import { validationHook } from "@api/utils/validation";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

app.openapi(
  createRoute({
    method: "get",
    path: "/{teamId}/meets",
    summary: "A team's meets, to download one onto a deck machine",
    operationId: "listTeamMeets",
    tags: ["Meets"],
    security: bearer,
    middleware: [rateLimit("user")] as const,
    request: { params: teamParamsSchema },
    responses: {
      200: {
        description: "Meets, newest first",
        content: { "application/json": { schema: teamMeetsResponseSchema } },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid("param");
    const meets = await listTeamMeets({ userId: c.get("user").id, teamId });
    return c.json({ meets }, 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/{teamId}/meets/{meetId}/program",
    summary: "Download a meet's numbered events",
    operationId: "getMeetProgram",
    tags: ["Meets"],
    security: bearer,
    middleware: [rateLimit("user")] as const,
    request: { params: teamMeetParamsSchema },
    responses: {
      200: {
        description: `The meet as a \`${MEET_PROGRAM_SCHEMA}\` program`,
        content: { "application/json": { schema: meetProgramSchema } },
      },
      ...authErrors,
      404: errorResponse("No such meet on this team"),
    },
  }),
  async (c) => {
    const { teamId, meetId } = c.req.valid("param");
    const program = await getMeetProgram({
      userId: c.get("user").id,
      teamId,
      meetId,
    });
    return c.json(program, 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/{teamId}/hosted-meets",
    summary: "Meets this team has published results for",
    operationId: "listHostedMeets",
    tags: ["Results"],
    security: bearer,
    middleware: [rateLimit("user")] as const,
    request: { params: teamParamsSchema },
    responses: {
      200: {
        description: "Hosted meets, newest first",
        content: {
          "application/json": { schema: hostedMeetsResponseSchema },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid("param");
    const meets = await listHostedMeets({ userId: c.get("user").id, teamId });
    return c.json({ meets }, 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/{teamId}/hosted-meets/{meetId}/heats",
    summary: "Publish a verified heat",
    operationId: "publishHeat",
    description:
      "Send the same `Idempotency-Key` on retries. Re-sending a revision is a no-op; a corrected heat is a new revision and replaces the old one. `409` means a newer revision is already stored, so the sender can stop retrying.",
    tags: ["Results"],
    security: bearer,
    middleware: [rateLimit("publish")] as const,
    request: {
      params: teamMeetParamsSchema,
      headers: idempotencyHeadersSchema,
      body: {
        required: true,
        content: { "application/json": { schema: HeatPublication } },
      },
    },
    responses: {
      200: {
        description: "Updated to this revision, or already had it",
        content: { "application/json": { schema: publishResultSchema } },
      },
      201: {
        description: "First revision of this heat",
        content: { "application/json": { schema: publishResultSchema } },
      },
      400: errorResponse("Invalid publication"),
      ...authErrors,
      409: errorResponse("A newer revision of this heat is already stored"),
    },
  }),
  async (c) => {
    const { teamId, meetId } = c.req.valid("param");
    const status = await publishHeat({
      userId: c.get("user").id,
      teamId,
      meetId,
      idempotencyKey: c.req.valid("header")["idempotency-key"],
      publication: c.req.valid("json"),
      audit: auditContext(c),
    });
    if (status === "stale") {
      return c.json(
        {
          error: {
            code: "stale_revision",
            message: "A newer revision of this heat is already published.",
          },
        },
        409,
      );
    }
    return c.json({ status }, status === "created" ? 201 : 200);
  },
);

export { app as teamsRouter };
