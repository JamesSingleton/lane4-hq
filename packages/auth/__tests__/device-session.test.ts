import { describe, expect, it } from "vitest";
import {
  bearerToken,
  DEVICE_SESSION_TTL_SECONDS,
  DEVICE_SESSION_UPDATE_AGE_SECONDS,
  deviceSessionCreateOverride,
  deviceSessionExpiresAt,
  isDesktopUserAgent,
  refreshedDeviceExpiry,
  shouldRenewDeviceSession,
  WEB_SESSION_TTL_SECONDS,
} from "../src/device-session";

const NOW = new Date("2026-10-10T12:00:00.000Z");

describe("desktop session lifetime", () => {
  it("keeps web sessions on the 7-day default", () => {
    expect(WEB_SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);
    expect(DEVICE_SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 180);
  });

  it("recognizes the desktop app's user agent", () => {
    expect(isDesktopUserAgent(null)).toBe(false);
    expect(isDesktopUserAgent(undefined)).toBe(false);
    expect(isDesktopUserAgent("")).toBe(false);
    expect(isDesktopUserAgent("Mozilla/5.0")).toBe(false);
    expect(isDesktopUserAgent("Lane4Desktop")).toBe(true);
    expect(isDesktopUserAgent("Lane4Desktop/0.1.0")).toBe(true);
  });

  it("sets a season-long expiry", () => {
    expect(deviceSessionExpiresAt(NOW).toISOString()).toBe(
      "2027-04-08T12:00:00.000Z",
    );
  });

  it("lengthens only the device-token exchange from the desktop app", () => {
    const desktop = { userAgent: "Lane4Desktop/0.1.0" };
    expect(deviceSessionCreateOverride(desktop, null, NOW)).toBeNull();
    expect(
      deviceSessionCreateOverride(desktop, "/sign-in/email", NOW),
    ).toBeNull();
    expect(
      deviceSessionCreateOverride(
        { userAgent: "Mozilla/5.0" },
        "/device/token",
        NOW,
      ),
    ).toBeNull();
    expect(
      deviceSessionCreateOverride(desktop, "/api/auth/device/token", NOW),
    ).toEqual({ expiresAt: deviceSessionExpiresAt(NOW) });
  });

  it("renews a desktop session once a day of its life has passed", () => {
    const desktop = { userAgent: "Lane4Desktop/0.1.0" };
    const ttlMs = DEVICE_SESSION_TTL_SECONDS * 1000;
    const thresholdMs =
      (DEVICE_SESSION_TTL_SECONDS - DEVICE_SESSION_UPDATE_AGE_SECONDS) * 1000;

    expect(shouldRenewDeviceSession({ userAgent: "Mozilla/5.0" }, NOW)).toBe(
      false,
    );
    expect(shouldRenewDeviceSession(desktop, NOW)).toBe(false);
    expect(
      shouldRenewDeviceSession({ ...desktop, expiresAt: "not-a-date" }, NOW),
    ).toBe(false);
    expect(
      shouldRenewDeviceSession(
        { ...desktop, expiresAt: new Date(NOW.getTime() - 1) },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldRenewDeviceSession(
        { ...desktop, expiresAt: new Date(NOW.getTime() + ttlMs) },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldRenewDeviceSession(
        { ...desktop, expiresAt: new Date(NOW.getTime() + thresholdMs) },
        NOW,
      ),
    ).toBe(true);
    expect(
      shouldRenewDeviceSession(
        {
          ...desktop,
          expiresAt: new Date(NOW.getTime() + thresholdMs - 1).toISOString(),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("refreshes a stored desktop session back to a full season", () => {
    expect(refreshedDeviceExpiry(null, NOW)).toBeNull();
    expect(refreshedDeviceExpiry("Mozilla/5.0", NOW)).toBeNull();
    expect(refreshedDeviceExpiry("Lane4Desktop/0.1.0", NOW)).toEqual(
      deviceSessionExpiresAt(NOW),
    );
  });

  it("reads only a single bearer credential", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer abc def")).toBeNull();
  });
});
