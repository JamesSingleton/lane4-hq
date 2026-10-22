import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  browserInitOptions,
  initBrowserAnalytics,
  loadPosthogBrowser,
  type PostHogBrowser,
  readQueue,
} from "../src/browser";
import {
  type AnalyticsTransport,
  analyticsContext,
  contextProperties,
  createAnalytics,
  errorCode,
  formatCode,
  ingestRewrites,
  isAnalyticsApp,
  isForbiddenKey,
  pagePath,
  posthogHosts,
  prepareCapture,
  safeDistinctId,
  sanitizeException,
  sanitizeProperties,
} from "../src/index";
import { otlpLogsBody, sendOtlpLogs } from "../src/logs";
import {
  getServerAnalytics,
  initServerAnalytics,
  loadPosthogServer,
  resetServerAnalyticsForTests,
  type ServerPostHog,
} from "../src/server";

const browserSdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  isFeatureEnabled: vi.fn(() => true as boolean | undefined),
  getFeatureFlag: vi.fn(() => "on" as string | boolean | undefined),
  captureException: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    key: string;
    options: unknown;
    capture: ReturnType<typeof vi.fn>;
    identify: ReturnType<typeof vi.fn>;
    groupIdentify: ReturnType<typeof vi.fn>;
    captureException: ReturnType<typeof vi.fn>;
    isFeatureEnabled: ReturnType<typeof vi.fn>;
    getFeatureFlag: ReturnType<typeof vi.fn>;
    _shutdown: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("posthog-js", () => ({ default: browserSdk }));

vi.mock("posthog-node", () => {
  class PostHog {
    capture = vi.fn();
    identify = vi.fn();
    groupIdentify = vi.fn();
    captureException = vi.fn();
    isFeatureEnabled = vi.fn(async () => true);
    getFeatureFlag = vi.fn(async () => "variant" as string | boolean);
    _shutdown = vi.fn(async () => undefined);
    constructor(
      public key: string,
      public options: unknown,
    ) {
      serverMocks.instances.push(this);
    }
  }
  return { PostHog };
});

function transport(): AnalyticsTransport & {
  events: Array<{ event: string; properties: Record<string, unknown> }>;
  ids: string[];
  groups: string[];
  exceptions: Array<{ name: string; properties: Record<string, unknown> }>;
} {
  const events: Array<{ event: string; properties: Record<string, unknown> }> =
    [];
  const ids: string[] = [];
  const groups: string[] = [];
  const exceptions: Array<{
    name: string;
    properties: Record<string, unknown>;
  }> = [];
  return {
    events,
    ids,
    groups,
    exceptions,
    capture(event, properties) {
      events.push({ event, properties });
    },
    identify(id) {
      ids.push(id);
    },
    group(id) {
      groups.push(id);
    },
    exception(name, properties) {
      exceptions.push({ name, properties });
    },
    isFeatureEnabled: () => true,
    getFeatureFlag: () => "blue",
    shutdown: async () => undefined,
  };
}

