import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readFileSync } from "fs";
import path from "path";
import Link from "next/link";
import { neighborhoods, type Neighborhood } from "@/lib/neighborhoods";
import "../neighborhoods.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Venue {
  id: string;
  name: string;
  coords: [number, number];
  amenity: string;
  cuisine: string | null;
  outdoor_seating: "yes" | "no" | "unknown" | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  placesId: string | null;
  rating: number | null;
  priceLevel: number | null;
  reviewCount: number | null;
  photoRef: string | null;
  openNow: boolean | null;
  seatingType: string | null;
  drinkTypes: string[];
}

interface VenueManifest {
  slug: string;
  generatedAt: string;
  count: number;
  venues: Venue[];
}

// ---------------------------------------------------------------------------
// Static params — one page per neighborhood
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return neighborhoods.map((n) => ({ slug: n.slug }));
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadVenueManifest(slug: string): VenueManifest | null {
  const filePath = path.join(process.cwd(), "public", "data", slug, "venues.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as VenueManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const neighborhood = neighborhoods.find((n) => n.slug === slug);
  if (!neighborhood) return {};

  const manifest = loadVenueManifest(slug);
  const venueCount = manifest?.count ?? 0;
  const description =
    venueCount > 0
      ? `Discover ${venueCount} bars and restaurant patios in ${neighborhood.name}, LA — ranked by sun exposure. Find the sunniest outdoor seating near you.`
      : `Find the best sunny patios and outdoor bars in ${neighborhood.name}, Los Angeles.`;

  return {
    title: `Best sunny patios in ${neighborhood.name} — LA Sunny Bars`,
    description,
    openGraph: {
      title: `Best sunny patios in ${neighborhood.name}`,
      description,
      url: `/neighborhoods/${slug}`,
      siteName: "LA Sunny Bars",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `Best sunny patios in ${neighborhood.name}`,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanText(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  const text = value.trim();
  return text ? text : null;
}

function cleanWebsite(value: string | null | undefined): string | null {
  const website = cleanText(value);
  if (!website) return null;
  if (website.startsWith("http://") || website.startsWith("https://")) {
    return website;
  }
  return `https://${website}`;
}

function titleCaseAmenity(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCuisine(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(";")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(", ");
}

function outdoorLabel(value: "yes" | "no" | "unknown"): string {
  if (value === "yes") return "Confirmed patio";
  if (value === "no") return "No patio tagged";
  return "Patio unknown";
}

function venueRankScore(venue: Venue): number {
  const amenityPriority: Record<string, number> = {
    bar: 30,
    pub: 28,
    restaurant: 22,
    cafe: 16,
  };

  return (
    (venue.outdoor_seating === "yes" ? 100 : venue.outdoor_seating === "unknown" ? 35 : 0) +
    (amenityPriority[venue.amenity] ?? 10) +
    (venue.rating !== null ? Math.round(venue.rating * 4) : 0) +
    (venue.reviewCount !== null && venue.reviewCount > 50 ? 10 : 0) +
    (venue.website ? 8 : 0) +
    (venue.opening_hours ? 6 : 0) +
    (venue.cuisine ? 4 : 0)
  );
}

function formatRating(rating: number | null): string | null {
  if (rating === null) return null;
  return rating.toFixed(1);
}

// ---------------------------------------------------------------------------
// JSON-LD structured data
// ---------------------------------------------------------------------------

function buildJsonLd(
  neighborhood: Neighborhood,
  topVenues: Venue[]
): object {
  const items = topVenues.slice(0, 5).map((v, i) => ({
    "@type": "LocalBusiness",
    position: i + 1,
    name: v.name,
    servesCuisine: formatCuisine(v.cuisine) ?? undefined,
    telephone: v.phone ?? undefined,
    url: cleanWebsite(v.website) ?? undefined,
    ...(v.rating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: v.rating,
            reviewCount: v.reviewCount ?? 1,
          },
        }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: neighborhood.name,
      addressRegion: "CA",
      addressCountry: "US",
    },
  }));

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best sunny patios in ${neighborhood.name}`,
    description: `Top bars and restaurant patios in ${neighborhood.name}, Los Angeles, ranked by sun exposure.`,
    url: `https://lasunnybars.com/neighborhoods/${neighborhood.slug}`,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NeighborhoodPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const neighborhood: Neighborhood | undefined = neighborhoods.find(
    (n) => n.slug === slug
  );
  if (!neighborhood) notFound();

  const manifest = loadVenueManifest(slug);
  if (!manifest) notFound();

  const allVenues = manifest.venues;

  const confirmedPatios = allVenues.filter((v) => v.outdoor_seating === "yes").length;
  const patioUnknown = allVenues.filter((v) => v.outdoor_seating === "unknown").length;
  const withOpeningHours = allVenues.filter((v) => v.opening_hours).length;
  const withRatings = allVenues.filter((v) => v.rating !== null).length;

  const topVenues = allVenues
    .filter((v) => v.outdoor_seating !== "no")
    .sort((a, b) => {
      const diff = venueRankScore(b) - venueRankScore(a);
      if (diff !== 0) return diff;
      return (a.name ?? "").localeCompare(b.name ?? "");
    })
    .slice(0, 10);

  const mapHref = `/?focus=${slug}`;
  const jsonLd = buildJsonLd(neighborhood, topVenues);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="nbhd-root">
        <nav className="nbhd-nav">
          <Link href="/" className="nbhd-nav-back">
            ← Live Map
          </Link>
          <span className="nbhd-nav-sep">/</span>
          <Link href="/neighborhoods" className="nbhd-nav-back">
            Neighborhoods
          </Link>
          <span className="nbhd-nav-sep">/</span>
          <span className="nbhd-nav-current">{neighborhood.name}</span>
        </nav>

        <header className="nbhd-hero">
          <p className="nbhd-eyebrow">LA Sunny Bars</p>
          <h1 className="nbhd-title">Best sunny patios in {neighborhood.name}</h1>
          <p className="nbhd-subtitle">
            {manifest.count} venue{manifest.count !== 1 ? "s" : ""} in {neighborhood.name} —
            confirmed patios listed first, ranked by sun exposure and available ratings.
          </p>
          <Link href={mapHref} className="nbhd-map-link">
            Open on Live Map →
          </Link>
        </header>

        <section className="nbhd-stats" aria-label={`${neighborhood.name} venue data summary`}>
          <div className="nbhd-stat">
            <span className="nbhd-stat-value">{manifest.count}</span>
            <span className="nbhd-stat-label">total venues</span>
          </div>
          <div className="nbhd-stat">
            <span className="nbhd-stat-value">{confirmedPatios}</span>
            <span className="nbhd-stat-label">confirmed patios</span>
          </div>
          <div className="nbhd-stat">
            <span className="nbhd-stat-value">{withRatings}</span>
            <span className="nbhd-stat-label">with ratings</span>
          </div>
          <div className="nbhd-stat">
            <span className="nbhd-stat-value">{withOpeningHours}</span>
            <span className="nbhd-stat-label">with hours</span>
          </div>
        </section>

        <section className="nbhd-section">
          {topVenues.length === 0 ? (
            <p className="nbhd-empty">
              No likely patio candidates were found in {neighborhood.name}. Try the{" "}
              <Link href={mapHref} className="nbhd-inline-link">
                live map
              </Link>
              .
            </p>
          ) : (
            <>
              <h2 className="nbhd-section-heading">Top Venues</h2>
              <ol className="nbhd-venue-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {topVenues.map((v, i) => {
                  const outdoorSeating = v.outdoor_seating ?? "unknown";
                  const website = cleanWebsite(v.website);
                  const rating = formatRating(v.rating);
                  const cuisine = formatCuisine(v.cuisine);

                  return (
                    <li
                      key={v.id}
                      className={`nbhd-venue-card${
                        outdoorSeating === "unknown" ? " uncertain" : ""
                      }`}
                    >
                      <span className="nbhd-rank">{i + 1}</span>
                      <div className="nbhd-venue-info">
                        <div className="nbhd-venue-row">
                          <div className="nbhd-venue-name">{v.name}</div>
                          <span className={`nbhd-patio-badge ${outdoorSeating}`}>
                            {outdoorLabel(outdoorSeating)}
                          </span>
                        </div>
                        <div className="nbhd-venue-meta">
                          {titleCaseAmenity(v.amenity)}
                          {cuisine ? ` · ${cuisine}` : ""}
                          {rating ? ` · ★ ${rating}${v.reviewCount ? ` (${v.reviewCount})` : ""}` : ""}
                        </div>
                        <div className="nbhd-venue-detail">
                          {v.opening_hours ? v.opening_hours : "Hours not listed"}
                        </div>
                        {website ? (
                          <a
                            href={website}
                            className="nbhd-venue-link"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Website
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>

        <p className="nbhd-notice">
          Venue data sourced from OpenStreetMap and enriched with Google Places ratings.{" "}
          {patioUnknown} venue{patioUnknown !== 1 ? "s" : ""} have unknown patio status — these
          are included above when ranked highly. For real-time sun and shadow scoring, open the{" "}
          <Link href={mapHref} className="nbhd-inline-link">
            live map
          </Link>
          .
        </p>
      </div>
    </>
  );
}
