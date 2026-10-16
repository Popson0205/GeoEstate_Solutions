GeoEstate GeoAI LGA Poster - patch (UI redesign of the GeoAI panel)
Unzip over your project folder (same relative paths). No new npm packages.

Changed in this drop (on top of the poster patch):
  components/GeoAIPanel.tsx  Redesigned panel: clearer layout, loading/empty/error states, rank badge,
                             zone bar, grouped actions, ZIP progress with Stop, drag-and-drop CSV, keyboard + screen-reader support.
  app/globals.css            Only the "GeoAI panel" block was replaced (everything above it is untouched).
Unchanged: lib/*, app/api/*, public/*, GEOAI.md. All figures and poster output are exactly as before.

Then: npm run dev, open GeoAI, analyse an LGA, click "Poster A2 (JPEG)".
