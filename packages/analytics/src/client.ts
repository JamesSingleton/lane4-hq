import type { EventName, EventProperties } from "./catalog";
import type { AnalyticsContext } from "./context";
import { contextProperties } from "./context";
import {
  pagePath,
  prepareCapture,
  redactException,
  safeDistinctId,
  sanitizeException,
  sanitizeProperties,
} from "./privacy";

export type AnalyticsTransport = {
  capture(event: string, properties: Record<string, unknown>): void;
  identify(distinctId: string): void;
  group(groupKey: string): void;
  exception?(
    error: Error,
    properties: Record<string, unknown>,
    distinctId?: string,
  ): void;
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
      const reported = redactException(error);
      const distinctId = safeDistinctId(
        typeof properties?.distinct_id === "string"
          ? properties.distinct_id
          : undefined,
      );
      const payload = {
        ...base,
        $exception_type: reported.name,
        ...sanitizeException(properties),
      };
      if (client.exception) {
        client.exception(reported, payload, distinctId ?? undefined);
      } else send("$exception", payload);
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
