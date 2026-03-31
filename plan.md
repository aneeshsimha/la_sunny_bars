# LA Sunny Bars — Plan

Show which bar/restaurant patios in LA are getting sunlight at any given time/day/season.

---

## Core Functionality

1. **3D map of LA** with extruded buildings
2. **Sun simulation** — accurate sun position for any time, day, and season (solar azimuth + elevation)
3. **Directional lighting** on buildings updates as you change the time
4. **Time slider** — scrub from sunrise to sunset
5. **Date picker** — change the date to see how shadows shift across seasons
6. **Venue markers** — bars/restaurants with outdoor seating, colored by whether they're in sun or shade
7. **Click a venue** for name + sunlight status

---

## Tech Stack (All Free / Public)

| Component | Tool | Cost |
|-----------|------|------|
| Framework | Next.js | Free |
| Map | Mapbox GL JS | Free (50k loads/mo) |
| Sun math | `suncalc` (npm) | Free |
| Building data | Mapbox vector tiles (built-in 3D buildings) | Included with Mapbox |
| Shadow geometry | Turf.js + custom projection math | Free |
| Venue data | OpenStreetMap via Overpass API | Free |
| Hosting | Vercel | Free tier |

**No paid APIs.** Venue data comes from OSM (free, public). Building data comes from Mapbox's built-in building layer. Sun math is a client-side library.

---

## How It Works

### Sun Position
- `suncalc.getPosition(date, lat, lng)` → returns azimuth and altitude
- `suncalc.getTimes(date, lat, lng)` → returns sunrise, sunset, golden hour, etc.
- LA coordinates: 34.0522°N, 118.2437°W
- These values change correctly across seasons automatically

### Building Shadows
- Mapbox `fill-extrusion` layer renders 3D buildings with directional light
- Set Mapbox light source azimuth + altitude from `suncalc` output → buildings visually show sun/shade faces
- For **scoring venues**: compute shadow polygons geometrically
  - For each building near a venue: project footprint along the sun vector based on building height and sun elevation
  - Use Turf.js for polygon operations (transform, union, point-in-polygon)
  - Check if venue point falls in any shadow polygon → shaded or sunny

### Venue Data (OSM via Overpass API)
- Query: all nodes/ways tagged `amenity=bar` or `amenity=restaurant` with `outdoor_seating=yes` in the target area
- Overpass query is free with no API key needed
- Cache results as static GeoJSON (venues don't change often)
- If OSM coverage is sparse for LA patios, we can supplement by also pulling all bars/restaurants (without the outdoor_seating filter) and letting users filter

### Sunlight Scoring
- For each venue at the selected time:
  - Gather nearby buildings (within ~200m)
  - Project shadow polygons from sun angle
  - Test if venue point is inside any shadow → binary: sunny or shaded
- Color venue dot accordingly

---

## MVP Scope

**One neighborhood to start** — pick an area with good OSM data and lots of patios. Candidates:
- DTLA (dense, well-mapped)
- West Hollywood (lots of bars/patios)
- Silver Lake / Echo Park
- Santa Monica / Venice (lots of outdoor dining)

### MVP Checklist
- [x] Next.js app with Mapbox 3D map
- [x] `suncalc`-driven directional lighting on buildings
- [x] Time slider (sunrise → sunset for selected date)
- [x] Date picker
- [x] Venue dots from OSM Overpass query
- [x] Shadow-based sunlight scoring per venue
- [x] Dot color = sunny vs shaded
- [x] Click popup with venue name + status
- [x] 3D rendering and shadow casting dialed in

---

## v2 Features (In Progress)

### Rankings
- [ ] Venue ranking system — scored list in sidebar/panel
- [ ] Sunlight score per venue (e.g. 0–100 scale)
- [ ] "TOP" badge for highest-ranked venues
- [ ] Sort by: sun score, rating, distance

### Drink Types
- [ ] Tag venues with drink categories (Cocktails, Beer, Wine, etc.)
- [ ] Display drink types on venue cards and popups
- [ ] Filter venues by drink type

### Seating Type Filters
- [ ] Query and display seating type: **Patio**, **Sidewalk**, **Rooftop**
- [ ] Filter tabs at top of venue list (All / Rooftop / Patio / Sidewalk / Bar)
- [ ] Show seating type in venue popup and list cards

### Venue List Panel
- [ ] Ranked sidebar list (desktop) / bottom sheet (mobile) with venue cards
- [ ] Each card shows: rank, name, type, rating, price range, drink types, seating type, sun score
- [ ] "Sun til X:XX PM" — predict how long venue stays sunny
- [ ] Sun/shade count stats (e.g. "50 in sun · 31 shade")
- [ ] "Sun Only" toggle filter

### Venue Detail Popup
- [ ] Rating + review count
- [ ] Price range ($$, $$$, etc.)
- [ ] Drink types (Beer, Wine, Cocktails)
- [ ] Seating type (Patio / Sidewalk / Rooftop)
- [ ] Sun status with seating context (e.g. "In Sun · sidewalk")
- [ ] "Visit Website" link

### Search & Navigation
- [ ] Search bar to find venues by name
- [ ] "Now" button — jump to current time
- [ ] Play button — animate time progression
- [ ] Neighborhood selector

### UI / Responsiveness
- [ ] Mobile-responsive layout (map top, controls + list bottom)
- [ ] Desktop layout with sidebar venue list
- [ ] Polished time slider with 6a–9p labels
- [ ] Dark theme with orange/amber accents

---

## Future Features (Backlog)
- [ ] User ratings / community data
- [ ] Happy hour info
- [ ] Opening hours integration
- [ ] Favorites / bookmarking
- [ ] Share a venue link
- [ ] Push notifications ("your saved bar just hit sun")

---

## Known Limitations (OK for v1)
- **Trees/awnings** cast shadows we can't model — acknowledged
- **Hills/terrain** not accounted for in shadow calc — fine for flat areas like DTLA, WeHo
- **Patio exact location** unknown — using venue coordinates (close enough for most street-side patios)
- **OSM coverage** may miss some venues — can improve over time

---

## Implementation Order

### Phase 1 — MVP (Done)
1. **Scaffold** — Next.js + Mapbox GL JS, render a 3D map of LA
2. **Sun lighting** — Wire `suncalc` to Mapbox light, add time slider + date picker
3. **Venue data** — Overpass API query for bars/restaurants with patios, render as dots
4. **Shadow scoring** — Compute building shadow polygons, score venues, color dots

### Phase 2 — Rankings & Filters (Current)
5. **Venue data enrichment** — Drink types, seating types (patio/sidewalk/rooftop), ratings, price range
6. **Rankings** — Sunlight scoring system, ranked venue list
7. **Filters** — Seating type tabs, drink type filters, "Sun Only" toggle

### Phase 3 — UI Polish
8. **Venue list panel** — Sidebar (desktop) + bottom sheet (mobile) with ranked cards
9. **Enhanced popups** — Rich venue detail with all metadata
10. **Search + controls** — Search bar, "Now" button, play/animate, neighborhood selector
11. **Responsive design** — Mobile-first layout, dark theme polish

### Phase 4 — Deploy & Iterate
12. **Deploy to Vercel**
13. **Community features** — User ratings, favorites, sharing
