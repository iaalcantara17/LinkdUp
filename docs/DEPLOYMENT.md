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

To stay within the Google Places terms, the server keeps venue data only briefly in memory:

- **Supabase `google_cache` table** (migration 035, server-only, RLS on with no client access): geocoded cities only, as latitude, longitude and the city name the user typed, kept 24 hours. Older rows are deleted in small batches whenever the server writes a new row.
- **Server memory only** (lost when Render sleeps): nearby venue lists for 15 minutes (up to 100 searches) and photo bytes for 1 hour. When a list is not in memory the server runs the nearby search again. If Google is over quota at that point, the app shows the "venue limit reached" message.
- **Never stored in Supabase**: place IDs, venue names, addresses, ratings, prices, photos or photo names, or anyone's exact location.

Please confirm this still matches Google's rules before launch: [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## 6. Free-tier sleep

Render's free web services go to sleep after about 15 minutes with no traffic. The first request after that takes around a minute while it wakes up, so open `/healthz` a minute before a demo. Sleeping also wipes the in-memory photo and venue caches and rate limit counters, which is fine.

Supabase's free plan pauses a project after about a week with no database activity. `GET /api/health/db` runs one tiny query and returns `{"ok":true}` (no login, no data, limited to 10 calls a minute per IP). Point a free external pinger such as UptimeRobot or cron-job.org at `https://<your-service>.onrender.com/api/health/db` once a week to keep both awake.

## 7. Demo mode

"Try the demo" lets visitors look around without signing up. Everyone shares one demo account. The server refuses every write from it with `403 demo_read_only`, plus the lookups that spend Google quota (`/api/calendar/oauth/start`, `/api/discover/places/search`, `/api/user/location/search`). Discover, extra swipe cards and venue pitches answer the demo account from stored rows only, so no Places or Gemini call is made. Demo mode is off, and the button hidden, until all three env vars below are set.

Do these in order:

1. **Supabase → Authentication → Users → Add user → Create new user.** Tick **Auto Confirm User**. Create six users, each with its own long random password:
   - the demo login, for example `demo@linkdup.app` (keep this password, Render needs it)
   - `demo-maya@linkdup.app`, `demo-theo@linkdup.app`, `demo-priya@linkdup.app`, `demo-jordan@linkdup.app`, `demo-sam@linkdup.app` (the demo friends; nobody signs in as them)

   The friends have to be real auth users because `public.users.id` references `auth.users`. The seed never writes to auth tables.
2. Copy each user's **UID** from the Users list.
3. Open `server/src/db/seed/demo_seed.sql` and replace the six placeholders in the `demo_people` insert near the top:

   | Placeholder | Replace with the UID of |
   | --- | --- |
   | `REPLACE_ME_DEMO_USER_ID` | the demo login |
   | `REPLACE_ME_FRIEND_1_ID` | `demo-maya@linkdup.app` |
   | `REPLACE_ME_FRIEND_2_ID` | `demo-theo@linkdup.app` |
   | `REPLACE_ME_FRIEND_3_ID` | `demo-priya@linkdup.app` |
   | `REPLACE_ME_FRIEND_4_ID` | `demo-jordan@linkdup.app` |
   | `REPLACE_ME_FRIEND_5_ID` | `demo-sam@linkdup.app` |

   Don't commit the edited copy.
4. Run the whole file in the **Supabase SQL editor**. The last query should show `6` users, `3` parties, `10` venues and `5` posts. It is safe to run again: rerunning resets the demo parties and moves the locked date back to a week from today. If it stops with "Create these demo users in Supabase Auth first", one of the UIDs is wrong or missing.
5. **Render → linkdup-api → Environment**, add:
   - `DEMO_USER_ID` = the demo login's UID
   - `DEMO_USER_EMAIL` = the demo login's email
   - `DEMO_USER_PASSWORD` = the demo login's password

   Save, and let Render redeploy.
6. Check `https://<your-service>.onrender.com/api/auth/demo-available` returns `{"available":true}`, then run "Demo mode" in `docs/CORE_FLOW_CHECKLIST.md`.

Notes:

- The demo password stays on Render. It is never sent to the browser or logged. If a visitor changes it through Supabase directly, the next **Try the demo** resets it, but only when the stored UID and email match.
- `POST /api/auth/demo` is limited to 10 tries per IP every 15 minutes.
- Demo photos and avatars are static files in `mobile/public/demo/`, served by Vercel. They don't use `/api/photo`.
- Demo feed posts and the demo friends are ordinary rows, so signed-in users can see them in the feed and in friend search. They are marked "(demo)" or "Demo post".
- To turn demo mode off, delete `DEMO_USER_ID` on Render.

## 8. Railway (retired)

The old Railway backend is gone. `server/railway.json` was deleted. Ignore Railway steps in older planning docs.
