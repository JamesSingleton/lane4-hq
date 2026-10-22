import { getSession } from "@lane4hq/auth/session";
import { getUserPreferences } from "@lane4hq/db/queries/preferences";
import type { ThemePreference } from "@lane4hq/db/schema";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import "@lane4hq/ui/globals.css";
import { supportViewer } from "@lane4hq/auth/impersonation";
import { cn } from "@lane4hq/ui/lib/utils";
import { ImpersonationBanner } from "@/components/impersonation-banner";
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
        <Providers defaultTheme={defaultTheme} serverTheme={serverTheme}>
          {session?.user && supportViewer(session.session) ? (
            <ImpersonationBanner
              name={session.user.name}
              email={session.user.email}
              returnTo={
                process.env.OPS_URL?.replace(/\/$/, "") ??
                "http://localhost:3005"
              }
            />
          ) : null}
          {children}
        </Providers>
      </body>
    </html>
  );
}
