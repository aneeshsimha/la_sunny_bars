# LA Sunny Bars — Production QA Checklist

## Mobile / Browser

- [ ] Map loads on iOS Safari
- [ ] Map loads on Android Chrome
- [ ] PWA install prompt appears
- [ ] Geolocation works and auto-selects neighborhood
- [ ] Time slider updates venue colors in real-time
- [ ] Neighborhood switch loads new data in <2s

## SEO / Structured Data

- [ ] SEO pages have correct structured data

## Build Hygiene

- [ ] No console errors in production build
- [ ] Mapbox token not exposed in client bundle (check with: `grep -r "pk.eyJ" .next/`)
