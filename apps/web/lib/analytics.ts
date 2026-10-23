import type { Analytics, EventName, EventProperties } from "@lane4hq/analytics";
import { exceptionReason } from "@lane4hq/analytics";
import { getServerAnalytics } from "@lane4hq/analytics/server";

export type WebAnalyticsApp = "web" | "admin";

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

export function serverAnalytics(app: WebAnalyticsApp): Promise<Analytics> {
  return getServerAnalytics({
    app,
    internal: app === "admin",
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST,
    environment: environment(),
    release: release(),
  });
}

/** Fire-and-forget. Analytics must not change the action's result. */
export function trackProduct<E extends EventName>(
  app: WebAnalyticsApp,
  event: E,
  userId: string | undefined,
  teamId: string | undefined,
  properties?: EventProperties[E],
): void {
  void serverAnalytics(app)
    .then((analytics) => {
      if (userId) analytics.identify(userId);
      if (teamId) analytics.group(teamId);
      analytics.capture(event, properties);
    })
    .catch(() => undefined);
}

/** PostHog's browser distinct id, so a server exception joins the session. */
export function posthogDistinctId(
  cookie: string | string[] | undefined,
): string | undefined {
  const cookieString = Array.isArray(cookie) ? cookie.join("; ") : cookie;
  if (!cookieString) return undefined;
  const match = /ph_phc_[^=]*_posthog=([^;]+)/.exec(cookieString);
  if (!match?.[1]) return undefined;
  try {
    const data = JSON.parse(decodeURIComponent(match[1])) as {
      distinct_id?: unknown;
    };
    return typeof data.distinct_id === "string" ? data.distinct_id : undefined;
  } catch {
    return undefined;
  }
}

export async function reportServerException(
  app: WebAnalyticsApp,
  error: unknown,
  route: string,
  distinctId?: string,
): Promise<void> {
  try {
    const analytics = await serverAnalytics(app);
    const reason = exceptionReason(error);
    analytics.exception(error, {
      source: "server",
      route,
      distinct_id: distinctId,
      ...(reason ? { reason } : {}),
    });
  } catch {
    // A reporting failure must not replace the original error.
  }
}
