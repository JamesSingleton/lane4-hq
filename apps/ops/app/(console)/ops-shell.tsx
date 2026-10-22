"use client";

import { staffAuthClient } from "@lane4hq/auth/staff-client";
import { Button } from "@lane4hq/ui/components/button";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/requests", label: "Requests" },
  { href: "/invites", label: "Invites" },
  { href: "/people", label: "People" },
  { href: "/staff", label: "Staff" },
  { href: "/issues", label: "Issues" },
];

export function OpsShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-sm font-medium">Lane4 Ops</p>
          <p className="text-muted-foreground text-xs">{email}</p>
        </div>
        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "bg-foreground text-background rounded-md px-2.5 py-1 text-sm"
                    : "hover:bg-muted rounded-md px-2.5 py-1 text-sm"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void staffAuthClient.signOut().then(() => {
              window.location.assign("/sign-in");
            });
          }}
        >
          Sign out
        </Button>
      </header>
      {children}
    </div>
  );
}
