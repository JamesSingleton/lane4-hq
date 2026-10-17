import type { AppEnv } from "@api/rest/types";
import { errorBody } from "@api/utils/errors";
import type { Hook } from "@hono/zod-openapi";

/** Request validation failures, in the API's error shape. */
export const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (result.success) return;
  const message = result.error.issues
    .slice(0, 5)
    .map((i) =>
      i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
    )
    .join("; ");
  return c.json(errorBody("invalid_request", message), 400);
};
