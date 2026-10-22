"use client";

import { Button } from "@lane4hq/ui/components/button";
import { useEffect } from "react";
import { browserAnalytics } from "@/app/browser-analytics";

export default function RouteError({
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">This page hit an error.</h1>
      <p className="text-muted-foreground">
        The page could not finish loading. Try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
