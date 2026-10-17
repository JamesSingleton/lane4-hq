/**
 * Desktop meet-manager sessions last a season and renew when the laptop is
 * used. Web sessions stay on Better Auth's 7-day default: this module never
 * changes `session.expiresIn`.
 *
 * A desktop session is the one created by the device-code exchange
 * (`POST /device/token`) from the Tauri app, whose user agent is
 * `Lane4Desktop/<version>`.
 */

/** A season. Unused past this, the deck laptop signs out. */
export const DEVICE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;

/** Better Auth's default. Documented so web sessions are an explicit choice. */
export const WEB_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Renew a desktop session once it has been used after this much of its life. */
export const DEVICE_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export const DESKTOP_USER_AGENT_PREFIX = "Lane4Desktop";

export function isDesktopUserAgent(
  userAgent: string | null | undefined,
): boolean {
  return (
    typeof userAgent === "string" &&
    userAgent.startsWith(DESKTOP_USER_AGENT_PREFIX)
  );
}

export function deviceSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + DEVICE_SESSION_TTL_SECONDS * 1000);
}

/**
 * Lengthen a session at creation. Only the desktop device-token exchange
 * qualifies; a browser sign-in on the same account keeps the 7-day lifetime.
 */
export function deviceSessionCreateOverride(
  session: { userAgent?: string | null },
  path: string | null | undefined,
  now = new Date(),
): { expiresAt: Date } | null {
  if (!path?.endsWith("/device/token")) return null;
  if (!isDesktopUserAgent(session.userAgent)) return null;
  return { expiresAt: deviceSessionExpiresAt(now) };
}

/**
 * True when a still-valid desktop session should be pushed back out to a full
 * season. False when it is fresh (used within the last day), already expired,
 * or not a desktop session.
 */
export function shouldRenewDeviceSession(
  session: {
    userAgent?: string | null;
    expiresAt?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (!isDesktopUserAgent(session.userAgent)) return false;
  if (session.expiresAt == null) return false;
  const expires =
    session.expiresAt instanceof Date
      ? session.expiresAt
      : new Date(session.expiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  const remainingMs = expires.getTime() - now.getTime();
  if (remainingMs <= 0) return false;
  const renewWhenRemainingMs =
    (DEVICE_SESSION_TTL_SECONDS - DEVICE_SESSION_UPDATE_AGE_SECONDS) * 1000;
  return remainingMs <= renewWhenRemainingMs;
}

/** The expiry Better Auth should store when it refreshes a desktop session. */
export function refreshedDeviceExpiry(
  storedUserAgent: string | null | undefined,
  now = new Date(),
): Date | null {
  if (!isDesktopUserAgent(storedUserAgent)) return null;
  return deviceSessionExpiresAt(now);
}

/** The credential from an `Authorization` header, or null when it isn't bearer. */
export function bearerToken(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return null;
  }
  return token;
}
