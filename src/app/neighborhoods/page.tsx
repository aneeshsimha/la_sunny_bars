import type { Metadata } from "next";
import { readFileSync } from "fs";
import path from "path";
import Link from "next/link";
import { neighborhoods } from "@/lib/neighborhoods";
import "./neighborhoods.css";

export const metadata: Metadata = {
  title: "Sunny Bars by Neighborhood — LA Sunny Bars",
  description:
    "Browse the sunniest bars and restaurant patios by LA neighborhood — Silver Lake, Venice, WeHo, DTLA, and more.",
};

function getVenueCount(slug: string): number | null {
  try {
    const filePath = path.join(process.cwd(), "public", "data", slug, "venues.json");
    const raw = readFileSync(filePath, "utf-8");
    const manifest = JSON.parse(raw) as { count?: number };
    return typeof manifest.count === "number" ? manifest.count : null;
  } catch {
    return null;
  }
}

function formatCenter(center: [number, number]): string {
  const [lng, lat] = center;
  const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`;
  const lngStr = `${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lngStr}`;
}

export default function NeighborhoodsPage() {
  const neighborhoodsWithCounts = neighborhoods.map((n) => ({
    ...n,
    venueCount: getVenueCount(n.slug),
  }));

  return (
    <div className="nbhd-root">
      <nav className="nbhd-nav">
        <Link href="/" className="nbhd-nav-back">
          ← Live Map
        </Link>
      </nav>

      <header className="nbhd-index-hero">
        <p className="nbhd-eyebrow">LA Sunny Bars</p>
        <h1 className="nbhd-index-title">Sunny Patios by Neighborhood</h1>
        <p className="nbhd-index-sub">
          Top sun-soaked venues in each LA neighborhood, ranked by sun score.
        </p>
      </header>

      <div className="nbhd-grid">
        {neighborhoodsWithCounts.map((n) => (
          <Link key={n.slug} href={`/neighborhoods/${n.slug}`} className="nbhd-card">
            <p className="nbhd-card-label">Neighborhood</p>
            <p className="nbhd-card-name">{n.name}</p>
            <p className="nbhd-card-center">{formatCenter(n.center)}</p>
            {n.venueCount !== null ? (
              <p className="nbhd-card-count">{n.venueCount} venues</p>
            ) : null}
            <p className="nbhd-card-link">View top venues →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
