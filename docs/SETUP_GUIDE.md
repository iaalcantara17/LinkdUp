# LinkdUp — Setup Guide

Step-by-step instructions to go from zero to running app. Do these in order.

---

## 0. Prerequisites (one-time, on your machine)

1. Install **Node.js 20 LTS** from nodejs.org. Verify with `node -v`.
2. Install **Git** if you don't have it. Verify with `git -v`.
3. Install **Expo Go** on your phone from the App Store / Play Store.
4. Install the **Expo CLI** globally: `npm install -g expo-cli eas-cli`.

---

## 1. GitHub repository

1. Go to github.com → **New repository**.
2. Owner: `iaalcantara17`. Repository name: `linkdup`. Visibility: **Private** (you can flip to public for the demo if you want).
3. Do NOT initialize with a README — we already have one.
4. Click **Create repository**.
5. In your terminal, in the folder where you unzipped this package:

   ```bash
   cd linkdup
   git init
   git add .
   git commit -m "Initial scaffold from spec v2"
   git branch -M main
   git remote add origin https://github.com/iaalcantara17/linkdup.git
   git push -u origin main
   ```

6. Add your teammates as collaborators in **Settings → Collaborators** so the rubric "team contribution" optics look right even if they only commit a README change.

---

## 2. Supabase project (Postgres + Auth + Realtime)

1. Go to **supabase.com** → Sign in with GitHub → **New project**.
2. Org: your personal org. Project name: `linkdup`. DB password: generate one and **save it in a password manager**.
3. Region: pick the one closest to NJ (us-east-1).
4. Plan: **Free**. Click **Create new project**. Wait ~2 minutes.
5. Once provisioned, go to **Project Settings → API**. Copy these into `server/.env`:
   - `Project URL` → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY` (also goes into `mobile/.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (NEVER ship this to mobile)
6. Go to **SQL Editor → New query**. Paste the entire contents of `server/src/db/schema.sql`. Click **Run**. Verify in **Table Editor** that you see all 8 tables.
7. Go to **Authentication → Providers → Email**. Enable email provider. Disable "Confirm email" for development (you can re-enable for production).
8. Go to **Database → Replication**. Find the `votes` table and the `party_members` table and toggle realtime ON for both. This is what makes live vote sync work.

---

## 3. Google Cloud (Maps + Places + Calendar)

1. Go to **console.cloud.google.com** → sign in with a personal Google account (NOT your NJIT one — institutional accounts often block billing).
2. Top bar → project dropdown → **New Project** → name `linkdup-capstone` → **Create**. Make sure it's selected in the top bar.
3. Left sidebar → **Billing** → **Link a billing account**. You have to add a credit card. Google gives every new account $300 in credits for 90 days, and Places has a generous monthly free tier on top. You will not be charged for capstone-level usage.
4. **Set a budget alert immediately.** Billing → **Budgets & alerts** → **Create Budget** → name `linkdup-guard` → amount **$5** → all alerts at 50/90/100%. Save.
5. Left sidebar → **APIs & Services → Library**. Search for and enable each of these (one at a time):
   - **Places API (New)**
   - **Geocoding API**
   - **Maps SDK for Android** (only needed if you ship native, but enable now)
   - **Maps SDK for iOS** (same)
   - **Google Calendar API**
6. Left sidebar → **APIs & Services → Credentials → Create Credentials → API key**. Copy the key. This is `GOOGLE_MAPS_API_KEY` in `server/.env`.
7. Click the key you just made → **Edit API key** → under **API restrictions** select "Restrict key" and check the four Places/Maps/Geocoding APIs above (NOT Calendar). Save. Leave application restrictions off until you deploy.
8. **OAuth client for Calendar.** Credentials → **Create Credentials → OAuth client ID**.
   - First time, it will tell you to configure the OAuth consent screen. Click that link.
   - **OAuth consent screen:** User type **External**. App name `LinkdUp`. User support email = your email. Developer email = your email. Save and continue.
   - **Scopes:** click "Add or remove scopes" → search and add `https://www.googleapis.com/auth/calendar.events`. Save and continue.
   - **Test users:** add your own Google email plus your team's emails. Save and continue.
   - Back to **Credentials → Create OAuth client ID**. Application type **Web application**. Name `LinkdUp Server`. Authorized redirect URIs:
     - `http://localhost:3000/api/calendar/oauth/callback`
     - (later add your Railway URL with the same path)
   - Click **Create**. Copy the Client ID → `GOOGLE_OAUTH_CLIENT_ID`. Copy the Client Secret → `GOOGLE_OAUTH_CLIENT_SECRET`.

---

## 4. Server (local)

```bash
cd server
cp .env.example .env
# fill in the values from steps 2 and 3
npm install
npm run dev
```

You should see `LinkdUp API listening on http://localhost:3000`. Visit `http://localhost:3000/api/health` in a browser. You should see `{"ok": true, ...}`.

---

## 5. Mobile (local)

```bash
cd ../mobile
cp .env.example .env
# fill in the Supabase values (from step 2) and EXPO_PUBLIC_API_URL
# for local dev on a real phone, EXPO_PUBLIC_API_URL must be your laptop's LAN IP, not localhost
# find it with: ifconfig (mac/linux) or ipconfig (windows). Look for an address like 192.168.x.x.
# example: EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
npm install
npx expo start
```

Scan the QR code with your phone (Camera app on iOS, Expo Go app on Android). The app loads on your phone and hits your local server.

---

## 6. Deploy backend to Railway

Do this in week 3 of the sprint, not week 1. You want a real public URL so the demo works on any network, not just your LAN.

1. Go to **railway.app** → **Login with GitHub** → authorize.
2. **New Project → Deploy from GitHub repo → linkdup**. Pick your repo.
3. Railway will detect the monorepo. Set the **root directory** to `/server` in the service settings.
4. **Variables** tab → paste every variable from `server/.env` (use the production Supabase values, NOT local; though for this project they're the same).
5. **Settings → Networking → Generate Domain**. Copy the generated `https://linkdup-server-production.up.railway.app` (or whatever it is).
6. Update `mobile/.env` so `EXPO_PUBLIC_API_URL` points to that Railway URL instead of your LAN IP.
7. Update the Google OAuth client redirect URI list to add `https://<railway-url>/api/calendar/oauth/callback`.

---

## 7. Final demo build (week 4)

```bash
cd mobile
npx eas login           # uses your expo.dev account
npx eas build:configure
npx eas update --branch production --message "Capstone demo build"
```

Your phone app will pull the production JS bundle on next launch. Now the demo works anywhere with internet, not just your machine.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EXPO_PUBLIC_API_URL` 500 errors | Make sure your server is running and the URL in `mobile/.env` matches your LAN IP, not `localhost` |
| Google Places returns ZERO_RESULTS | Check that the API key has Places API (New) enabled and is not application-restricted yet |
| Supabase realtime not firing | Replication is OFF for that table by default — toggle it on in Database → Replication |
| Login works but `/api/auth/me` returns 401 | Make sure the mobile client is sending `Authorization: Bearer <supabase access_token>` |
| Expo Go shows blank white screen | Stop the dev server, run `npx expo start --clear`, rescan the QR |
| Calendar export 403 | OAuth consent screen test users list does not include the Google account being used |
