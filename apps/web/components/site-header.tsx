"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@lane4hq/ui/components/navigation-menu";
import { cn } from "@lane4hq/ui/lib/utils";
import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { CtaLink } from "@/components/cta-link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  audienceLinks,
  DOCS_URL,
  PRIMARY_CTA,
  productLinks,
  SIGN_IN_URL,
  SIGN_UP_URL,
  SITE_TAGLINE,
} from "@/lib/site";

const topLinks = [
  { href: "/for/high-school", title: "High school" },
  { href: "/compare", title: "Compare" },
  { href: "/pricing", title: "Plans" },
  { href: "/faq", title: "FAQ" },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/95">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 md:px-6">
        <Link
          href="/"
          aria-label="Lane4 HQ home"
          className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium"
        >
          <BrandLogo />
          <span>Lane4 HQ</span>
        </Link>

        <NavigationMenu className="hidden min-w-0 flex-1 lg:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Product</NavigationMenuTrigger>
              <NavigationMenuContent className="w-[min(36rem,calc(100vw-2rem))] p-2">
                <ul className="grid gap-1 sm:grid-cols-2">
                  {productLinks.map((item) => (
                    <li key={item.href}>
                      <NavigationMenuLink
                        render={<Link href={item.href} />}
                        className="flex flex-col items-start gap-0.5"
                      >
                        <span className="font-medium">{item.title}</span>
                        <span className="text-muted-foreground text-sm">
                          {item.description}
                        </span>
                      </NavigationMenuLink>
                    </li>
                  ))}
                  <li>
                    <NavigationMenuLink
                      render={<Link href="/formats" />}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="font-medium">File formats</span>
                      <span className="text-muted-foreground text-sm">
                        HY3, CL2, EV3, HYV, SDIF, XLS, and ZIP.
                      </span>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            {topLinks.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavigationMenuLink
                  render={<Link href={link.href} />}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    isActivePath(pathname, link.href) && "bg-muted",
                  )}
                >
                  {link.title}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
            <NavigationMenuItem>
              <NavigationMenuLink
                render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}
                className={navigationMenuTriggerStyle()}
              >
                Docs
                <span className="sr-only"> (opens in a new tab)</span>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <CtaLink
            href={SIGN_IN_URL}
            variant="ghost"
            size="sm"
            className="hidden min-h-11 lg:inline-flex"
          >
            Sign in
          </CtaLink>
          <CtaLink
            href={SIGN_UP_URL}
            size="sm"
            className="hidden min-h-11 bg-[#0e3c4e] text-[#e7f2f6] hover:bg-[#0a3040] lg:inline-flex"
          >
            {PRIMARY_CTA}
          </CtaLink>
          <details className="group relative lg:hidden">
            <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-muted [&::-webkit-details-marker]:hidden">
              <MenuIcon className="group-open:hidden" />
              <XIcon className="hidden group-open:block" />
              <span className="sr-only">Menu</span>
            </summary>
            <div className="fixed inset-x-0 top-14 bottom-0 z-50 overflow-auto border-t bg-popover px-4 py-6 text-popover-foreground">
              <p className="text-muted-foreground px-2 text-sm text-pretty">
                {SITE_TAGLINE}
              </p>
              <nav aria-label="Mobile" className="mt-6 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-2 text-sm">Product</p>
                  {productLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                    >
                      {item.title}
                    </Link>
                  ))}
                  <Link
                    href="/formats"
                    className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                  >
                    File formats
                  </Link>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-2 text-sm">Teams</p>
                  {audienceLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  {topLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                    >
                      {link.title}
                    </Link>
                  ))}
                  <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                  >
                    Docs
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <Link
                    href="/support"
                    className="min-h-11 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                  >
                    Support
                  </Link>
                </div>
                <div className="flex flex-col gap-2">
                  <CtaLink
                    href={SIGN_IN_URL}
                    variant="outline"
                    className="min-h-11 w-full"
                  >
                    Sign in
                  </CtaLink>
                  <CtaLink
                    href={SIGN_UP_URL}
                    className="min-h-11 w-full bg-[#0e3c4e] text-[#e7f2f6] hover:bg-[#0a3040]"
                  >
                    {PRIMARY_CTA}
                  </CtaLink>
                </div>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
