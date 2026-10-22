import {
  type Analytics,
  analyticsContext,
  createAnalytics,
} from "@lane4hq/analytics";
import { initBrowserAnalytics } from "@lane4hq/analytics/browser";

let current: Analytics | null = null;
let ready = false;
let waiters: Array<() => void> = [];

function markReady() {
  ready = true;
  const pending = waiters;
  waiters = [];
  for (let i = 0; i < pending.length; i++) pending[i]!();
}

function context() {
  return analyticsContext({
    app: "admin",
    environment: process.env.NEXT_PUBLIC_LANE4_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_LANE4_RELEASE,
    internal: true,
  });
}

/** Starts once. `instrumentation-client.ts` calls this before hydration. */
export function browserAnalytics(): Analytics {
  if (current) return current;
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    current = createAnalytics(context(), null);
    if (typeof window !== "undefined") markReady();
    return current;
  }
  current = initBrowserAnalytics({
    app: "admin",
    key: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    apiHost: "/ingest",
    environment: process.env.NEXT_PUBLIC_LANE4_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_LANE4_RELEASE,
    internal: true,
    replay: true,
    offlineQueue: true,
    online: () => true,
    onReady: markReady,
  });
  return current;
}

export function subscribeAnalyticsReady(listener: () => void): () => void {
  if (ready || typeof window === "undefined") {
    listener();
    return () => undefined;
  }
  waiters.push(listener);
  return () => {
    const next: Array<() => void> = [];
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i] !== listener) next.push(waiters[i]!);
    }
    waiters = next;
  };
}
