import { z } from "@hono/zod-openapi";

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "forbidden" }),
      message: z.string().openapi({ example: "Not allowed for this team." }),
    }),
  })
  .openapi("Error");

/** OpenAPI response entry for an error status. */
export function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorResponseSchema } },
  };
}

export const tooManyRequests = {
  429: errorResponse("Too many requests; see `Retry-After`"),
};

export const authErrors = {
  401: errorResponse("Not signed in"),
  403: errorResponse("Not allowed for this team"),
  ...tooManyRequests,
};

export const bearer = [{ bearerAuth: [] }];
