import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Not served by @hono/node-server (tests call `app.request`).
    return undefined;
  }
}

/** Railway's proxy sets `X-Real-IP`; then the first forwarded hop, then the
 * socket when nothing sits in front of the server. */
export function getClientIp(c: Context): string {
  return (
    c.req.header("x-real-ip")?.trim() ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    socketAddress(c) ||
    "unknown"
  );
}
