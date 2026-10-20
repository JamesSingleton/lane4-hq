import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

const SITE_ORIGIN = "https://www.lane4hq.com";

/** Page title, description, canonical URL, and social cards. */
export function pageMetadata(
  title: string,
  description: string,
  path?: string,
): Metadata {
  const socialTitle = `${title} | ${SITE_NAME}`;
  const url = path ? `${SITE_ORIGIN}${path}` : SITE_ORIGIN;
  return {
    title,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title: socialTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}
