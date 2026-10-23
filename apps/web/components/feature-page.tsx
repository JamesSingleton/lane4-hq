import { cn } from "@lane4hq/ui/lib/utils";
import { CtaLink } from "@/components/cta-link";
import { MarketingCta } from "@/components/marketing-cta";
import { ProductShot } from "@/components/product-shot";
import { Reveal } from "@/components/reveal";
import { PageIntro, siteContainer } from "@/components/section";
import type { ProductShotId } from "@/lib/screenshots";

export function FeaturePage({
  title,
  description,
  children,
  shot,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  shot?: ProductShotId;
}) {
  return (
    <>
      <PageIntro title={title} description={description}>
        <CtaLink href="/product" variant="outline" size="sm" className="w-fit">
          Product overview
        </CtaLink>
      </PageIntro>
      {shot ? (
        <Reveal className={cn(siteContainer, "pb-10")}>
          <ProductShot shot={shot} priority />
        </Reveal>
      ) : null}
      <section className="border-y border-border/70 bg-muted/40">
        <div
          className={cn(siteContainer, "flex flex-col gap-12 py-12 md:py-16")}
        >
          {children}
        </div>
      </section>
      <MarketingCta />
    </>
  );
}

export function FeatureBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-border/80 pb-8 last:border-b-0 last:pb-0 md:grid-cols-[minmax(12rem,18rem)_minmax(0,42rem)] md:gap-12">
      <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      <div className="flex max-w-2xl flex-col gap-3 text-pretty leading-relaxed">
        {children}
      </div>
    </div>
  );
}