describe("privacy", () => {
  it("blocks athlete and contact keys", () => {
    expect(isForbiddenKey("email")).toBe(true);
    expect(isForbiddenKey("swimmer_name")).toBe(true);
    expect(isForbiddenKey("seed-time")).toBe(true);
    expect(isForbiddenKey("dateOfBirth")).toBe(true);
    expect(isForbiddenKey("usaSwimmingId")).toBe(true);
    expect(isForbiddenKey("format")).toBe(false);
  });

  it("keeps only an allowlisted format token", () => {
    expect(formatCode(null)).toBe("unknown");
    expect(formatCode(undefined)).toBe("unknown");
    expect(formatCode("  ")).toBe("unknown");
    expect(formatCode("/")).toBe("unknown");
    expect(formatCode("meet.")).toBe("unknown");
    expect(formatCode("notes.txt")).toBe("unknown");
    expect(formatCode("HY3")).toBe("hy3");
    expect(formatCode(".PDF")).toBe("pdf");
    expect(formatCode("C:\\meets\\Relay.CL2")).toBe("cl2");
    expect(formatCode("/tmp/pack.ZIP")).toBe("zip");
  });

  it("maps failures to a short code and drops the message", () => {
    expect(errorCode("validation")).toBe("validation");
    expect(errorCode("coach typed a name")).toBe("internal");
    expect(errorCode({ code: "not_found" })).toBe("not_found");
    expect(errorCode({ code: "nope" })).toBe("internal");
    expect(errorCode({ other: true })).toBe("internal");
    expect(errorCode(null)).toBe("internal");
    expect(errorCode(12)).toBe("internal");
    expect(errorCode(new Error("Unauthorized token"))).toBe("unauthorized");
    expect(errorCode(new Error("Forbidden"))).toBe("forbidden");
    expect(errorCode(new Error("Not permitted"))).toBe("forbidden");
    expect(errorCode(new Error("Meet not found"))).toBe("not_found");
    expect(errorCode(new Error("Unsupported file"))).toBe("unsupported");
    expect(errorCode(new Error("No valid swimmers"))).toBe("validation");
    expect(errorCode(new Error("Name required"))).toBe("validation");
    expect(errorCode(new Error("Select a meet"))).toBe("validation");
    const coded = new Error("Sam swam 1:02.3");
    Object.assign(coded, { code: "unsupported" });
    expect(errorCode(coded)).toBe("unsupported");
    expect(errorCode(new Error("something else"))).toBe("internal");
  });

  it("drops unknown, forbidden, and email-like properties", () => {
    expect(sanitizeProperties("signed_up", undefined)).toEqual({});
    expect(
      sanitizeProperties("entries_exported", {
        format: "Meet.HY3",
        name: "Ada",
        email: "ada@example.com",
        extra: "no",
      }),
    ).toEqual({ format: "hy3" });
    expect(
      sanitizeProperties("export_failed", {
        format: 1,
        error_code: true,
      }),
    ).toEqual({ format: 1, error_code: true });
    expect(
      sanitizeProperties("docs_search", {
        query: "  starts  ",
      }).query,
    ).toBe("starts");
    expect(sanitizeProperties("docs_search", { query: "a@b.com" })).toEqual({});
    expect(sanitizeProperties("docs_search", { query: "   " })).toEqual({});
    expect(sanitizeProperties("docs_search", { query: true })).toEqual({
      query: true,
    });
    expect(
      sanitizeProperties("roster_imported", { format: undefined }),
    ).toEqual({});
    expect(sanitizeProperties("docs_search", { query: { raw: true } })).toEqual(
      {},
    );
    const long = "q".repeat(250);
    expect(
      String(sanitizeProperties("docs_search", { query: long }).query),
    ).toHaveLength(200);
    expect(
      sanitizeProperties("import_failed", {
        format: "sd3",
        error_code: "not a code",
      }),
    ).toEqual({ format: "sd3", error_code: "internal" });
  });

  it("keeps a path and a safe exception shape", () => {
    expect(pagePath("  ")).toBe("/");
    expect(pagePath("https://lane4hq.com/pricing?email=a@b.com#x")).toBe(
      "/pricing",
    );
    expect(pagePath("/team/1?meet=Ada")).toBe("/team/1");
    expect(pagePath("http://[")).toBe("/");
    expect(sanitizeException(undefined)).toEqual({});
    expect(
      sanitizeException({
        route: "/v1/meets?swimmer=Ada",
        status: 500,
        line: 12,
        source: "server",
        file: "C:\\src\\export_file.rs",
        code: "export_write_failed",
        name: "Ada",
        statusText: "no",
      }),
    ).toEqual({
      route: "/v1/meets",
      status: 500,
      line: 12,
      source: "server",
      file: "export_file.rs",
      code: "export_write_failed",
    });
    expect(
      sanitizeException({
        status: Number.NaN,
        line: "12",
        source: "browser",
        file: "a@b.com",
        code: "leaked",
        route: 4,
      }),
    ).toEqual({});
    expect(sanitizeException({ file: "/" })).toEqual({});
    expect(sanitizeException({ source: "panic" }).source).toBe("panic");
    expect(sanitizeException({ source: "command" }).source).toBe("command");
    expect(sanitizeException({ source: "client" }).source).toBe("client");
    expect(sanitizeException({ status: 0 }).status).toBe(0);
  });

  it("strips autocapture text", () => {
    expect(prepareCapture({})).toEqual({});
    expect(
      prepareCapture({
        properties: {
          app: "web",
          $el_text: "Ada Sharkey",
          $elements: [],
          $elements_chain: "div",
          email: "a@b.com",
          note: "coach@example.com",
          keep: 1,
        },
      }).properties,
    ).toEqual({ app: "web", keep: 1 });
  });

  it("rejects ids that are emails, blank, or names", () => {
    expect(safeDistinctId(null)).toBeNull();
    expect(safeDistinctId("  ")).toBeNull();
    expect(safeDistinctId("a@b.com")).toBeNull();
    expect(safeDistinctId("Ada Sharkey")).toBeNull();
    expect(safeDistinctId(` ${"u".repeat(200)} `)).toHaveLength(128);
  });
});

