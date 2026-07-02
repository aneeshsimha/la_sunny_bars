/**
 * Curated list of well-known LA rooftop bars/lounges (ANS-236).
 *
 * This is a high-precision signal used alongside (not instead of) the
 * conservative name-pattern match in `derive-metadata.ts`. A venue matches
 * an entry here only when BOTH:
 *   1. its (normalized) name matches the entry's (normalized) name, AND
 *   2. its coords are within ~200m of the entry's coords.
 * The coord guard exists specifically to prevent name collisions — e.g. a
 * generically-named venue ("Perch", "The Penthouse") that happens to share
 * a name with a real rooftop bar but is actually a different, unrelated
 * business elsewhere — from being misclassified as a rooftop.
 *
 * Coordinates for entries confirmed present in the current dataset
 * (public/data/*\/venues.json) are copied verbatim from that data (exact).
 * Coordinates for entries not currently present are approximate, sourced
 * from general knowledge (no network access) — an imprecise guess here is
 * safe by construction: it can only produce a false NEGATIVE (a real
 * rooftop that fails to match), never a false positive, which fits this
 * task's precision-over-recall goal.
 *
 * Only covers the 15 neighborhoods currently shipped:
 * beverly-hills, culver-city, dtla, eagle-rock, echo-park, hollywood,
 * koreatown, los-feliz, mid-wilshire, pasadena, santa-monica, sawtelle,
 * silver-lake, venice, weho.
 */

export interface RooftopVenue {
  /** Canonical name, matched against venue names via normalized substring/token match. */
  name: string;
  /** Approximate [lng, lat]. See file header for precision notes. */
  coords: [number, number];
  /** Covered-neighborhood slug this venue falls in — reference only, not used for matching. */
  neighborhood: string;
}

export const ROOFTOP_VENUES: RooftopVenue[] = [
  // --- DTLA --- (coords confirmed from public/data/dtla/venues.json)
  { name: 'Perch', coords: [-118.2513974, 34.0489443], neighborhood: 'dtla' },
  { name: 'Upstairs at Ace Hotel', coords: [-118.2568638, 34.0417905], neighborhood: 'dtla' },
  { name: 'Broken Shaker', coords: [-118.2565088, 34.0447111], neighborhood: 'dtla' },
  { name: 'Spire73', coords: [-118.2598612, 34.0499384], neighborhood: 'dtla' },
  { name: 'BonaVista Lounge', coords: [-118.2554085, 34.0528019], neighborhood: 'dtla' },
  { name: 'Rooftop at The Standard', coords: [-118.257, 34.049], neighborhood: 'dtla' },

  // --- Beverly Hills ---
  { name: 'The Rooftop by JG', coords: [-118.4008, 34.0668], neighborhood: 'beverly-hills' },

  // --- WeHo ---
  { name: 'E.P. & L.P.', coords: [-118.3818, 34.0838], neighborhood: 'weho' },

  // --- Hollywood --- ("Mama's rooftop" coords confirmed from public/data/hollywood/venues.json)
  { name: "Mama's rooftop", coords: [-118.3314153, 34.0996297], neighborhood: 'hollywood' },
  { name: 'Highlight Room', coords: [-118.3396, 34.1017], neighborhood: 'hollywood' },
  { name: "Harriet's Rooftop", coords: [-118.3255, 34.1016], neighborhood: 'hollywood' },
  { name: 'WET Deck', coords: [-118.3267, 34.1016], neighborhood: 'hollywood' },

  // --- Santa Monica --- (coords confirmed from public/data/santa-monica/venues.json)
  { name: 'The Penthouse', coords: [-118.5011637, 34.0187198], neighborhood: 'santa-monica' },
];

const COORD_GUARD_METERS = 200;
const METERS_PER_DEG_LAT = 111_320;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos((a[1] * Math.PI) / 180);
  const dLng = (a[0] - b[0]) * METERS_PER_DEG_LAT * cosLat;
  const dLat = (a[1] - b[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

/**
 * Returns true if (name, coords) matches a curated rooftop venue: the
 * normalized names overlap AND the coords are within COORD_GUARD_METERS
 * of the curated entry's coords.
 */
export function classifyRooftop(name: string, coords: [number, number]): boolean {
  const normalizedName = normalize(name);
  if (normalizedName.length === 0) return false;

  for (const entry of ROOFTOP_VENUES) {
    const normalizedEntry = normalize(entry.name);
    const namesOverlap =
      normalizedName.includes(normalizedEntry) || normalizedEntry.includes(normalizedName);
    if (!namesOverlap) continue;

    if (distanceMeters(coords, entry.coords) <= COORD_GUARD_METERS) {
      return true;
    }
  }

  return false;
}
