# Deployment

Backend runs on Render (free tier). The web app runs on Vercel. Database and auth stay on Supabase. Railway is retired, we don't use it anymore.

## 1. Render (backend)

1. Sign in at **render.com** with GitHub.
2. **New → Blueprint** → pick the linkdup repo. Render reads `render.yaml` at the repo root and creates the `linkdup-api` web service (free plan, Virginia, root dir `server`).
3. Render asks for every variable marked `sync: false`. Fill them in from your own notes:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_MAPS_API_KEY`
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI` = `https://<your-service>.onrender.com/api/calendar/oauth/callback`
   - `CORS_ORIGIN` = your Vercel URL(s), comma separated, no trailing slash. Example: `https://linkdup.vercel.app,https://www.linkdup.app`
4. Don't set `PORT`. Render sets it for you.
5. `ENABLE_GEMINI_PITCHES` is `"false"` in the blueprint, so venue pitches use the plain fallback text and Gemini is never called. Only flip it to `true` (and add `GEMINI_API_KEY`) if we decide to pay for it.
6. After the first deploy, open `https://<your-service>.onrender.com/healthz`. It should return `{"ok":true}`.

The server refuses to start in production if `CORS_ORIGIN` is missing. If a deploy fails right away, check that first in the Render logs.

Every push to the deploy branch redeploys automatically (`autoDeployTrigger: commit`).

## 2. Supabase

Nothing changes in the project itself. Run `server/src/db/migrations/031_photo_proxy_urls.sql` once in the Supabase SQL editor. It replaces old photo URLs that had the Maps key in them with `/api/photo?name=...` links, and clears old-style photo references (those can't be loaded anymore, so the app shows its placeholder instead). The last query should show `0` in every column.

## 3. Vercel (web app)

1. The Vercel project uses `mobile` as its root directory (`mobile/vercel.json` already has the build settings).
2. Environment variables:
   - `EXPO_PUBLIC_API_URL` = `https://<your-service>.onrender.com` (no trailing slash)
   - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Redeploy after changing them. `EXPO_PUBLIC_*` values get baked in at build time.

## 4. Google Cloud

**OAuth (Calendar):** APIs & Services → Credentials → the web OAuth client → add `https://<your-service>.onrender.com/api/calendar/oauth/callback` to Authorized redirect URIs. Remove the old Railway one.

**Maps key:** only the server uses this key now. The browser loads venue photos through our `/api/photo` route, so the key never leaves Render.
- Application restrictions: **None** (Render has no fixed outbound IP on the free plan, and no browser uses the key).
- API restrictions: exactly **Places API (New)** and **Geocoding API**. Nothing else.

## 5. Maps cost guard

1. Billing → **Budgets & alerts** → budget for this project, **$5**, alerts at 50%, 90% and 100%.
2. APIs & Services → each API → **Quotas** → set daily caps so a bug or a scraper can't run up a bill:
   - Places API (New), Nearby Search: **300/day**
   - Places API (New), Place Photos: **1,000/day**
   - Geocoding API: **100/day**
3. Our side already helps: `/api/photo` keeps images in memory for up to 1 hour (24 MB max), sends `Cache-Control` for 7 days, and limits each IP to 120 requests a minute.

### What the server caches, and why

To stay within the Google Places terms, the server stores only place IDs and short-lived data:

- **Supabase `google_cache` table** (migration 035, server-only, RLS on with no client access):
  - Nearby search results as an ordered list of place IDs per ~1 km grid cell and page. It is read only when Google reports a quota error: if the list is under 24 hours old, the venues from it that are still in server memory are shown and the response says it is cached.
  - Geocoded cities as latitude, longitude and the city name the user typed, kept 24 hours.
  - Rows older than 24 hours are deleted in small batches whenever the server writes a new row.
- **Server memory only** (lost when Render sleeps): nearby venue lists for 15 minutes (up to 100 searches) and photo bytes for 1 hour. When a list is not in memory the server runs the nearby search again.
- **Never stored in Supabase**: venue names, addresses, ratings, prices, photos or photo names, or anyone's exact location.

Please confirm this still matches Google's rules before launch: [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## 6. Free-tier sleep

Render's free web services go to sleep after about 15 minutes with no traffic. The first request after that takes around a minute while it wakes up, so open `/healthz` a minute before a demo. Sleeping also wipes the in-memory photo and venue caches and rate limit counters, which is fine.

Supabase's free plan pauses a project after about a week with no database activity. `GET /api/health/db` runs one tiny query and returns `{"ok":true}` (no login, no data, limited to 10 calls a minute per IP). Point a free external pinger such as UptimeRobot or cron-job.org at `https://<your-service>.onrender.com/api/health/db` once a week to keep both awake.

## 7. Railway (retired)

The old Railway backend is gone. `server/railway.json` was deleted. Ignore Railway steps in older planning docs.