describe("context", () => {
  it("tags app, environment, and release", () => {
    expect(analyticsContext({ app: "web" })).toEqual({
      app: "web",
      environment: "development",
      release: "dev",
      internal: false,
    });
    expect(
      analyticsContext({
        app: "admin",
        environment: "   ",
        release: "  ",
      }).internal,
    ).toBe(true);
    expect(analyticsContext({ app: "admin", internal: false }).internal).toBe(
      false,
    );
    const admin = analyticsContext({
      app: "admin",
      environment: "production",
      release: "abc",
    });
    expect(contextProperties(admin).internal).toBe(true);
    expect(
      contextProperties(analyticsContext({ app: "api", internal: false }))
        .internal,
    ).toBeUndefined();
    expect(isAnalyticsApp("desktop")).toBe(true);
    expect(isAnalyticsApp("ops")).toBe(false);
  });

  it("builds ingest, asset, and ui hosts", () => {
    expect(posthogHosts(null)).toEqual({
      ingest: "https://us.i.posthog.com",
      assets: "https://us-assets.i.posthog.com",
      ui: "https://us.posthog.com",
    });
    expect(posthogHosts("  https://eu.i.posthog.com/ ").ingest).toBe(
      "https://eu.i.posthog.com",
    );
    expect(posthogHosts("https://example.test/").assets).toBe(
      "https://example.test",
    );
    expect(
      ingestRewrites("https://us.i.posthog.com").map((r) => r.source),
    ).toEqual([
      "/ingest/static/:path*",
      "/ingest/array/:path*",
      "/ingest/:path*",
    ]);
  });
});

