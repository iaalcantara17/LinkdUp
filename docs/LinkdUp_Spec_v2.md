# LinkdUp — Project Specification v2 (Locked)

> Reconciles the original `LINKEDUP_PROJECT_SPEC.md`, the `LinkDup_Project_Scope_Document.pdf`, and the visual design brief from the `LINKDUP Mobile App UI Mockup.make` Figma file. This is the source of truth for the build. Anything contradicting this doc is out of date.

**Project window:** Feb 17, 2026 → May 8, 2026
**Final presentation:** May 7, 2026
**Build window remaining:** Apr 8 → May 7, 2026 (~4 weeks)
**Sole developer:** Israel Alcantara
**Team (presenters):** Luis Duarte (PM), Joshua Hernandez (Frontend), Nekhi Glover (Integration/Testing), Yash Amin (UX/Business Logic)

---

## 1. Brand and Identity

| Field | Value |
|---|---|
| Product name | LinkdUp |
| Wordmark | LINKDUP (all caps, used as visual logo only) |
| Tagline | Find your people. Find your place. |
| Vibe | Tinder × Google Maps × BeReal |
| Theme | Dark mode base with glassmorphism cards |
| Primary gradient | `#6C3EF4` (deep purple) → `#00C2FF` (electric blue) |
| Background | `#0B0B14` |
| Surface | `#15151F` |
| Surface (glass) | `rgba(255,255,255,0.06)` with backdrop blur |
| Text primary | `#FFFFFF` |
| Text secondary | `#A1A1AA` |
| Success | `#22C55E` |
| Danger | `#EF4444` |
| Font | Space Grotesk (display) + Inter (body) |

The full design token list lives in `mobile/src/theme/`.

---

## 2. App Concept

LinkdUp is a mobile app that helps groups of friends — specifically school alumni who live in different cities — agree on a place to meet up. Each member shares their location, the app computes a geographic midpoint, pulls nearby venues from Google Places, and the group swipes Tinder-style on the candidates. When a majority of the party swipes yes on the same venue, the app locks in a match, lets the group pick a date and time, and exports the plan to Google Calendar.

**Core problem:** group chats turn into planning wars. Nobody picks the place. Nobody picks the date. Nothing happens.

**Core solution:** turn the decision into a swipe game with a fair midpoint and a single agreed-upon outcome.

---

## 3. Tech Stack (Locked)

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo (React Native) + TypeScript | Single codebase for iOS, Android, web; QR-code demo on a real phone; team knows JS |
| Navigation | React Navigation v6 (native stack + bottom tabs) | Standard, well-documented, matches the bottom-nav design |
| Backend | Node.js + Express + TypeScript | Team knows JS; TS catches errors when one person owns everything |
| Database | PostgreSQL via Supabase | Managed Postgres on free tier, includes auth and realtime, deploys instantly |
| Auth | Supabase Auth (email/password) | Replaces hand-rolled JWT/bcrypt for the auth core; we still issue our own server-validated session tokens via Supabase JWTs |
| Realtime | Supabase Realtime (Postgres changes) | Replaces Socket.io; subscribes to row changes on the votes table per party |
| Maps | Google Places API (New) + Geocoding API | Venue search around the midpoint, fallback for manual city entry |
| Calendar | Google Calendar API v3 (OAuth user consent) | Add-to-calendar after match |
| Backend hosting | Railway | One-click deploy from GitHub, env vars in UI, free credits |
| Mobile delivery | Expo Go (dev) + EAS Build (final) | Phone install via QR code |
| Source control | GitHub monorepo | `/server`, `/mobile`, `/docs` |
| Sprint tooling | GitHub Projects (Kanban) | Free, lives in the repo, screenshots well for the rubric |

---

## 4. Feature List (Locked Scope)

### 4.1 In Scope (Build Now)

**Auth and profile**
- Email/password sign up and login (via Supabase Auth)
- School name and graduation year captured at signup
- Profile screen with display name, school, grad year, avatar initials
- Persistent session across app restarts
- Logout

