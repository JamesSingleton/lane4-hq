import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const paths = [
  "/",
  "/product",
  "/product/roster",
  "/product/meets",
  "/product/workouts",
  "/product/calendar",
  "/product/progression",
  "/product/analytics",
  "/formats",
  "/pricing",
  "/compare",
  "/faq",
  "/story",
  "/support",
  "/privacy",
  "/terms",
  "/for/club",
  "/for/high-school",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "www.lane4hq.com";
  const protocol = host.includes("localhost") ? "http" : "https";

  return paths.map((path) => ({
    url: `${protocol}://${host}${path}`,
    lastModified: new Date(),
  }));
}
