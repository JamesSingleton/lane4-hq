import {
  type Analytics,
  analyticsContext,
  createAnalytics,
  errorCode,
  formatCode,
} from "@lane4hq/analytics";
import {
  type BrowserAnalyticsOptions,
  initBrowserAnalytics,
} from "@lane4hq/analytics/browser";

type DesktopEnv = {
  key?: string;
  host?: string;
  environment?: string;
  release?: string;
};

let current: Analytics = createAnalytics(
  analyticsContext({ app: "desktop" }),
  null,
);
let stopObservers: Array<() => void> = [];

function clearObservers() {
  for (let i = 0; i < stopObservers.length; i++) stopObservers[i]!();
  stopObservers = [];
}

export function desktopAnalytics(): Analytics {
  return current;
}

function readViteEnv(): DesktopEnv {
  const env = (
    import.meta as {
      env?: {
        VITE_POSTHOG_PROJECT_TOKEN?: string;
        VITE_POSTHOG_HOST?: string;
        VITE_LANE4_RELEASE?: string;
        MODE?: string;
      };
    }
  ).env;
  return {
    key: env?.VITE_POSTHOG_PROJECT_TOKEN,
    host: env?.VITE_POSTHOG_HOST,
    environment: env?.MODE,
    release: env?.VITE_LANE4_RELEASE,
  };
}

export function startDesktopAnalytics(
  overrides: Partial<BrowserAnalyticsOptions> & DesktopEnv = {},
): Analytics {
  clearObservers();
  const env = readViteEnv();
  const target = typeof window === "undefined" ? undefined : window;
  current = initBrowserAnalytics({
    app: "desktop",
    key: overrides.key ?? env.key,
    host: overrides.host ?? env.host,
    environment: overrides.environment ?? env.environment,
    release: overrides.release ?? env.release ?? "dev",
    replay: false,
    offlineQueue: true,
    // Node's test runtime exposes `navigator` without `onLine`. Only a
    // browser that reports itself offline should hold the queue.
    online: () =>
      typeof navigator === "undefined" || navigator.onLine !== false,
    subscribeOnline: target
      ? (listener) => {
          const onOnline = () => listener();
          target.addEventListener("online", onOnline);
          const stop = () => target.removeEventListener("online", onOnline);
          stopObservers.push(stop);
          return stop;
        }
      : undefined,
    ...overrides,
  });
  const stopErrors = listenForWindowErrors(current, target);
  if (stopErrors) stopObservers.push(stopErrors);
  listenForNativeExceptions(current, target);
  return current;
}

/** Format only. The filename can contain a meet or swimmer name. */
export function trackExport(
  filename: string,
  ok: boolean,
  error?: unknown,
): void {
  const format = formatCode(filename);
  if (ok) current.capture("entries_exported", { format });
  else {
    current.capture("export_failed", {
      format,
      error_code: errorCode(error),
    });
  }
}

export function trackResultsImported(
  filename: string | undefined,
  resultCount: number,
): void {
  if (resultCount <= 0) return;
  current.capture("results_imported", { format: formatCode(filename) });
}

export function trackImportFailed(
  filename: string | undefined,
  error: unknown,
): void {
  current.capture("import_failed", {
    format: formatCode(filename),
    error_code: errorCode(error),
  });
}

export function trackMeetCreated(): void {
  current.capture("meet_created");
}

export function desktopFlag(flag: string): boolean | undefined {
  return current.isFeatureEnabled(flag);
}

function listenForWindowErrors(
  analytics: Analytics,
  target: Window | undefined,
): (() => void) | undefined {
  if (!target) return undefined;
  const onError = (event: { error?: unknown }) => {
    analytics.exception(event.error ?? new Error("Error"), {
      source: "client",
    });
  };
  const onRejection = (event: { reason?: unknown }) => {
    analytics.exception(event.reason, { source: "client" });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

function listenForNativeExceptions(
  analytics: Analytics,
  target: Window | undefined,
) {
  if (!target || !("__TAURI_INTERNALS__" in target)) return;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => {
      void listen("analytics-exception", (event) => {
        const payload = event.payload;
        if (!payload || typeof payload !== "object") {
          analytics.exception(new Error("Error"), { source: "panic" });
          return;
        }
        const record = payload as Record<string, unknown>;
        analytics.exception(new Error("Error"), {
          source: record.source,
          file: record.file,
          line: record.line,
          code: record.code,
        });
      });
    })
    .catch(() => undefined);
}