**Location**
- Request GPS permission on first launch
- Capture and store lat/lng each session
- Manual city fallback if permission denied (Geocoding API)

**Party system**
- Create party (host) → 6-character join code
- Join party with code
- Lobby with live member presence
- Host starts the swipe phase
- Party status state machine: `waiting → swiping → matched → scheduled → locked`

**Midpoint and venue discovery**
- Geographic midpoint computed from all member coordinates
- Warning if spread > 1000 km (cap radius)
- Google Places (New) `searchNearby` query around midpoint
- 10 to 15 candidates per party
- Cached per-party so we hit Places once, not once per swiper

**Swipe and vote**
- Card stack with venue photo, name, distance from midpoint, category, rating
- Swipe right = yes, swipe left = no, button fallback
- Live HUD: crew avatars with per-member status (waiting / yes / no)
- Group vote progress bar
- Vote sync via Supabase Realtime

**Match engine**
- Threshold: strictly greater than 50% of party members swipe yes on the same venue
- First venue to cross the threshold wins
- All members get an in-app notification when status flips to `matched`

**Match screen**
- Confetti and gradient celebration treatment
- Venue card: photo, name, address, rating, distance per member
- "Set the Date" CTA → date/time setup
- "Get Directions" → opens Google Maps deep link

**Date and time setup**
- Group availability grid (next 14 days × time slots)
- Each member taps the slots that work for them
- Slot with the most overlaps gets highlighted
- Host taps "Lock It In" to commit the date

**Calendar export**
- Google OAuth flow on first calendar use (incremental scope: `https://www.googleapis.com/auth/calendar.events`)
- Creates a Google Calendar event with venue name, address, attendees, time
- ICS download fallback for users who don't connect Google
- Local phone reminder toggle (uses Expo Notifications)

**Onboarding and shell**
- 3-slide animated onboarding carousel
- Bottom tab nav: Home, Discover, Party, Calendar, Profile

### 4.2 Out of Scope (Phase 2 — explicitly cut and labeled)

These were in the Figma brief or the original scope document. They are formally cut from the v2 build to keep us shippable in 4 weeks. List them in the presentation as "Phase 2" so judges see deliberate scope control:

- Google sign-in as a primary auth method (email/password is the main path)
- TikTok-style full vertical video venue cards (we use rich photo cards with the same visual language)
- In-app reservations and payments (OpenTable, etc.)
- DMs and group chat replacement
- ML-powered personalization
- Reporting / moderation / anti-abuse
- Spontaneous Mode (last-minute auto-plan)
- Multi-stop itineraries
- Comments on venues
- Friend list / social graph beyond party membership

### 4.3 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Google Maps API costs | Cache `places` results per party; one fetch per `start`, reuse for every voter |
| Members spread across very long distances → no useful midpoint | Cap radius; show warning if spread > 1000 km; fall back to host's city |
| One slow member blocking the swipe phase | Majority vote (>50%), not unanimous — match fires the moment majority is reached |
| Realtime races on simultaneous votes | Database is the source of truth; client recomputes tally from server state on each push |
| Scope creep | This doc. Phase 2 is the holding pen. |
| Single developer (you) burning out | Sprint plan in `SPRINT_PLAN.md` is realistic for a CS senior, not a startup |
| Demo phone has no signal | Backend deployed to Railway, mobile uses public URL not localhost |

---

## 5. Database Schema (8 tables)

See `server/src/db/schema.sql` for the executable version. Summary:

| Table | Purpose |
|---|---|
| `users` | Auth + profile (mirrors Supabase auth.users via FK on id) |
| `schools` | Reference table for the alumni signup field |
| `parties` | One row per group session, with status enum and join code |
| `party_members` | Junction table; user ↔ party with joined_at |
| `locations` | Venue candidates fetched from Google Places, scoped per party |
| `votes` | One row per (user, location) swipe |
| `party_dates` | Proposed date/time slots per party after match |
| `date_votes` | One row per (user, party_date) availability click |