describe("client", () => {
  it("does nothing without a transport", async () => {
    const analytics = createAnalytics(analyticsContext({ app: "web" }), null);
    expect(analytics.enabled).toBe(false);
    analytics.capture("signed_up");
    analytics.identify("user_1");
    analytics.group("team_1");
    analytics.pageview("/pricing");
    analytics.search("starts");
    analytics.exception(new Error("secret"));
    expect(analytics.isFeatureEnabled("flag")).toBeUndefined();
    expect(analytics.getFeatureFlag("flag")).toBeUndefined();
    await analytics.shutdown();
  });

  it("sends sanitized events and the user id only", async () => {
    const sink = transport();
    const analytics = createAnalytics(
      analyticsContext({
        app: "web",
        environment: "preview",
        release: "sha",
      }),
      sink,
    );
    analytics.capture("roster_imported", {
      format: "roster.hy3",
      name: "Ada",
    } as never);
    analytics.identify("user_1");
    analytics.identify("ada@example.com");
    analytics.group("team_1");
    analytics.group(" ");
    analytics.pageview("/meets?q=Ada#heat");
    analytics.search("  free  ");
    analytics.search("");
    const named = new Error("Ada swam 59.3");
    named.name = "ImportError";
    analytics.exception(named, {
      route: "/import?x=1",
      source: "server",
      message: "Ada swam 59.3",
    });
    const blank = new Error("hidden");
    blank.name = "";
    analytics.exception(blank);
    analytics.exception("not an error");
    expect(analytics.isFeatureEnabled("new")).toBe(true);
    expect(analytics.getFeatureFlag("color")).toBe("blue");
    await analytics.shutdown();

    expect(sink.events[0]).toMatchObject({
      event: "roster_imported",
      properties: {
        app: "web",
        environment: "preview",
        release: "sha",
        format: "hy3",
      },
    });
    expect(sink.events[0]?.properties.name).toBeUndefined();
    expect(sink.ids).toEqual(["user_1"]);
    expect(sink.groups).toEqual(["team_1"]);
    expect(sink.events.map((event) => event.event)).toContain("$pageview");
    const page = sink.events.find((event) => event.event === "$pageview");
    expect(page?.properties.$current_url).toBe("/meets");
    expect(sink.exceptions[0]).toMatchObject({
      name: "ImportError",
      properties: { route: "/import", source: "server" },
    });
    expect(JSON.stringify(sink.exceptions)).not.toContain("59.3");
    expect(sink.exceptions[1]?.name).toBe("Error");
    expect(sink.exceptions[2]?.name).toBe("Error");
  });

  it("falls back to a capture when the transport has no exception method", () => {
    const events: string[] = [];
    const analytics = createAnalytics(analyticsContext({ app: "api" }), {
      capture(event) {
        events.push(event);
      },
      identify() {},
      group() {},
      isFeatureEnabled() {
        return undefined;
      },
      getFeatureFlag() {
        return undefined;
      },
      shutdown: async () => undefined,
    });
    const error = new Error("secret");
    error.name = "x".repeat(100);
    analytics.exception(error, { $el_text: "Ada" });
    expect(events).toEqual(["$exception"]);
  });
});

