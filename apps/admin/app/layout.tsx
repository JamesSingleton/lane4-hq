import { getSession } from "@lane4hq/auth/session";
import { getUserPreferences } from "@lane4hq/db/queries/preferences";
import type { ThemePreference } from "@lane4hq/db/schema";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import "@lane4hq/ui/globals.css";
import { cn } from "@lane4hq/ui/lib/utils";
import { AnalyticsProvider } from "@/components/analytics-provider";
import Providers from "@/components/providers";
import { env } from "@/env";

// Keep a live reference so Turbopack/webpack include env validation in the graph.
void env.BETTER_AUTH_URL;

export const metadata: Metadata = {
  title: {
    template: "%s | Lane4 HQ",
    default: "Lane4 HQ",
  },
  description:
    "Lane4 HQ is the all-in-one solution for managing swim teams, tracking stats, registering for events, and setting up meets.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  let defaultTheme: ThemePreference = "dark";
  let serverTheme: ThemePreference | null = null;

  if (session?.user?.id) {
    const prefs = await getUserPreferences(session.user.id);
    defaultTheme = prefs.theme;
    serverTheme = prefs.theme;
  }

  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        GeistSans.variable,
        GeistMono.variable,
        GeistPixelSquare.variable,
      )}
      suppressHydrationWarning
    >
      <body className="overscroll-none bg-background font-sans">
        <AnalyticsProvider
          bootstrap={{
            userId: session?.user?.id,
            groupFromTeamPath: true,
          }}
        >
          <Providers defaultTheme={defaultTheme} serverTheme={serverTheme}>
            {children}
          </Providers>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
