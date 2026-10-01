const ALLOWED_CALLBACK_PREFIXES = [
  "/onboarding",
  "/accept-invite",
  "/device",
  "/team/",
] as const;

const DEFAULT_CALLBACK = "/";

function isSafeRelativePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return false;
  }
  return true;
}

function isAllowedCallback(path: string): boolean {
  if (!isSafeRelativePath(path)) return false;
  if (path === "/") return true;
  return ALLOWED_CALLBACK_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Resolve post-auth redirect from `callbackUrl` search param (open-redirect safe). */
export function getCallbackURL(
  searchParams: Pick<URLSearchParams, "get">,
  fallback = DEFAULT_CALLBACK,
): string {
  const callbackUrl = searchParams.get("callbackUrl");
  if (!callbackUrl) return fallback;
  return isAllowedCallback(callbackUrl) ? callbackUrl : fallback;
}
