import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { neighborhoods, type Neighborhood } from "@/lib/neighborhoods";
import SunCalc from "suncalc";
import "../neighborhoods.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VenueFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name: string | null;
    amenity: string | null;
    cuisine: string | null;
    [key: string]: unknown;
  };
}

interface ScoredVenue {
  name: string;
  amenity: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Static params — one page per neighborhood
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return neighborhoods.map((n) => ({ slug: n.slug }));
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
  return {
    title: `Sunny Bars in ${neighborhood.name} — LA Sunny Bars`,
    description: `Top sunny bars and restaurant patios in ${neighborhood.name}, Los Angeles. Ranked by sun score at build time.`,
  };
}

// ---------------------------------------------------------------------------
// Score computation
//
// Building data is not statically available, so we cannot run the full shadow
// pipeline here. Instead we use sun altitude as a proxy: if the sun is up, every
// venue in the bbox gets Math.round(50 + altitude_degrees * 0.5); otherwise 0.
// The real-time per-building score lives on the interactive map at /.
// ---------------------------------------------------------------------------

function computePlaceholderScore(
  altitude: number /* radians */
): number {
  if (altitude <= 0) return 0;
  const altitudeDegrees = altitude * (180 / Math.PI);
  return Math.round(50 + altitudeDegrees * 0.5);
}

function isInBbox(
  lng: number,
  lat: number,
  bbox: [number, number, number, number]
): boolean {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
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

  // Read venues at build time from the public directory.
  const geojsonPath = path.join(process.cwd(), "public", "data", "venues.geojson");
  const raw = await fs.readFile(geojsonPath, "utf-8");
  const geojson = JSON.parse(raw) as { features: VenueFeature[] };

  // Filter to venues within this neighborhood's bounding box.
  const inBbox = geojson.features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return isInBbox(lng, lat, neighborhood.bbox);
  });

  // Compute sun altitude for the neighborhood center at build time.
  const buildTime = new Date();
  const [centerLng, centerLat] = neighborhood.center;
  const sunPos = SunCalc.getPosition(buildTime, centerLat, centerLng) as {
    altitude: number;
    azimuth: number;
  };

  // Score and sort venues.
  const score = computePlaceholderScore(sunPos.altitude);
  const scored: ScoredVenue[] = inBbox
    .filter((f) => f.properties.name)
    .map((f) => ({
      name: f.properties.name as string,
      amenity: f.properties.amenity ?? "venue",
      score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const sunUp = sunPos.altitude > 0;
  const buildTimeStr = buildTime.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
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
        <h1 className="nbhd-title">
          {sunUp ? "Sunny" : "Shaded"} Bars in {neighborhood.name}
        </h1>
        <p className="nbhd-subtitle">
          {inBbox.length} venue{inBbox.length !== 1 ? "s" : ""} found in{" "}
          {neighborhood.name}. Top 10 ranked by sun score at build time.
        </p>
        <Link href={`/?focus=${slug}`} className="nbhd-map-link">
          Open on Live Map →
        </Link>
      </header>

      <section className="nbhd-section">
        {scored.length === 0 ? (
          <p className="nbhd-empty">
            No named venues found in {neighborhood.name} at build time. Try the{" "}
            <Link href="/" style={{ color: "var(--color-sun)" }}>
              live map
            </Link>
            .
          </p>
        ) : (
          <>
            <h2 className="nbhd-section-heading">Top Venues by Sun Score</h2>
            <ol className="nbhd-venue-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {scored.map((v, i) => (
                <li
                  key={`${v.name}-${i}`}
                  className={`nbhd-venue-card${v.score === 0 ? " no-sun" : ""}`}
                >
                  <span className="nbhd-rank">{i + 1}</span>
                  <div className="nbhd-venue-info">
                    <div className="nbhd-venue-name">{v.name}</div>
                    <div className="nbhd-venue-meta">{v.amenity}</div>
                  </div>
                  <span className={`nbhd-score${v.score === 0 ? " no-sun" : ""}`}>
                    {v.score}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="nbhd-notice">
        Sun scores are a static build-time snapshot computed from sun altitude at{" "}
        {buildTimeStr} (LA time). Building shadows are not included — for real-time
        scores see the{" "}
        <Link href="/" style={{ color: "var(--color-sun)" }}>
          live map
        </Link>
        .
      </p>
    </div>
  );
}
