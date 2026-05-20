import type { MetadataRoute } from "next";
import { neighborhoods } from "@/lib/neighborhoods";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const neighborhoodUrls: MetadataRoute.Sitemap = neighborhoods.map((n) => ({
    url: `${BASE_URL}/neighborhoods/${n.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      changeFrequency: "always",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/neighborhoods`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...neighborhoodUrls,
  ];
}
