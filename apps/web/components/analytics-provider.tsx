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
} from "@/lib/browser-analytics";

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

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const client = browserAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    client.pageview(pathname);
  }, [client, pathname]);

  return (
    <AnalyticsContext.Provider value={client}>
      {children}
    </AnalyticsContext.Provider>
  );
}