describe("browser", () => {
  it("loads the SDK module", async () => {
    await expect(loadPosthogBrowser()).resolves.toBe(browserSdk);
  });

  it("reads a queue defensively", () => {
    expect(readQueue(null)).toEqual([]);
    expect(readQueue("")).toEqual([]);
    expect(readQueue("{")).toEqual([]);
    expect(readQueue("{}")).toEqual([]);
    expect(readQueue("null")).toEqual([]);
    expect(readQueue("[1, null]")).toEqual([]);
    expect(
      readQueue(
        JSON.stringify([
          { event: 1 },
          { event: "ok", properties: null },
          { event: "kept", properties: { format: "hy3" } },
        ]),
      ),
    ).toEqual([{ event: "kept", properties: { format: "hy3" } }]);
  });

  it("masks replay and scrubs events before they leave the browser", () => {
    const masked = browserInitOptions({
      apiHost: "/ingest",
      uiHost: "https://us.posthog.com",
      replay: true,
    });
    expect(masked.autocapture).toBe(false);
    expect(masked.session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: "*",
    });
    const send = masked.before_send as (
      event: { properties?: Record<string, unknown> } | null,
    ) => unknown;
    expect(send(null)).toBeNull();
    expect(send({ properties: { $el_text: "Ada", app: "web" } })).toEqual({
      properties: { app: "web" },
    });
    expect(
      browserInitOptions({
        apiHost: "https://us.i.posthog.com",
        uiHost: "https://us.posthog.com",
        replay: false,
      }).disable_session_recording,
    ).toBe(true);
  });

  it("is a no-op without a key", async () => {
    const analytics = initBrowserAnalytics({ app: "web", key: "  " });
    expect(analytics.enabled).toBe(false);
    analytics.capture("signed_up");
    analytics.identify("user_1");
    analytics.group("team_1");
    analytics.pageview("/");
    analytics.search("starts");
    analytics.exception(new Error("x"));
    expect(analytics.isFeatureEnabled("f")).toBeUndefined();
    expect(analytics.getFeatureFlag("f")).toBeUndefined();
    await analytics.shutdown();
  });

  it("queues offline and flushes a scrubbed backlog", async () => {
    const ph = fakeBrowser();
    const storage = memoryStorage(
      JSON.stringify([
        {
          event: "signed_up",
          properties: { email: "a@b.com", app: "desktop" },
        },
      ]),
    );
    let online = false;
    const listeners: Array<() => void> = [];
    const analytics = initBrowserAnalytics({
      app: "desktop",
      key: "phc_test",
      host: "https://eu.i.posthog.com/",
      posthog: ph,
      offlineQueue: true,
      storage,
      online: () => online,
      subscribeOnline(listener) {
        listeners.push(listener);
        return () => listeners.splice(0, listeners.length);
      },
    });
    await Promise.resolve();
    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
    listeners[0]?.();
    analytics.capture("meet_created");
    analytics.identify("user_1");
    analytics.group("team_1");
    analytics.exception(new Error("panic"));
    expect(analytics.isFeatureEnabled("offline")).toBe(true);
    expect(ph.capture).not.toHaveBeenCalled();
    online = true;
    listeners[0]?.();
    const events = ph.capture.mock.calls.map((call) => call[0]);
    expect(events).toContain("signed_up");
    expect(events).toContain("meet_created");
    expect(JSON.stringify(ph.capture.mock.calls)).not.toContain("a@b.com");
    expect(storage.map.has("lane4.analytics.queue")).toBe(false);
    expect(ph.identify).toHaveBeenCalledWith("user_1");
    expect(ph.group).toHaveBeenCalledWith("team", "team_1");
  });

  it("initializes posthog-js, then captures and reports exceptions", async () => {
    browserSdk.init.mockClear();
    browserSdk.capture.mockClear();
    const ready = vi.fn();
    const analytics = initBrowserAnalytics({
      app: "web",
      key: "phc_web",
      apiHost: "/ingest",
      environment: "production",
      release: "abc",
      onReady: ready,
    });
    await vi.waitFor(() => {
      expect(browserSdk.init).toHaveBeenCalled();
    });
    expect(ready).toHaveBeenCalledOnce();
    expect(browserSdk.init).toHaveBeenCalledWith(
      "phc_web",
      expect.objectContaining({
        api_host: "/ingest",
        autocapture: false,
        disable_session_recording: false,
      }),
    );
    analytics.capture("signed_up");
    analytics.exception(new TypeError("hidden"));
    expect(browserSdk.captureException).toHaveBeenCalled();
    const captured = browserSdk.captureException.mock.calls[0]?.[0] as Error;
    expect(captured.name).toBe("TypeError");
    expect(captured.message).toBe("TypeError");
    expect(analytics.isFeatureEnabled("flag")).toBe(true);
    expect(analytics.getFeatureFlag("flag")).toBe("on");

    const plain = fakeBrowser();
    delete plain.captureException;
    const desktop = initBrowserAnalytics({
      app: "desktop",
      key: "phc_desktop",
      apiHost: "   ",
      replay: true,
      posthog: plain,
    });
    await Promise.resolve();
    expect(plain.init).not.toHaveBeenCalled();
    desktop.exception(new Error("hidden"));
    expect(plain.capture.mock.calls.map((call) => call[0])).toContain(
      "$exception",
    );
  });

  it("holds events until the SDK loads and drops them when queueing is off", async () => {
    const ph = fakeBrowser();
    let resolveLoad: (client: PostHogBrowser) => void = () => undefined;
    const storage = memoryStorage();
    const waiting = initBrowserAnalytics({
      app: "desktop",
      key: "phc_wait",
      offlineQueue: true,
      storage,
      loadPosthog: () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    });
    waiting.capture("meet_created");
    waiting.identify("user_1");
    waiting.group("team_1");
    waiting.exception(new Error("x"));
    expect(waiting.isFeatureEnabled("f")).toBeUndefined();
    expect(waiting.getFeatureFlag("f")).toBeUndefined();
    expect(ph.capture).not.toHaveBeenCalled();
    resolveLoad(ph);
    await Promise.resolve();
    expect(ph.init.mock.calls[0]?.[1]).toMatchObject({
      disable_session_recording: true,
    });
    expect(ph.capture).toHaveBeenCalled();
    await waiting.shutdown();

    const dropped = fakeBrowser();
    let resolveDrop: (client: PostHogBrowser) => void = () => undefined;
    const quiet = initBrowserAnalytics({
      app: "web",
      key: "phc_drop",
      loadPosthog: () =>
        new Promise((resolve) => {
          resolveDrop = resolve;
        }),
    });
    quiet.capture("signed_up");
    resolveDrop(dropped);
    await Promise.resolve();
    expect(dropped.capture).not.toHaveBeenCalled();

    const broken = memoryStorage(null, "get");
    initBrowserAnalytics({
      app: "desktop",
      key: "phc_broken_get",
      posthog: fakeBrowser(),
      offlineQueue: true,
      storage: broken,
    });
    const full = memoryStorage(null, "set");
    const queued = initBrowserAnalytics({
      app: "desktop",
      key: "phc_full",
      posthog: fakeBrowser(),
      offlineQueue: true,
      storage: full,
      online: () => false,
    });
    expect(() => queued.capture("signed_up")).not.toThrow();

    const capped = memoryStorage();
    let online = false;
    const capping = initBrowserAnalytics({
      app: "desktop",
      key: "phc_cap",
      posthog: fakeBrowser(),
      offlineQueue: true,
      storage: capped,
      online: () => online,
    });
    for (let i = 0; i < 51; i++) capping.capture("meet_created");
    const stored = JSON.parse(
      capped.map.get("lane4.analytics.queue") ?? "[]",
    ) as unknown[];
    expect(stored).toHaveLength(50);
    online = true;

    initBrowserAnalytics({
      app: "web",
      key: "phc_fail",
      loadPosthog: () => Promise.reject(new Error("blocked")),
    });
    await Promise.resolve();
    await Promise.resolve();

    const listeners: Array<() => void> = [];
    let resolveEarly: (client: PostHogBrowser) => void = () => undefined;
    initBrowserAnalytics({
      app: "desktop",
      key: "phc_early",
      offlineQueue: true,
      subscribeOnline(listener) {
        listeners.push(listener);
        return () => undefined;
      },
      loadPosthog: () =>
        new Promise((resolve) => {
          resolveEarly = resolve;
        }),
    });
    listeners[0]?.();
    resolveEarly(fakeBrowser());
    await Promise.resolve();
  });
});

