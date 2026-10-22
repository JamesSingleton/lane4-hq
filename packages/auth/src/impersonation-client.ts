import type { BetterAuthClientPlugin } from "better-auth/client";
import type { impersonation } from "./impersonation-plugin";

/** Client methods for the server impersonation plugin. Types only; the server plugin stays out of the browser bundle. */
export function impersonationClient() {
  return {
    id: "impersonation",
    $InferServerPlugin: {} as ReturnType<typeof impersonation>,
  } satisfies BetterAuthClientPlugin;
}
