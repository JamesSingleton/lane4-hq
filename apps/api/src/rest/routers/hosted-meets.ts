import { getMeetResults } from "@api/operations/hosted-meets";
import type { AppEnv } from "@api/rest/types";
import { errorResponse, tooManyRequests } from "@api/schemas/errors";
import {
  hostedMeetParamsSchema,
  meetResultsSchema,
} from "@api/schemas/hosted-meets";
import { validationHook } from "@api/utils/validation";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

/** Public: anyone can follow a meet's results. */
const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

app.openapi(
  createRoute({
    method: "get",
    path: "/{meetId}/results",
    summary: "Live results for a hosted meet",
    operationId: "getMeetResults",
    description:
      "Public. Every heat published so far, in meet order, without birthdays or member ids.",
    tags: ["Results"],
    request: { params: hostedMeetParamsSchema },
    responses: {
      200: {
        description: "Published heats",
        content: { "application/json": { schema: meetResultsSchema } },
      },
      404: errorResponse("Nothing published for this meet"),
      ...tooManyRequests,
    },
  }),
  async (c) => {
    const { meetId } = c.req.valid("param");
    return c.json(await getMeetResults(meetId), 200);
  },
);

export { app as hostedMeetsRouter };
