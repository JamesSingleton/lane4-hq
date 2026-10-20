import { HomePage } from "@/components/home-page";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: "https://www.lane4hq.com",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    description:
      "Open beta. A Free plan is included. Dollar prices for paid plans are not listed on this site.",
    url: "https://www.lane4hq.com/pricing",
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage />
    </>
  );
}
