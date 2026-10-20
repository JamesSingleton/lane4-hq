import { FaqList } from "@/components/faq-list";
import { MarketingCta } from "@/components/marketing-cta";
import { PageIntro } from "@/components/section";
import { pageMetadata } from "@/lib/metadata";
import { faqs, SITE_NAME } from "@/lib/site";

export const metadata = pageMetadata(
  "FAQ",
  "Open beta, meet files, high school limits, plans, and what Lane4 HQ does not do.",
  "/faq",
);

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: `${SITE_NAME} FAQ`,
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageIntro
        title="Questions before you move a team over."
        description="The coach workspace is in open beta. The desktop meet manager for hosts is not."
      />
      <section className="mx-auto w-full max-w-3xl px-4 pb-8 md:px-6">
        <FaqList />
      </section>
      <MarketingCta />
    </>
  );
}
