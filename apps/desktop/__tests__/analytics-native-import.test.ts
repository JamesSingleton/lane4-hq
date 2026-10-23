import { afterEach, describe, expect, it, vi } from "vitest";
import { startDesktopAnalytics } from "../src/lib/analytics";

vi.mock("@tauri-apps/api/event", () => {
  throw new Error("no tauri");
});

describe("native analytics import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores a missing Tauri event module", async () => {
    vi.stubGlobal("window", {
      __TAURI_INTERNALS__: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    expect(() =>
      startDesktopAnalytics({ key: "phc_desktop", replay: false }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    startDesktopAnalytics({ key: "" });
  });
});
