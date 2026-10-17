import { Separator } from "@lane4hq/ui/components/separator";
import { CtaLink } from "@/components/cta-link";
import { MarketingCta } from "@/components/marketing-cta";
import { ProductShot } from "@/components/product-shot";
import { PageIntro } from "@/components/section";
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
        <section className="mx-auto w-full max-w-6xl px-4 pb-8 md:px-6">
          <ProductShot shot={shot} priority />
        </section>
      ) : null}
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-8 md:px-6">
        {children}
      </section>
      <Separator className="mx-auto max-w-6xl" />
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
    <div className="grid gap-4 border-t pt-8 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-muted-foreground text-pretty">
        {children}
      </div>
    </div>
  );
}
