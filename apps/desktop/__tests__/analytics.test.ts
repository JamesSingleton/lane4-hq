import type { PostHogBrowser } from "@lane4hq/analytics/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  desktopAnalytics,
  desktopFlag,
  startDesktopAnalytics,
  trackExport,
  trackImportFailed,
  trackMeetCreated,
  trackResultsImported,
} from "../src/lib/analytics";

const listen = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));

function fakePosthog(): PostHogBrowser {
  return {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    isFeatureEnabled: vi.fn(() => true),
    getFeatureFlag: vi.fn(() => "on"),
  };
}

type FakeWindow = {
  __TAURI_INTERNALS__?: object;
  addEventListener: (type: string, listener: (event: never) => void) => void;
  removeEventListener: (type: string, listener: (event: never) => void) => void;
  emit: (type: string, event: unknown) => void;
};

function installWindow(tauri: boolean): FakeWindow {
  const handlers = new Map<string, Set<(event: never) => void>>();
  const fake: FakeWindow = {
    addEventListener(type, listener) {
      const set = handlers.get(type) ?? new Set();
      set.add(listener);
      handlers.set(type, set);
    },
    removeEventListener(type, listener) {
      handlers.get(type)?.delete(listener);
    },
    emit(type, event) {
      const set = handlers.get(type);
      if (!set) return;
      for (const listener of set) listener(event as never);
    },
  };
  if (tauri) fake.__TAURI_INTERNALS__ = {};
  vi.stubGlobal("window", fake);
  return fake;
}

describe("desktop analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    listen.mockReset();
  });

  it("stays off when the Vite key is missing", () => {
    const analytics = startDesktopAnalytics({ key: "" });
    trackMeetCreated();
    trackExport("Desert Champs.hy3", true);
    trackResultsImported("results.cl2", 0);
    expect(analytics.enabled).toBe(false);
    expect(desktopAnalytics()).toBe(analytics);
    expect(desktopFlag("beta")).toBeUndefined();
  });

  it("sends the format and an error code, not names or times", () => {
    const capture = vi.fn();
    const posthog = fakePosthog();
    posthog.capture = capture;
    startDesktopAnalytics({ key: "phc_desktop", posthog, replay: false });
    trackMeetCreated();
    trackExport("Desert Champs.HY3", true);
    trackExport("Ada Sharkey.cl2", false, new Error("Ada swam 59.40"));
    trackResultsImported("pack.ZIP", 3);
    trackImportFailed("roster.sd3", new Error("No valid swimmers: Ada"));
    const serialized = JSON.stringify(capture.mock.calls);
    expect(serialized).toContain("meet_created");
    expect(serialized).toContain("entries_exported");
    expect(serialized).toContain("export_failed");
    expect(serialized).toContain("results_imported");
    expect(serialized).toContain("import_failed");
    expect(serialized).toContain("hy3");
    expect(serialized).not.toContain("Desert");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("59.40");
    expect(desktopFlag("beta")).toBe(true);
  });

  it("holds events while the browser is offline, then flushes", () => {
    const capture = vi.fn();
    const posthog = fakePosthog();
    posthog.capture = capture;
    const view = installWindow(false);
    vi.stubGlobal("navigator", { onLine: false });
    startDesktopAnalytics({ key: "phc_desktop", posthog, replay: false });
    trackMeetCreated();
    expect(capture).not.toHaveBeenCalled();
    (navigator as { onLine: boolean }).onLine = true;
    view.emit("online", {});
    const serialized = JSON.stringify(capture.mock.calls);
    expect(serialized).toContain("meet_created");
    expect(serialized).not.toContain("Desert");
    startDesktopAnalytics({ key: "" });
  });

  it("reports window and Rust exceptions without the panic text", async () => {
    const capture = vi.fn();
    const posthog = fakePosthog();
    posthog.capture = capture;
    const view = installWindow(true);
    let handler: ((event: { payload: unknown }) => void) | undefined;
    listen.mockImplementation(
      (_name: string, next: (event: { payload: unknown }) => void) => {
        handler = next;
        return Promise.resolve(() => undefined);
      },
    );
    startDesktopAnalytics({ key: "phc_desktop", posthog, replay: false });
    view.emit("error", { error: new Error("Ada swam 59.40") });
    view.emit("unhandledrejection", { reason: "Ada Sharkey" });
    view.emit("error", {});
    await vi.waitFor(() => expect(handler).toBeTypeOf("function"));
    handler?.({ payload: null });
    handler?.({
      payload: {
        source: "panic",
        file: "C:\\Users\\Ada\\analytics.rs",
        line: 12,
        code: "panic",
        message: "Ada swam 59.40",
      },
    });
    handler?.({
      payload: { source: "nope", file: "ada@club.com", code: "nope" },
    });
    const serialized = JSON.stringify(capture.mock.calls);
    expect(serialized).toContain("client");
    expect(serialized).toContain("panic");
    expect(serialized).toContain("analytics.rs");
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("59.40");
    expect(serialized).not.toContain("@");
    startDesktopAnalytics({ key: "" });
  });
});
