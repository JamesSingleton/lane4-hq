import { browserAnalytics } from "@/lib/browser-analytics";

// Next.js runs this file in the browser before hydration. PostHog's
// `defaults` preset turns on autocapture and unmasked replay, so init goes
// through @lane4hq/analytics instead.
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
