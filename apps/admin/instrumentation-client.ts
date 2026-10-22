import { initBotId } from "botid/client/core";
import { browserAnalytics } from "@/app/browser-analytics";

/**
 * Invisible bot checks for high-value Better Auth POSTs.
 * Client challenge tokens are attached automatically; the auth route
 * verifies them with checkBotId() before forwarding to Better Auth.
 */
initBotId({
  protect: [
    { path: "/api/auth/sign-up/email", method: "POST" },
    { path: "/api/auth/sign-in/email", method: "POST" },
    { path: "/api/auth/request-password-reset", method: "POST" },
  ],
});

// PostHog's `defaults` preset turns on autocapture and unmasked replay.
const analytics = browserAnalytics();

window.addEventListener("error", (event) => {
  analytics.exception(event.error ?? new Error("Error"), {
    source: "client",
    route: window.location.pathname,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  analytics.exception(event.reason, {
    source: "client",
    route: window.location.pathname,
  });
});