Indexes on every FK, plus a unique constraint on `(party_id, user_id, location_id)` in `votes` so a user can't double-vote the same venue.

---

## 6. API Surface (~25 endpoints)

All routes are prefixed `/api`. JWT bearer token required on every route except `/auth/*` and `/health`.

### Auth
```
POST   /api/auth/signup           { email, password, display_name, school_id, graduation_year }
POST   /api/auth/login            { email, password }
POST   /api/auth/logout
GET    /api/auth/me
```

### Schools
```
GET    /api/schools?q=<search>    autocomplete for the signup field
```

### User
```
GET    /api/user/me
PATCH  /api/user/me               { display_name?, avatar_color? }
PUT    /api/user/location         { latitude, longitude }
PUT    /api/user/location/manual  { city, country }   geocodes server-side
```

### Party
```
POST   /api/party                 host creates → returns { party_id, code }
POST   /api/party/join            { code }
GET    /api/party/:id             returns party + members + status
DELETE /api/party/:id/leave
POST   /api/party/:id/start       host only — fetches midpoint + Places, status → swiping
GET    /api/party/:id/locations   returns candidate locations
GET    /api/party/:id/members     returns members with online status
```

### Vote
```
POST   /api/party/:id/vote        { location_id, vote: true|false }
GET    /api/party/:id/votes       returns tallies per location
```

### Match
```
GET    /api/party/:id/match       returns matched location if status >= matched
```

### Dates
```
POST   /api/party/:id/dates       host only — generates 14-day × time-slot grid
GET    /api/party/:id/dates       returns proposed slots + vote counts
POST   /api/party/:id/dates/vote  { date_slot_ids: [...] }
POST   /api/party/:id/dates/lock  host only — locks the winning slot, status → locked
```

### Calendar
```
GET    /api/calendar/oauth/start          returns Google OAuth URL
GET    /api/calendar/oauth/callback       OAuth redirect target — stores tokens
POST   /api/party/:id/calendar/export     creates Google Calendar event
GET    /api/party/:id/calendar/ics        returns .ics file for download
```

### System
```
GET    /api/health                returns { ok: true, version }
```

---

## 7. User Flow (Screen by Screen)

```
Launch
  ├─ if not signed in → SplashScreen → OnboardingScreen (3 slides) → AuthStack
  │                                                                    ├─ LoginScreen
  │                                                                    └─ SignUpScreen
  └─ if signed in → MainTabs

MainTabs
  ├─ HomeScreen        — active parties, FAB to create
  ├─ DiscoverScreen    — Phase 2 placeholder, shows "coming soon"
  ├─ PartyScreen       — quick join via code
  ├─ CalendarScreen    — locked-in plans
  └─ ProfileScreen     — user info + logout

Party flow (modal stack on top of tabs)
  CreatePartyScreen / JoinPartyScreen
    └─ PartyLobbyScreen          (waiting → host taps Start)
         └─ LocationPermissionScreen (if needed)
              └─ SwipeScreen      (swiping → match fires)
                   └─ MatchScreen (matched → tap Set the Date)
                        └─ DateTimeSetupScreen (scheduled → host locks)
                             └─ CalendarConfirmationScreen (locked)
```

---

## 8. System Architecture

```
[ Expo Mobile App (React Native + TS) ]
              |
              | HTTPS / REST           Realtime (Postgres changes)
              |                                  |
              v                                  v
[ Express API (Node + TS, Railway) ] <----> [ Supabase ]
              |                                  |
              | Server-side calls                | Postgres (8 tables)
              |                                  | Auth (Supabase Auth)
              v                                  | Realtime
[ Google Cloud APIs ]
   ├─ Places API (New)
   ├─ Geocoding API
   └─ Calendar API v3
```

The Express server is the only thing that talks to Google. The mobile app never holds Google API keys directly; all calls are proxied. Supabase Realtime subscribes the mobile client directly to vote-row changes for the active party so we don't have to maintain a Socket.io layer ourselves.

