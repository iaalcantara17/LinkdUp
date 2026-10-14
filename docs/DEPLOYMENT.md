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
   - Places API (New), Nearby Search: **30/day**
   - Places API (New), Place Photos: **30/day**
   - Places API (New), Text Search: **150/day**
   - Geocoding API: **300/day**
3. Our side already helps: `/api/photo` caches up to 300 images in memory, sends `Cache-Control` for 7 days, and limits each IP to 120 requests a minute.

## 6. Free-tier sleep

Render's free web services go to sleep after about 15 minutes with no traffic. The first request after that takes around a minute while it wakes up, so open `/healthz` a minute before a demo. Sleeping also wipes the in-memory photo cache and rate limit counters, which is fine.

## 7. Railway (retired)

The old Railway backend is gone. `server/railway.json` was deleted. Ignore Railway steps in older planning docs.

## 8. Security and maintenance

Quick checklist so the app keeps working and nothing leaks. None of this needs code changes.

**Weekly: keep Supabase awake.** Free Supabase projects pause after 7 days with no database activity. Once a week, make sure something actually hits the database: sign in to the app and open Home, or run the keep-alive. Opening `/healthz` is not enough, because it never touches the database. If the project does pause, hit **Restore** in the Supabase dashboard. It takes a few minutes and no data is lost.

**Calendar tokens expire every 7 days.** Our OAuth app is still in **Testing** mode in Google Cloud. In Testing mode, Google refresh tokens die after 7 days, and only people on the test users list can connect at all. When "Add to Google Calendar" starts failing for someone, they need to connect Google again from the calendar screen. To stop this for good we would have to publish the app and go through Google's verification, which is not worth it for a few friends.

**Maps caps and budget.** The daily caps and the $5 budget are in section 5. When a cap is hit, Google returns errors until midnight Pacific time. Venue searches fail or come back empty, and new venue photos stop loading. Nothing gets charged past the cap. If we hit caps often, raise them a little and keep the budget alert on, rather than removing them.

**Rotating keys.** Rotate a key right away if it ends up somewhere public (a commit, a screenshot, a chat). Otherwise, doing it once a semester is fine. Always add the new key first and delete the old one last, so nothing breaks in between.

1. **Supabase secret key (`sb_secret_...`):** Supabase → Project Settings → API Keys → create a new secret key. Paste it into Render as `SUPABASE_SERVICE_ROLE_KEY`, save, and wait for the redeploy. Check that sign in and Home still load, then delete the old secret key.
2. **Supabase publishable key (`sb_publishable_...`):** this one ships inside the web app, so it is public by design. Only rotate it if Supabase tells you to. Create a new one, set it in Render (`SUPABASE_ANON_KEY`) and in Vercel (`EXPO_PUBLIC_SUPABASE_ANON_KEY`), redeploy both, then delete the old one.
3. **Google Maps key:** Google Cloud → Credentials → create a new API key with the same API restrictions as in section 4. Put it in Render as `GOOGLE_MAPS_API_KEY`, redeploy, check that a venue search and a photo load, then delete the old key.
4. **Google OAuth client secret:** Credentials → the web OAuth client → **Add secret**. Put the new one in Render as `GOOGLE_OAUTH_CLIENT_SECRET`, redeploy, then disable and delete the old secret. People do not need to reconnect, because their tokens belong to the client, not the secret.

Never paste real keys into the repo, `.env.example` files, issues, or chat. The real values live only in Render, Vercel, and our own notes.
