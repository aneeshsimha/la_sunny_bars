"use client";

import { VenueFeature } from "@/state/types";

interface VenueCardProps {
  venue: VenueFeature;
  rank: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function VenueCard({
  venue,
  rank,
  isSelected,
  onClick,
}: VenueCardProps) {
  const sunny = venue.directSun >= 0.5;

  return (
    <div
      data-venue-id={venue.id}
      className={`venue-card ${sunny ? "sunny" : "shaded"}${isSelected ? " selected" : ""}`}
      onClick={onClick}
    >
      <span className="venue-rank">{rank}</span>
      <span className={`venue-sun-indicator ${sunny ? "sunny" : "shaded"}`} />
      <div className="venue-info">
        <div className="venue-name">{venue.name}</div>
        <div className="venue-meta">
          {venue.amenity}
          {venue.cuisine ? ` · ${venue.cuisine}` : ""}
          {venue.rating != null ? ` · ★ ${venue.rating.toFixed(1)}` : ""}
          {venue.priceLevel != null ? ` · ${"$".repeat(venue.priceLevel)}` : ""}
        </div>
        <div className="venue-supporting">
          Score {Math.round(venue.sunScore)}
          {venue.sunUntil
            ? ` · sunny until ${venue.sunUntil}`
            : ` · open sky ${Math.round(venue.skyExposure * 100)}%`}
          {venue.seatingType != null && (
            <span className="venue-seating-badge">
              {venue.seatingType.charAt(0).toUpperCase() + venue.seatingType.slice(1)}
            </span>
          )}
          {venue.confidence === 'low' && (
            <span className="venue-confidence-estimate">estimate</span>
          )}
        </div>
      </div>
      <div className="venue-side">
        <span className={`venue-status ${sunny ? "sunny" : "shaded"}`}>
          {sunny ? "Sun now" : "Shade now"}
        </span>
        <div className="venue-score-number">{Math.round(venue.sunScore)}</div>
      </div>
    </div>
  );
}
