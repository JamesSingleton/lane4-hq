// Docs analytics. Mintlify does not read env files, so paste the public
// PostHog project key into POSTHOG_KEY. An empty key records nothing.
// This script never calls identify and never starts session replay.
(() => {
  const POSTHOG_KEY = "";
  const POSTHOG_HOST = "https://us.i.posthog.com";
  if (!POSTHOG_KEY) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `${POSTHOG_HOST}/static/array.js`;
  script.onload = () => {
    const posthog = window.posthog;
    if (!posthog?.init || !posthog.capture) return;
    let seen = "";

    function page() {
      const path = window.location.pathname || "/";
      if (path === seen) return;
      seen = path;
      posthog.capture("$pageview", {
        $current_url: path,
        app: "docs",
        environment: "production",
        release: "docs",
      });
    }

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
      persistence: "memory",
      before_send: (event) => {
        if (!event) return null;
        const source = event.properties || {};
        const properties = {};
        for (const key of Object.keys(source)) {
          const value = source[key];
          if (
            key === "$el_text" ||
            key === "$elements" ||
            key === "$elements_chain"
          ) {
            continue;
          }
          if (typeof value === "string" && value.includes("@")) continue;
          properties[key] = value;
        }
        properties.app = "docs";
        properties.environment = "production";
        properties.release = "docs";
        event.properties = properties;
        return event;
      },
    });
    page();
    window.addEventListener("popstate", page);
    document.addEventListener("click", () => {
      window.setTimeout(page, 0);
    });
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!form?.querySelector) return;
      const field = form.querySelector(
        "input[type='search'], input[name='search']",
      );
      if (!field) return;
      const query = String(field.value || "")
        .trim()
        .slice(0, 200);
      if (!query || query.includes("@")) return;
      posthog.capture("docs_search", {
        query,
        app: "docs",
        environment: "production",
        release: "docs",
      });
    });
  };
  document.head.appendChild(script);
})();