describe("server", () => {
  it("wraps posthog-node and never forwards a non-error message", async () => {
    serverMocks.instances.length = 0;
    const sdk = await loadPosthogServer(
      "phc_server",
      "https://us.i.posthog.com",
    );
    sdk.capture({ distinctId: "anonymous", event: "signed_up" });
    sdk.identify({ distinctId: "user_1" });
    sdk.groupIdentify({ groupType: "team", groupKey: "team_1" });
    sdk.captureException("nope", "user_1");
    sdk.captureException(new Error("boom"), "user_1", { app: "api" });
    await expect(sdk.isFeatureEnabled("flag", "user_1")).resolves.toBe(true);
    await expect(sdk.getFeatureFlag("flag", "user_1")).resolves.toBe("variant");
    await sdk.shutdown();
    const instance = serverMocks.instances[0];
    expect(instance?.options).toEqual({
      host: "https://us.i.posthog.com",
      flushInterval: 5000,
    });
    const first = instance?.captureException.mock.calls[0]?.[0] as Error;
    expect(first.message).toBe("Error");
    expect(instance?.captureException.mock.calls[1]?.[0]).toBeInstanceOf(Error);
    expect(instance?._shutdown).toHaveBeenCalled();
  });

  it("is a no-op without a key, a failed load, or a null client", async () => {
    resetServerAnalyticsForTests();
    const missing = await initServerAnalytics({ app: "api", apiKey: "  " });
    expect(missing.enabled).toBe(false);
    const failed = await initServerAnalytics({
      app: "api",
      apiKey: "phc_fail",
      load: () => Promise.reject(new Error("down")),
    });
    expect(failed.enabled).toBe(false);
    const empty = await initServerAnalytics({
      app: "api",
      apiKey: "phc_empty",
      load: async () => null,
    });
    expect(empty.enabled).toBe(false);
  });

  it("captures with the user id, team, and cached flags", async () => {
    resetServerAnalyticsForTests();
    const client = fakeServer();
    let flag: (value: boolean | undefined) => void = () => undefined;
    client.isFeatureEnabled.mockImplementation(
      () =>
        new Promise<boolean | undefined>((resolve) => {
          flag = resolve;
        }),
    );
    const analytics = await initServerAnalytics({
      app: "admin",
      apiKey: "phc_admin",
      host: "https://eu.i.posthog.com",
      environment: "production",
      release: "rel",
      load: async () => client,
    });
    const cached = getServerAnalytics({ app: "docs", apiKey: "phc_docs" });
    expect(getServerAnalytics({ app: "docs", apiKey: "ignored" })).toBe(cached);
    await cached;
    const injected = fakeServer();
    await getServerAnalytics({
      app: "docs",
      apiKey: "phc_docs",
      load: async () => injected,
    });
    injected.capture.mockClear();
    analytics.capture("team_created");
    expect(client.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "anonymous",
        event: "team_created",
        properties: expect.objectContaining({
          app: "admin",
          internal: true,
          environment: "production",
          release: "rel",
        }),
      }),
    );
    analytics.identify("user_1");
    analytics.identify("not an id");
    analytics.group("team_1");
    analytics.group("Ada Sharkey");
    analytics.capture("meet_created");
    expect(client.capture.mock.calls[1]?.[0].distinctId).toBe("user_1");
    expect(client.groupIdentify).toHaveBeenCalledWith({
      groupType: "team",
      groupKey: "team_1",
    });
    analytics.exception(new Error("db down"), {
      route: "/v1/meets",
      status: 500,
      source: "server",
    });
    const reported = client.captureException.mock.calls[0]?.[0] as Error;
    expect(reported.message).toBe("Error");
    expect(client.captureException.mock.calls[0]?.[1]).toBe("user_1");

    expect(analytics.isFeatureEnabled("beta")).toBeUndefined();
    flag(true);
    await Promise.resolve();
    expect(analytics.isFeatureEnabled("beta")).toBe(true);
    expect(client.isFeatureEnabled).toHaveBeenCalledTimes(1);

    client.getFeatureFlag.mockResolvedValueOnce("blue");
    expect(analytics.getFeatureFlag("color")).toBeUndefined();
    await Promise.resolve();
    expect(analytics.getFeatureFlag("color")).toBe("blue");
    expect(analytics.isFeatureEnabled("color")).toBeUndefined();
    await Promise.resolve();

    client.isFeatureEnabled.mockRejectedValueOnce(new Error("offline"));
    expect(analytics.isFeatureEnabled("down")).toBeUndefined();
    await Promise.resolve();
    expect(analytics.getFeatureFlag("down")).toBeUndefined();

    client.getFeatureFlag.mockRejectedValueOnce(new Error("offline"));
    expect(analytics.getFeatureFlag("other")).toBeUndefined();
    await Promise.resolve();
    expect(analytics.getFeatureFlag("other")).toBeUndefined();

    const external = await initServerAnalytics({
      app: "api",
      apiKey: "phc_api",
      internal: false,
      load: async () => fakeServer(),
    });
    external.capture("signed_up");
    await analytics.shutdown();
    expect(client.shutdown).toHaveBeenCalled();
    expect(external.enabled).toBe(true);
  });
});

