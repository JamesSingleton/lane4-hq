import { after } from "next/server";
import { posthogDistinctId, reportServerException } from "@/app/analytics";
import {
  createPosthogLogger,
  logRequestError,
  registerPosthogLogs,
} from "@/app/posthog-logs";

const posthogLogs = createPosthogLogger("lane4-admin");

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
