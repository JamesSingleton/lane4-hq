import type { EventName, EventProperties } from "@lane4hq/analytics";
import { getServerAnalytics } from "@lane4hq/analytics/server";

function environment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function release(): string {
  return (
    process.env.NEXT_PUBLIC_LANE4_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev"
  );
}

function client() {
  return getServerAnalytics({
    app: "admin",
    internal: true,
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST,
    environment: environment(),
    release: release(),
  });
}

/** Fire-and-forget. Analytics must not change the action's result. */
export function trackAdmin<E extends EventName>(
  event: E,
  userId: string | undefined,
  teamId: string | undefined,
  properties?: EventProperties[E],
): void {
  void client()
    .then((analytics) => {
      if (userId) analytics.identify(userId);
      if (teamId) analytics.group(teamId);
      analytics.capture(event, properties);
    })
    .catch(() => undefined);
}

export async function reportServerException(
  error: unknown,
  route: string,
): Promise<void> {
  try {
    const analytics = await client();
    analytics.exception(error, { source: "server", route });
  } catch {
    // A reporting failure must not replace the original error.
  }
}
