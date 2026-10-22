import { createAuthClient } from "better-auth/react";

function resolveAuthBaseURL() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
}

const authBaseURL = resolveAuthBaseURL();

export const staffAuthClient = createAuthClient({
  ...(authBaseURL ? { baseURL: authBaseURL } : {}),
});
