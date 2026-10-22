import { PostHog } from "posthog-node";
import type { AnalyticsApp } from "./catalog";
import {
  type Analytics,
  type AnalyticsTransport,
  createAnalytics,
} from "./client";
import { analyticsContext, posthogHosts } from "./context";
import { redactException } from "./privacy";

export type ServerPostHog = {
  capture(args: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): void;
  identify(args: { distinctId: string }): void;
  groupIdentify(args: { groupType: string; groupKey: string }): void;
  captureException(
    error: unknown,
    distinctId?: string,
    properties?: Record<string, unknown>,
  ): void;
  isFeatureEnabled(
    key: string,
    distinctId: string,
  ): Promise<boolean | undefined>;
  getFeatureFlag(
    key: string,
    distinctId: string,
  ): Promise<string | boolean | undefined>;
  shutdown(): Promise<void>;
};

export type ServerAnalyticsOptions = {
  app: AnalyticsApp;
  apiKey?: string | null;
  host?: string | null;
  environment?: string;
  release?: string;
  internal?: boolean;
  load?: (apiKey: string, host: string) => Promise<ServerPostHog | null>;
};

const ANONYMOUS = "anonymous";
const clients = new Map<string, Promise<Analytics>>();

export function loadPosthogServer(
  apiKey: string,
  host: string,
): Promise<ServerPostHog> {
  const client = new PostHog(apiKey, { host, flushInterval: 5000 });
  return Promise.resolve({
    capture: (args) => client.capture(args),
    identify: (args) => client.identify(args),
    groupIdentify: (args) => client.groupIdentify(args),
    captureException: (error, distinctId, properties) =>
      client.captureException(redactException(error), distinctId, properties),
    isFeatureEnabled: (key, distinctId) =>
      client.isFeatureEnabled(key, distinctId),
    getFeatureFlag: (key, distinctId) =>
      client.getFeatureFlag(key, distinctId) as Promise<
        string | boolean | undefined
      >,
    shutdown: () => client._shutdown(),
  });
}

export function resetServerAnalyticsForTests(): void {
  clients.clear();
}

export function getServerAnalytics(
  options: ServerAnalyticsOptions,
): Promise<Analytics> {
  const cached = clients.get(options.app);
  if (cached && !options.load) return cached;
  const created = initServerAnalytics(options);
  if (!options.load) clients.set(options.app, created);
  return created;
}

export async function initServerAnalytics(
  options: ServerAnalyticsOptions,
): Promise<Analytics> {
  const context = analyticsContext({
    app: options.app,
    environment: options.environment,
    release: options.release,
    internal: options.internal,
  });
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return createAnalytics(context, null);

  const host = posthogHosts(options.host).ingest;
  let sdk: ServerPostHog | null = null;
  try {
    sdk = await (options.load ?? loadPosthogServer)(apiKey, host);
  } catch {
    sdk = null;
  }
  if (!sdk) return createAnalytics(context, null);
  const client = sdk;

  let distinctId = ANONYMOUS;
  const flagCache = new Map<string, string | boolean | undefined>();

  const transport: AnalyticsTransport = {
    capture(event, properties) {
      client.capture({ distinctId, event, properties });
    },
    identify(id) {
      distinctId = id;
      client.identify({ distinctId: id });
    },
    group(groupKey) {
      client.groupIdentify({ groupType: "team", groupKey });
    },
    exception(error, properties, reportedDistinctId) {
      client.captureException(
        error,
        reportedDistinctId ?? distinctId,
        properties,
      );
    },
    isFeatureEnabled(flag) {
      const cachedFlag = flagCache.get(flag);
      if (typeof cachedFlag === "boolean") return cachedFlag;
      void client.isFeatureEnabled(flag, distinctId).then(
        (value) => {
          flagCache.set(flag, value);
        },
        () => {
          flagCache.set(flag, undefined);
        },
      );
      return undefined;
    },
    getFeatureFlag(flag) {
      if (flagCache.has(flag)) return flagCache.get(flag);
      void client.getFeatureFlag(flag, distinctId).then(
        (value) => {
          flagCache.set(flag, value);
        },
        () => {
          flagCache.set(flag, undefined);
        },
      );
      return undefined;
    },
    shutdown() {
      return client.shutdown();
    },
  };

  return createAnalytics(context, transport);
}
