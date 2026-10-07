# Google Places search

Search checks the project's own data first, then Google Places (if a key is set), otherwise OpenStreetMap + Open-Meteo.

## Setup
1. Google Cloud Console -> create/select a project -> **enable "Places API (New)"** -> turn on billing.
2. APIs & Services -> Credentials -> **Create API key**. Restrict it: *API restrictions* = Places API (New) only.
   (Server keys can't be limited by website; if your host has fixed IPs you can add an IP restriction.)
3. Set a **budget alert** and a daily **quota cap** for Places API (New) in the console.
4. Set `GOOGLE_MAPS_API_KEY` in Railway -> Variables (and in `.env.local` for local dev). Redeploy.
   Never use a `NEXT_PUBLIC_` prefix: the key must stay server-side.
5. Kill switch: set `GOOGLE_PLACES_DISABLED=1` to fall back to the free search without removing the key.

## How it works / cost controls
- `/api/search` calls Places **Autocomplete (New)** once the query is 3+ characters (debounced 250 ms), biased to Osun, limited to Nigeria.
- Our own results are shown first; Google fills the rest. Identical queries are cached for 10 minutes.
- Coordinates are fetched with **Place Details** (`/api/search/place`) only when a Google suggestion is picked.
  A session token links the typing and the pick so Google bills them as one session.
- If Google errors (bad key, API not enabled, quota), the route logs it and falls back to the free search automatically.
  Check Railway logs for "Google Places autocomplete failed".

## Terms - check before launch
Google's Maps Platform terms restrict showing Places content on a **non-Google map**, and this app uses MapLibre/OpenStreetMap tiles.
Review the current Google Maps Platform Terms of Service and Places policies (including the "Powered by Google" attribution, which the
dropdown shows) and decide whether this use is permitted for your case. Pricing also changes: check the current Places API (New) rates.
