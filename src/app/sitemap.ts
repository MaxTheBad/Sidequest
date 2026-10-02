import type { MetadataRoute } from "next";
import { LOCAL_GUIDES } from "@/content/local-guides";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://questhat.com").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    "",
    "/privacy",
    "/support",
    "/child-safety",
    "/terms",
    "/tos",
    "/download",
    "/delete-account",
    ...LOCAL_GUIDES.map((guide) => `/south-florida/${guide.slug}`),
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path ? "monthly" : "daily",
    priority: path ? 0.5 : 1,
  }));
}