---

## 9. Match Threshold (locked)

A venue is matched when the count of `votes WHERE party_id = X AND location_id = Y AND vote = true` is **strictly greater than 50%** of the count of `party_members WHERE party_id = X`.

For a 4-person party, that's 3 yes votes. For a 5-person party, also 3. For a 2-person party, 2.

The first venue to cross this threshold wins. Subsequent yes votes on other venues do not unmatch.

---

## 10. Test Cases (20 total)

See `TEST_PLAN.md` for the full version with steps and expected results.

| # | Area | Case |
|---|---|---|
| TC-01 | Auth | Signup with valid email/password creates account |
| TC-02 | Auth | Login with wrong password returns 401 |
| TC-03 | Auth | Session persists across app restart |
| TC-04 | Location | Granting GPS permission stores coords |
| TC-05 | Location | Denied permission falls back to manual city entry |
| TC-06 | Party | Host creates party returns 6-char code |
| TC-07 | Party | Member joins with valid code |
| TC-08 | Party | Member joins with invalid code returns 404 |
| TC-09 | Party | Host taps Start, status flips to swiping, locations populate |
| TC-10 | Party | Non-host taps Start, returns 403 |
| TC-11 | Vote | Vote is recorded and broadcast to other members |
| TC-12 | Match | Majority yes on same venue triggers match |
| TC-13 | Match | Minority yes does not trigger match |
| TC-14 | Match | Match screen shows venue + per-member distance |
| TC-15 | Dates | Host generates date slots after match |
| TC-16 | Dates | Members vote availability, tallies update |
| TC-17 | Dates | Host locks date, status → locked |
| TC-18 | Calendar | OAuth flow returns access token |
| TC-19 | Calendar | Export creates real Google Calendar event |
| TC-20 | Calendar | ICS fallback downloads valid file |

---

## 11. Folder Structure

```
linkdup/
├── docs/
│   ├── LinkdUp_Spec_v2.md          (this file)
│   ├── LinkdUp_Scope_v2.md
│   ├── SETUP_GUIDE.md
│   ├── CURSOR_PROMPTS.md
│   ├── TEST_PLAN.md
│   ├── STAKEHOLDERS.md
│   ├── PRESENTATION_SCRIPT.md
│   └── SPRINT_PLAN.md
├── diagrams/
│   ├── erd.svg
│   ├── architecture.svg
│   ├── fdd.svg
│   ├── wbs.svg
│   └── gantt.svg
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── db.ts
│       ├── middleware/{auth.ts, error.ts}
│       ├── routes/{auth.ts, user.ts, party.ts, vote.ts, match.ts, dates.ts, calendar.ts, schools.ts}
│       ├── services/{places.ts, midpoint.ts, matchEngine.ts, googleCalendar.ts}
│       └── db/schema.sql
├── mobile/
│   ├── package.json
│   ├── app.json
│   ├── tsconfig.json
│   ├── App.tsx
│   ├── .env.example
│   └── src/
│       ├── theme/{colors.ts, typography.ts, spacing.ts, index.ts}
│       ├── navigation/{RootNavigator.tsx, AuthStack.tsx, MainTabs.tsx, PartyStack.tsx}
│       ├── context/AuthContext.tsx
│       ├── services/{api.ts, supabase.ts}
│       ├── components/{GradientButton.tsx, GlassCard.tsx, LinkdUpLogo.tsx, AvatarBubble.tsx}
│       └── screens/(15 screens)
├── .gitignore
└── README.md
```

---

## 12. Environment Variables

### server/.env
```
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google
GOOGLE_MAPS_API_KEY=AIza...
GOOGLE_OAUTH_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/calendar/oauth/callback

# JWT (for our own session tokens layered over Supabase)
JWT_SECRET=replace-with-32-byte-random-string

# CORS
CORS_ORIGIN=*
```

### mobile/.env
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`SETUP_GUIDE.md` walks through getting every one of these.
