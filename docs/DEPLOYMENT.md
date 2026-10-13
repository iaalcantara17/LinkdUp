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

Nothing changes in the project itself. Run `server/src/db/migrations/031_photo_proxy_urls.sql` once in the Supabase SQL editor. It replaces old photo URLs that had the Maps key in them with `/api/photo?...` links. The last query should show `0` keyed URLs left in both tables.

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
- API restrictions: **Places API (New)** and **Geocoding API**.
- Heads up: `searchNearbyVenuesPaged` (the "load more" path) and old photo references still use the legacy **Places API**. If that path breaks with a `REQUEST_DENIED` error, add the legacy Places API to the key, or move that function to Places API (New).

## 5. Maps cost guard

1. Billing → **Budgets & alerts** → budget for this project, **$5**, alerts at 50%, 90% and 100%.
2. APIs & Services → each API → **Quotas** → set daily caps so a bug or a scraper can't run up a bill:
   - Places API (New), Nearby Search: **300/day**
   - Places API (New), Place Photos: **1,000/day**
   - Geocoding API: **100/day**
   - Places API (legacy), if enabled: **300/day**
3. Our side already helps: `/api/photo` caches up to 300 images in memory, sends `Cache-Control` for 7 days, and limits each IP to 120 requests a minute.

## 6. Free-tier sleep

Render's free web services go to sleep after about 15 minutes with no traffic. The first request after that takes around a minute while it wakes up, so open `/healthz` a minute before a demo. Sleeping also wipes the in-memory photo cache and rate limit counters, which is fine.

## 7. Railway (retired)

The old Railway backend is gone. `server/railway.json` was deleted. Ignore Railway steps in older planning docs.
