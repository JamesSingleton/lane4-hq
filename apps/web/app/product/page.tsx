import { Separator } from "@lane4hq/ui/components/separator";
import Link from "next/link";
import { MarketingCta } from "@/components/marketing-cta";
import { ProductShot } from "@/components/product-shot";
import { PageIntro } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";
import { audienceLinks, productLinks } from "@/lib/site";

export const metadata = pageMetadata(
  "Product",
  "Seed times from best times, the lineup you export, and Sunday's results next to previous best, for high school and club swim coaches.",
  "/product",
);

export default function ProductPage() {
  return (
    <>
      <PageIntro
        title="Keep the host's event file, the lineup, and Sunday's results in one place."
        description="Seeds come from best times. The lineup is the file you export. Results come back next to previous best. The same week for a high school dual and a club invitational."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 md:px-6">
        <ProductShot shot="dashboard" showCaption={false} />
        <p className="text-muted-foreground mt-3 text-sm">
          Sample data in the product. Not a customer team.
        </p>
      </section>
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:grid-cols-2 md:px-6">
        {productLinks.map((item) => (
          <article
            key={item.href}
            className="border-t border-foreground/10 pt-5"
          >
            <Link
              href={item.href}
              className="font-medium underline-offset-4 hover:underline"
            >
              {item.title}
            </Link>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              {item.description}
            </p>
          </article>
        ))}
      </section>
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:grid-cols-2 md:px-6">
        {audienceLinks.map((item) => (
          <div key={item.href} className="border-t pt-6">
            <Link href={item.href} className="font-medium hover:underline">
              {item.title}
            </Link>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              {item.description}
            </p>
          </div>
        ))}
      </section>
      <Separator className="mx-auto max-w-6xl" />
      <MarketingCta />
    </>
  );
}
