import type { EventName, EventProperties } from "./catalog";
import type { AnalyticsContext } from "./context";
import { contextProperties } from "./context";
import {
  pagePath,
  prepareCapture,
  safeDistinctId,
  sanitizeException,
  sanitizeProperties,
} from "./privacy";

export type AnalyticsTransport = {
  capture(event: string, properties: Record<string, unknown>): void;
  identify(distinctId: string): void;
  group(groupKey: string): void;
  exception?(name: string, properties: Record<string, unknown>): void;
  isFeatureEnabled(flag: string): boolean | undefined;
  getFeatureFlag(flag: string): string | boolean | undefined;
  shutdown(): Promise<void>;
};

export type Analytics = {
  readonly enabled: boolean;
  capture<E extends EventName>(event: E, properties?: EventProperties[E]): void;
  identify(userId: string): void;
  /** Group the current user by team id. The team name is not sent. */
  group(teamId: string): void;
  pageview(url: string): void;
  exception(error: unknown, properties?: Record<string, unknown>): void;
  isFeatureEnabled(flag: string): boolean | undefined;
  getFeatureFlag(flag: string): string | boolean | undefined;
  shutdown(): Promise<void>;
};

function exceptionName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "Error";
}

export function createAnalytics(
  context: AnalyticsContext,
  transport: AnalyticsTransport | null,
): Analytics {
  const base = contextProperties(context);
  if (!transport) {
    return {
      enabled: false,
      capture() {},
      identify() {},
      group() {},
      pageview() {},
      exception() {},
      isFeatureEnabled() {
        return undefined;
      },
      getFeatureFlag() {
        return undefined;
      },
      shutdown() {
        return Promise.resolve();
      },
    };
  }

  const client = transport;
  function send(event: string, properties: Record<string, unknown>) {
    const prepared = prepareCapture({ properties: { ...base, ...properties } });
    client.capture(event, prepared.properties as Record<string, unknown>);
  }

  return {
    enabled: true,
    capture(event, properties) {
      send(
        event,
        sanitizeProperties(
          event,
          properties as Record<string, unknown> | undefined,
        ),
      );
    },
    identify(userId) {
      const id = safeDistinctId(userId);
      if (id) client.identify(id);
    },
    group(teamId) {
      const id = safeDistinctId(teamId);
      if (id) client.group(id);
    },
    pageview(url) {
      send("$pageview", { $current_url: pagePath(url) });
    },
    exception(error, properties) {
      const name = exceptionName(error);
      const payload = {
        ...base,
        $exception_type: name,
        ...sanitizeException(properties),
      };
      if (client.exception) client.exception(name, payload);
      else send("$exception", payload);
    },
    isFeatureEnabled(flag) {
      return client.isFeatureEnabled(flag);
    },
    getFeatureFlag(flag) {
      return client.getFeatureFlag(flag);
    },
    shutdown() {
      return client.shutdown();
    },
  };
}
