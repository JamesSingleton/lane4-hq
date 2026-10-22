"use client";

import { useEffect } from "react";
import { browserAnalytics } from "@/app/browser-analytics";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    browserAnalytics().exception(error, {
      source: "client",
      route: window.location.pathname,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>This page hit an error.</h1>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
