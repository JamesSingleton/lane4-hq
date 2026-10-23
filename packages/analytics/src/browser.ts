import type { AnalyticsApp } from "./catalog";
import {
  type Analytics,
  type AnalyticsTransport,
  createAnalytics,
} from "./client";
import { analyticsContext, posthogHosts } from "./context";
import { prepareCapture } from "./privacy";

export type PostHogBrowser = {
  init(key: string, options: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string): void;
  group(type: string, key: string): void;
  isFeatureEnabled(flag: string): boolean | undefined;
  getFeatureFlag(flag: string): string | boolean | undefined;
  captureException?(error: unknown, properties?: Record<string, unknown>): void;
};

type QueueItem = { event: string; properties: Record<string, unknown> };

type QueueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const QUEUE_KEY = "lane4.analytics.queue";
const QUEUE_LIMIT = 50;

export type BrowserAnalyticsOptions = {
  app: AnalyticsApp;
  key?: string | null;
  host?: string | null;
  /** Proxy path. Next apps use `/ingest`. */
  apiHost?: string | null;
  environment?: string;
  release?: string;
  internal?: boolean;
  replay?: boolean;
  offlineQueue?: boolean;
  posthog?: PostHogBrowser;
  loadPosthog?: () => Promise<PostHogBrowser>;
  storage?: QueueStorage | null;
  online?: () => boolean;
  subscribeOnline?: (listener: () => void) => () => void;
  /** Fires after the SDK is ready. Feature flags are readable from here. */
  onReady?: () => void;
};

export function browserInitOptions(input: {
  apiHost: string;
  uiHost: string;
  replay: boolean;
}): Record<string, unknown> {
  return {
    api_host: input.apiHost,
    ui_host: input.uiHost,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: !input.replay,
    session_recording: input.replay
      ? {
          maskAllInputs: true,
          maskTextSelector: "*",
          // Remote canvas quality can arrive above 1 and the SDK warns while clamping it.
          captureCanvas: {
            recordCanvas: false,
            canvasFps: 4,
            canvasQuality: 0.4,
          },
        }
      : undefined,
    person_profiles: "identified_only",
    persistence: "localStorage",
    // Scroll ratios above 1 make the SDK warn on the next pageview. We do not use scroll depth.
    disable_scroll_properties: true,
    // React error boundaries and our window listeners call captureException.
    // Leaving this on would also send the original error message.
    capture_exceptions: false,
    before_send(
      event: { properties?: Record<string, unknown> } | null,
    ): { properties?: Record<string, unknown> } | null {
      if (!event) return null;
      return prepareCapture(event);
    },
  };
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as { event?: unknown; properties?: unknown };
  return (
    typeof item.event === "string" &&
    !!item.properties &&
    typeof item.properties === "object"
  );
}

export function readQueue(raw: string | null): QueueItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: QueueItem[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (isQueueItem(parsed[i])) items.push(parsed[i] as QueueItem);
    }
    return items;
  } catch {
    return [];
  }
}

function writeQueue(storage: QueueStorage | null, items: QueueItem[]) {
  const trimmed = items.slice(Math.max(0, items.length - QUEUE_LIMIT));
  if (!storage) return trimmed;
  try {
    if (trimmed.length === 0) storage.removeItem(QUEUE_KEY);
    else storage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    return trimmed;
  }
  return trimmed;
}

export async function loadPosthogBrowser(): Promise<PostHogBrowser> {
  const mod = await import("posthog-js");
  return mod.default as unknown as PostHogBrowser;
}

export function initBrowserAnalytics(
  options: BrowserAnalyticsOptions,
): Analytics {
  const key = options.key?.trim();
  const context = analyticsContext({
    app: options.app,
    environment: options.environment,
    release: options.release,
    internal: options.internal,
  });
  if (!key) return createAnalytics(context, null);

  const hosts = posthogHosts(options.host);
  const posthogPromise = options.posthog
    ? Promise.resolve(options.posthog)
    : (options.loadPosthog ?? loadPosthogBrowser)();

  let sdk: PostHogBrowser | null = options.posthog ?? null;
  let stored: string | null = null;
  if (options.storage) {
    try {
      stored = options.storage.getItem(QUEUE_KEY);
    } catch {
      stored = null;
    }
  }
  let memory: QueueItem[] = readQueue(stored);
  const online = options.online ?? (() => true);

  function persist(items: QueueItem[]) {
    memory = writeQueue(options.storage ?? null, items);
  }

  function flush(client: PostHogBrowser) {
    if (!online()) return;
    const pending = memory.slice();
    persist([]);
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]!;
      const prepared = prepareCapture({ properties: item.properties });
      client.capture(item.event, prepared.properties);
    }
  }

  void posthogPromise
    .then((client) => {
      sdk = client;
      if (!options.posthog) {
        client.init(
          key,
          browserInitOptions({
            apiHost: options.apiHost?.trim() || hosts.ingest,
            uiHost: hosts.ui,
            replay: options.replay ?? options.app !== "desktop",
          }),
        );
      }
      flush(client);
      if (options.onReady) options.onReady();
    })
    .catch(() => {
      sdk = null;
    });

  if (options.offlineQueue && options.subscribeOnline) {
    options.subscribeOnline(() => {
      if (sdk) flush(sdk);
    });
  }

  const transport: AnalyticsTransport = {
    capture(event, properties) {
      if (options.offlineQueue && !online()) {
        persist(memory.concat([{ event, properties }]));
        return;
      }
      if (!sdk) {
        if (options.offlineQueue) {
          persist(memory.concat([{ event, properties }]));
        }
        return;
      }
      sdk.capture(event, properties);
    },
    identify(distinctId) {
      if (sdk) sdk.identify(distinctId);
    },
    group(groupKey) {
      if (sdk) sdk.group("team", groupKey);
    },
    exception(error, properties) {
      if (!sdk) return;
      if (sdk.captureException) sdk.captureException(error, properties);
      else sdk.capture("$exception", properties);
    },
    isFeatureEnabled(flag) {
      if (!sdk) return undefined;
      return sdk.isFeatureEnabled(flag);
    },
    getFeatureFlag(flag) {
      if (!sdk) return undefined;
      return sdk.getFeatureFlag(flag);
    },
    shutdown() {
      return Promise.resolve();
    },
  };

  return createAnalytics(context, transport);
}
