"use client";

import { Button } from "@lane4hq/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@lane4hq/ui/components/empty";
import { useEffect } from "react";
import { browserAnalytics } from "@/lib/browser-analytics";

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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-6xl items-center px-4">
      <Empty className="w-full">
        <EmptyHeader>
          <EmptyTitle>This page hit an error.</EmptyTitle>
          <EmptyDescription>
            The page could not finish loading. Try again, or go back home.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button className="press-scale" onClick={reset}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
