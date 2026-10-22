import { staffAuth } from "@lane4hq/auth/staff-server";
import { toNextJsHandler } from "better-auth/next-js";

/** Staff sessions only. Coach accounts sign in on the admin app. */

const handler = toNextJsHandler(staffAuth);

export const GET = handler.GET;
export const POST = handler.POST;
