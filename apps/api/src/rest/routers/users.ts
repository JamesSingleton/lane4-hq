import { teamsForUser } from "@api/operations/teams";
import { rateLimit } from "@api/rest/middleware";
import type { AppEnv } from "@api/rest/types";
import { authErrors, bearer, tooManyRequests } from "@api/schemas/errors";
import { meResponseSchema } from "@api/schemas/users";
import { validationHook } from "@api/utils/validation";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

app.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "The signed-in user and their teams",
    operationId: "getMe",
    tags: ["Account"],
    security: bearer,
    middleware: [rateLimit("user")] as const,
    responses: {
      200: {
        description: "The user and every team they belong to",
        content: { "application/json": { schema: meResponseSchema } },
      },
      401: authErrors[401],
      ...tooManyRequests,
    },
  }),
  async (c) => {
    const user = c.get("user");
    return c.json({ user, teams: await teamsForUser(user.id) }, 200);
  },
);

export { app as meRouter };
