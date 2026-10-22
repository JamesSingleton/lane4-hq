import { cn } from "@lane4hq/ui/lib/utils";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "@lane4hq/ui/globals.css";
import { env } from "@/env";

void env.BETTER_AUTH_URL;

export const metadata: Metadata = {
  title: { template: "%s | Lane4 Ops", default: "Lane4 Ops" },
  description: "Operator dashboard for Lane4 HQ.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", GeistSans.variable)}
      suppressHydrationWarning
    >
      <body className="bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
