"use client";

import { VenueFeature } from "@/state/types";
import { openTableUrl, resyUrl } from "@/lib/reservations";
import { useTimeStore } from "@/state/timeStore";
import SunTimeline from "@/components/venue/SunTimeline";

interface VenueDetailProps {
  venue: VenueFeature | null;
  onClose: () => void;
}

export default function VenueDetail({ venue, onClose }: VenueDetailProps) {
  const selectedDate = useTimeStore((s) => s.selectedDate);

  if (!venue) return null;

  const sunny = venue.directSun >= 0.5;
  const [venueLng, venueLat] = venue.coordinates;

  return (
    <div className="venue-detail">
      <button
        className="venue-detail-close"
        type="button"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>

      <div className="venue-detail-name">{venue.name}</div>

      <div className="venue-detail-type">
        {venue.amenity}
        {venue.cuisine ? ` · ${venue.cuisine}` : ""}
      </div>

      <div className="venue-detail-meta-row">
        {venue.rating != null && (
          <span className="venue-detail-pill">★ {venue.rating.toFixed(1)}{venue.reviewCount != null ? ` (${venue.reviewCount})` : ""}</span>
        )}
        {venue.priceLevel != null && (
          <span className="venue-detail-pill">{"$".repeat(venue.priceLevel)}</span>
        )}
        {venue.seatingType != null && (
          <span className="venue-detail-pill">{venue.seatingType.charAt(0).toUpperCase() + venue.seatingType.slice(1)}</span>
        )}
        {venue.openNow != null && (
          <span className={`venue-detail-pill ${venue.openNow ? "open-now" : "closed-now"}`}>
            {venue.openNow ? "Open now" : "Closed"}
          </span>
        )}
      </div>

      {venue.drinkTypes.length > 0 && (
        <div className="venue-detail-meta-row">
          {venue.drinkTypes.map((d) => (
            <span key={d} className="venue-detail-pill drink-type">{d}</span>
          ))}
        </div>
      )}

      <div
        className={`venue-detail-status ${sunny ? "sunny" : "shaded"}`}
      >
        <span className={`venue-sun-indicator ${sunny ? "sunny" : "shaded"}`} />
        {sunny ? "In Sun" : "In Shade"}
      </div>

      <div className="venue-detail-score">
        Sun score <strong>{Math.round(venue.sunScore)}</strong>/100
        {venue.sunUntil ? ` · sunny until ${venue.sunUntil}` : ""}
      </div>

      <div className="venue-detail-breakdown">
        <span>Now {Math.round(venue.directSun * 100)}%</span>
        <span>Next 90 min {Math.round(venue.futureSun * 100)}%</span>
        <span>Open sky {Math.round(venue.skyExposure * 100)}%</span>
      </div>

      <SunTimeline
        venueId={String(venue.id)}
        venueLat={venueLat}
        venueLng={venueLng}
        date={selectedDate}
      />

      {venue.website && (
        <a
          className="venue-detail-link"
          href={venue.website}
          target="_blank"
          rel="noopener"
        >
          Visit Website →
        </a>
      )}

      <div className="venue-detail-reservations">
        <a
          className="venue-detail-link"
          href={openTableUrl(venue.name)}
          target="_blank"
          rel="noopener"
        >
          Reserve · OpenTable →
        </a>
        <a
          className="venue-detail-link"
          href={resyUrl(venue.name)}
          target="_blank"
          rel="noopener"
        >
          Reserve · Resy →
        </a>
      </div>
    </div>
  );
}
