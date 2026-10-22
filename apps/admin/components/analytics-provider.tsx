"use client";

import type { Analytics } from "@lane4hq/analytics";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  browserAnalytics,
  subscribeAnalyticsReady,
} from "@/app/browser-analytics";

export type AnalyticsBootstrap = {
  userId?: string;
  /** Admin routes are `/team/:teamId/...`. The id is a group key, not a name. */
  groupFromTeamPath?: boolean;
};

const AnalyticsContext = createContext<Analytics>(browserAnalytics());

export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}

/** Undefined until PostHog has loaded flags. Missing keys stay undefined. */
export function useFeatureEnabled(flag: string): boolean | undefined {
  const client = useContext(AnalyticsContext);
  const [revision, setRevision] = useState(0);
  const [value, setValue] = useState<boolean | undefined>(undefined);
  useEffect(
    () => subscribeAnalyticsReady(() => setRevision((current) => current + 1)),
    [],
  );
  useEffect(() => {
    setValue(client.isFeatureEnabled(flag));
  }, [client, flag, revision]);
  return value;
}

export function AnalyticsProvider({
  children,
  bootstrap,
}: {
  children: ReactNode;
  bootstrap: AnalyticsBootstrap;
}) {
  const client = browserAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    if (bootstrap.userId) client.identify(bootstrap.userId);
  }, [client, bootstrap.userId]);

  useEffect(() => {
    client.pageview(pathname);
  }, [client, pathname]);

  useEffect(() => {
    if (!bootstrap.groupFromTeamPath) return;
    const match = /^\/team\/([^/]+)/.exec(pathname);
    const teamId = match?.[1];
    if (teamId) client.group(teamId);
  }, [client, pathname, bootstrap.groupFromTeamPath]);

  return (
    <AnalyticsContext.Provider value={client}>
      {children}
    </AnalyticsContext.Provider>
  );
}
