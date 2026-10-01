import { protectedMiddleware, publicMiddleware } from "@api/rest/middleware";
import type { AppEnv } from "@api/rest/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { desktopRouter } from "./desktop";
import { hostedMeetsRouter } from "./hosted-meets";
import { teamsRouter } from "./teams";
import { meRouter } from "./users";

const routers = new OpenAPIHono<AppEnv>();

routers.use(...publicMiddleware);

// Public routes first: they answer before the protected middleware runs.
routers.route("/hosted-meets", hostedMeetsRouter);
routers.route("/desktop", desktopRouter);

// Everything mounted below needs a signed-in user.
routers.use(...protectedMiddleware);

routers.route("/me", meRouter);
routers.route("/teams", teamsRouter);

export { routers };
