import type { Metadata } from "next";
import Link from "next/link";
import { neighborhoods } from "@/lib/neighborhoods";
import "./neighborhoods.css";

export const metadata: Metadata = {
  title: "Sunny Bars by Neighborhood — LA Sunny Bars",
  description:
    "Browse the sunniest bars and restaurant patios by LA neighborhood — Silver Lake, Venice, WeHo, DTLA, and more.",
};

export default function NeighborhoodsPage() {
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
          Top sun‑soaked venues in each LA neighborhood, ranked by sun score.
        </p>
      </header>

      <div className="nbhd-grid">
        {neighborhoods.map((n) => (
          <Link key={n.slug} href={`/neighborhoods/${n.slug}`} className="nbhd-card">
            <p className="nbhd-card-label">Neighborhood</p>
            <p className="nbhd-card-name">{n.name}</p>
            <p className="nbhd-card-link">View top venues →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
