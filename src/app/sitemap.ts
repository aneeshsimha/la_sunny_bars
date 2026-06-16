import type { MetadataRoute } from "next";
import { readFileSync } from "fs";
import path from "path";
import { neighborhoods } from "@/lib/neighborhoods";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lasunnybars.com";

function getNeighborhoodLastModified(slug: string): Date {
  try {
    const filePath = path.join(process.cwd(), "public", "data", slug, "venues.json");
    const raw = readFileSync(filePath, "utf-8");
    const manifest = JSON.parse(raw) as { generatedAt?: string };
    if (manifest.generatedAt) {
      const d = new Date(manifest.generatedAt);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // fall through
  }
  return new Date();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const neighborhoodUrls: MetadataRoute.Sitemap = neighborhoods.map((n) => ({
    url: `${BASE_URL}/neighborhoods/${n.slug}`,
    lastModified: getNeighborhoodLastModified(n.slug),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "always",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/neighborhoods`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...neighborhoodUrls,
  ];
}
