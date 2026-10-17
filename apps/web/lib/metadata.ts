import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/** Page title, description, and social cards. The root layout supplies the title template. */
export function pageMetadata(title: string, description: string): Metadata {
  const socialTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}
