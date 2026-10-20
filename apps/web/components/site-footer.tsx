import { Separator } from "@lane4hq/ui/components/separator";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { CtaLink } from "@/components/cta-link";
import { GithubStars } from "@/components/github-stars";
import {
  audienceLinks,
  DOCS_URL,
  GITHUB_URL,
  PRIMARY_CTA,
  productLinks,
  SIGN_UP_URL,
  SITE_TAGLINE,
} from "@/lib/site";

const companyLinks = [
  { href: "/compare", title: "Compare" },
  { href: "/pricing", title: "Plans" },
  { href: "/faq", title: "FAQ" },
  { href: "/story", title: "Story" },
  { href: "/support", title: "Support" },
  { href: DOCS_URL, title: "Docs", external: true },
  { href: GITHUB_URL, title: "GitHub", external: true },
] as const;

const legalLinks = [
  { href: "/privacy", title: "Privacy" },
  { href: "/terms", title: "Terms" },
] as const;

export async function SiteFooter() {
  return (
    <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 md:px-6 md:py-16">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <Link
            href="/"
            aria-label="Lane4 HQ home"
            className="flex min-h-11 items-center gap-2"
          >
            <BrandLogo />
            <span className="text-sm font-medium">Lane4 HQ</span>
          </Link>
          <p className="max-w-sm text-muted-foreground text-sm text-pretty md:text-right">
            {SITE_TAGLINE}
          </p>
        </div>

        <Separator />

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FooterColumn title="Product">
            {productLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.title}
              </Link>
            ))}
            <Link href="/formats">File formats</Link>
          </FooterColumn>
          <FooterColumn title="Teams">
            {audienceLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.title}
              </Link>
            ))}
          </FooterColumn>
          <FooterColumn title="Company">
            {companyLinks.map((item) =>
              "external" in item && item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link key={item.href} href={item.href}>
                  {item.title}
                </Link>
              ),
            )}
          </FooterColumn>
          <FooterColumn title="Legal">
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.title}
              </Link>
            ))}
          </FooterColumn>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <GithubStars />
          <CtaLink
            href={SIGN_UP_URL}
            size="sm"
            className="min-h-11 bg-[#0e3c4e] text-[#e7f2f6] hover:bg-[#0a3040]"
          >
            {PRIMARY_CTA}
          </CtaLink>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <nav aria-label={title} className="flex flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex min-w-0 flex-col gap-2 text-muted-foreground text-sm [&_a]:min-h-11 [&_a]:py-1 [&_a]:underline-offset-4 [&_a]:hover:text-foreground [&_a]:hover:underline [&_a]:focus-visible:text-foreground sm:[&_a]:min-h-0">
        {children}
      </div>
    </nav>
  );
}
