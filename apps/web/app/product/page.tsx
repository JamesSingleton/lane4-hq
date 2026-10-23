import { cn } from "@lane4hq/ui/lib/utils";
import Link from "next/link";
import { MarketingCta } from "@/components/marketing-cta";
import { ProductShot } from "@/components/product-shot";
import { PageIntro, siteContainer } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";
import { audienceLinks, coachEasier, productLinks } from "@/lib/site";

export const metadata = pageMetadata(
  "Product",
  "Seed times from best times, the lineup you export, and Sunday's results next to previous best, for club and high school swim coaches.",
);

export default function ProductPage() {
  return (
    <>
      <PageIntro
        title="Keep the host's event file, the lineup, and Sunday's results in one place."
        description="Seeds come from best times. The lineup is the file you export. Results come back next to previous best. The same week for a club invitational and a high school dual."
      />
      <div className={cn(siteContainer, "pb-12")}>
        <ProductShot shot="dashboard" priority />
      </div>
      <section className="border-y border-border/70 bg-muted/40">
        <div className={cn(siteContainer, "py-14 md:py-16")}>
          <h2 className="font-display max-w-xl text-3xl font-semibold tracking-tight md:text-4xl md:leading-tight">
            These four jobs leave the spreadsheet.
          </h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2">
            {coachEasier.map((item) => (
              <li
                key={item.title}
                className="border-t border-foreground/10 pt-5"
              >
                <Link
                  href={item.href}
                  className="group flex flex-col gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  <span className="font-medium group-hover:underline group-focus-visible:underline">
                    {item.title}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {item.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className={cn(siteContainer, "py-14 md:py-16")}>
        <ul className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {productLinks.map((item) => (
            <li key={item.href} className="flex flex-col gap-4">
              <ProductShot shot={item.shot} showCaption={false} />
              <Link
                href={item.href}
                className="group flex flex-col gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <span className="font-medium group-hover:underline group-focus-visible:underline">
                  {item.title}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="border-t border-border/70 bg-muted/40">
        <div
          className={cn(
            siteContainer,
            "grid gap-8 py-14 md:grid-cols-2 md:py-16",
          )}
        >
          {audienceLinks.map((item) => (
            <div key={item.href} className="border-t border-foreground/15 pt-5">
              <Link href={item.href} className="font-medium hover:underline">
                {item.title}
              </Link>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>
      <MarketingCta />
    </>
  );
}