describe("logs", () => {
  it("builds an OTLP body without a request body", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const body = otlpLogsBody([
      {
        message: "request",
        level: "info",
        app: "api",
        environment: "production",
        release: "sha",
        requestId: "req_1",
        route: "/v1/meets",
        status: 0,
        durationMs: 0,
      },
      {
        message: "slow",
        level: "warn",
        app: "api",
        environment: "production",
        release: "sha",
      },
      {
        message: "failed",
        level: "error",
        app: "api",
        environment: "production",
        release: "sha",
        status: 500,
        durationMs: 12,
      },
    ]);
    const records = body.resourceLogs[0]?.scopeLogs[0]?.logRecords ?? [];
    expect(records[0]?.timeUnixNano).toBe("1700000000000000000");
    expect(records[0]?.severityNumber).toBe(9);
    expect(records[1]?.severityNumber).toBe(13);
    expect(records[2]?.severityNumber).toBe(17);
    expect(JSON.stringify(records[0])).toContain("request_id");
    expect(JSON.stringify(records[0])).not.toContain("requestBody");
    expect(records[1]?.attributes.map((item) => item.key)).not.toContain(
      "request_id",
    );
    expect(otlpLogsBody([])).toMatchObject({
      resourceLogs: [
        { resource: { attributes: [{ value: { stringValue: "lane4" } }] } },
      ],
    });
    vi.mocked(Date.now).mockRestore();
  });

  it("posts when a key is set and ignores transport failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok"));
    await sendOtlpLogs({ apiKey: "  ", records: [], fetchImpl });
    await sendOtlpLogs({
      apiKey: "phc_logs",
      records: [],
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    await sendOtlpLogs({
      apiKey: "phc_logs",
      host: "https://eu.i.posthog.com/",
      records: [
        {
          message: "request",
          level: "info",
          app: "api",
          environment: "production",
          release: "sha",
          requestId: "req_1",
          route: "/v1/meets",
          status: 201,
          durationMs: 8,
        },
      ],
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://eu.i.posthog.com/i/v1/logs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer phc_logs",
        }),
      }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("ok")) as typeof fetch;
    await sendOtlpLogs({
      apiKey: "phc_default",
      records: [
        {
          message: "request",
          level: "info",
          app: "api",
          environment: "test",
          release: "dev",
        },
      ],
    });
    expect(globalThis.fetch).toHaveBeenCalled();
    globalThis.fetch = originalFetch;
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      sendOtlpLogs({
        apiKey: "phc_logs",
        records: [
          {
            message: "request",
            level: "error",
            app: "api",
            environment: "development",
            release: "dev",
          },
        ],
        fetchImpl: failing,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("docs snippet", () => {
  it("records pageviews and search without identifying anyone", () => {
    const source = readFileSync(
      new URL("../../../apps/docs/posthog.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain('POSTHOG_KEY = ""');
    expect(source).toContain("disable_session_recording: true");
    expect(source).toContain("docs_search");
    expect(source).toContain('app: "docs"');
    expect(source).not.toContain("identify(");
    expect(source).toContain("disable_session_recording: true");
    expect(source).not.toContain("disable_session_recording: false");
  });
});

function fakeBrowser(): PostHogBrowser {
  return {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    isFeatureEnabled: vi.fn(() => true),
    getFeatureFlag: vi.fn(() => "on"),
    captureException: vi.fn(),
  };
}

function memoryStorage(initial?: string | null, broken?: "get" | "set") {
  const map = new Map<string, string>();
  if (initial) map.set("lane4.analytics.queue", initial);
  return {
    map,
    getItem(key: string) {
      if (broken === "get") throw new Error("blocked");
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (broken === "set") throw new Error("full");
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

function fakeServer(): ServerPostHog {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    groupIdentify: vi.fn(),
    captureException: vi.fn(),
    isFeatureEnabled: vi.fn(async () => true),
    getFeatureFlag: vi.fn(async () => "variant"),
    shutdown: vi.fn(async () => undefined),
  };
}
