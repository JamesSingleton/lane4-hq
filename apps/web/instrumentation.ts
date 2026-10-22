import { after } from "next/server";
import { posthogDistinctId, reportServerException } from "@/lib/analytics";
import {
  createPosthogLogger,
  logRequestError,
  registerPosthogLogs,
} from "@/lib/posthog-logs";

const posthogLogs = createPosthogLogger("lane4-web");

export function register(): void {
  registerPosthogLogs(posthogLogs);
}

export async function onRequestError(
  error: unknown,
  request: {
    path: string;
    method: string;
    headers: { cookie?: string | string[] };
  },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const errorName = error instanceof Error && error.name ? error.name : "Error";
  await reportServerException(
    "web",
    error,
    request.path,
    posthogDistinctId(request.headers.cookie),
  );
  logRequestError(posthogLogs, {
    route: request.path,
    method: request.method,
    errorName,
  });
  if (!posthogLogs) return;
  after(async () => {
    await posthogLogs.provider.forceFlush();
  });
}
