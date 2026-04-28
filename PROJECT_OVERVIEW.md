# LinkdUp — Project Overview

## What This App Is

LinkdUp is an alumni meetup coordination app that lets friend groups discover hangout venues together through a Tinder-style swipe interface. Users create or join a "party," share their locations, and the app computes a geographic midpoint, then surfaces nearby venues for everyone to swipe on simultaneously. When the group reaches a majority vote on a venue, a match is declared and the party moves to date-picking and Google Calendar export. The app also includes a social feed where users post photos from venues, a Discover tab for browsing trending spots near them, and a friends system for connecting with other alumni.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Mobile | Expo (React Native) | SDK 54, `~54.0.0` |
| Mobile runtime | React Native | 0.81.5 |
| Mobile language | TypeScript | ~5 |
| Navigation | React Navigation (native stack) | v7 |
| Animations | react-native-reanimated + Gesture Handler | v3 |
| Server framework | Node.js + Express | Express ^4.21 |
| Server language | TypeScript | ^5.6.2 |
| Server runner | tsx watch | - |
| Database + Auth | Supabase (Postgres + Supabase Auth) | - |
| Supabase JS client | @supabase/supabase-js | v2 |
| External APIs | Google Places (New), Google Maps Geocoding, Google Calendar, Gemini AI | - |
| AI | Gemini 2.5 Flash-Lite | via REST |
| Validation | zod | - |
| Dev target | Web browser via `npx expo start --web` at `localhost:8082` | - |

---

## Project Layout

```
linkdup/                          root (project lives here — not at Capstone/)
├── mobile/                       Expo/React Native app
│   ├── src/
│   │   ├── screens/              one file per screen (27 screens total)
│   │   ├── components/           reusable UI components
│   │   │   └── walkthrough/      animated slide visuals for onboarding
│   │   ├── context/              React contexts (Auth, Theme, Hints)
│   │   ├── navigation/           stack definitions (AuthStack, MainStack, RootNavigator)
│   │   ├── services/
│   │   │   ├── api.ts            typed wrapper around every server endpoint
│   │   │   └── supabase.ts       Supabase client (used for auth + realtime only)
│   │   └── theme/                design tokens (colors, typography, spacing, radii)
│   ├── App.tsx                   root component, loads fonts, wraps providers
│   └── package.json
├── server/                       Express API
│   ├── src/
│   │   ├── routes/               one file per feature area (11 route files)
│   │   ├── services/             business logic (places, matchEngine, aiPitch, etc.)
│   │   ├── middleware/           auth, error handler, updateLastSeen
│   │   ├── db/
│   │   │   ├── schema.sql        baseline schema (run first on fresh DB)
│   │   │   └── migrations/       001–026 incremental SQL files
│   │   ├── config.ts             reads all env vars, throws on missing required ones
│   │   ├── db.ts                 supabaseAdmin client (service_role key)
│   │   └── index.ts              Express app startup + storage bucket creation
│   └── package.json
├── diagrams/                     FDD and architecture diagrams
├── docs/                         additional documentation
└── README.md
```

---

## Database Schema

### `schools`
Reference table for alumni signup autocomplete.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto uuid |
| name | varchar(200) UNIQUE NOT NULL | GIN index on full-text |
| city | varchar(100) | |
| state | varchar(50) | |
| country | varchar(50) | default 'USA' |
| created_at | timestamptz | |

Seeded with ~750+ US colleges via migrations 006a/b/c. Schools can also be created on-the-fly via `POST /api/schools/lookup` when a user types an unrecognized school name during signup.

---

### `users`
Mirrors `auth.users` by ID. Created server-side on signup or via `ensure-profile` after OAuth.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | same as Supabase auth.users.id |
| email | varchar(255) UNIQUE NOT NULL | |
| display_name | varchar(100) NOT NULL | |
| username | text UNIQUE | added in migration 017; backfilled from display_name |
| school_id | uuid FK → schools | nullable |
| graduation_year | int | 1950-2100 constraint |
| avatar_color | varchar(7) | default '#6C3EF4', hex color |
| avatar_url | text | Supabase Storage public URL |
| latitude / longitude | double precision | user's last known location |
| last_location_at | timestamptz | when location was last updated |
| last_seen_at | timestamptz | updated by middleware on each authenticated request |
| location_permission_status | text | 'unset' | 'granted' | 'maybe_later' (migration 019) |
| pronouns | text | nullable (migration 010) |
| birthday | date | nullable; age computed on read (migration 010) |
| bio | text | max 200 chars (migration 010) |
| theme_preference | text | 'dark' | 'light' | 'system' (migration 022) |
| google_calendar_token | text | OAuth access token, set server-side only |
| google_calendar_refresh | text | OAuth refresh token |
| has_seen_walkthrough | boolean | default false (migration 015) |
| created_at / updated_at | timestamptz | |

RLS: `users_self_read` requires `auth.uid() = id`. Insert and update policies use `WITH CHECK (true)` so the service_role backend can write. The `google_calendar_refresh` column is omitted from API responses; only `google_calendar_connected` (bool) is returned.

---

### `parties`
A party = a group event session. Status transitions: `waiting → swiping → matched → scheduled → locked`.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(6) UNIQUE | 6-char uppercase alphanumeric join code |
| name | varchar(100) | optional display name |
| host_user_id | uuid FK → users ON DELETE CASCADE | |
| status | party_status enum | waiting/swiping/matched/scheduled/locked |
| matched_location_id | uuid FK → locations ON DELETE SET NULL | set when matched |
| locked_date_id | uuid FK → party_dates ON DELETE SET NULL | set when host locks a date |
| midpoint_lat / midpoint_lng | double precision | geographic center of all member locations |
| next_page_token | text | legacy Places API pagination token (migration 007) |
| venue_rotation_seed | int | index into ROTATION_TYPES buckets (migration 009) |
| gcal_event_id | text | Google Calendar event ID for cleanup (migration 012) |
| is_public | boolean | default false; public parties appear in Discover (migration 023) |
| created_at / updated_at | timestamptz | |

---

### `party_members`
Junction table: one row per user per party.
| Column | Type | Notes |
|---|---|---|
| party_id | uuid FK → parties ON DELETE CASCADE | composite PK |
| user_id | uuid FK → users ON DELETE CASCADE | composite PK |
| joined_at | timestamptz | |
| is_online | boolean | default false |

---

### `locations`
Venue candidates for a party, fetched from Google Places on `POST /api/party/:id/start`.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| party_id | uuid FK → parties ON DELETE CASCADE | |
| google_place_id | varchar(255) | UNIQUE per party_id |
| name | varchar(200) NOT NULL | |
| address | varchar(500) | |
| latitude / longitude | double precision NOT NULL | |
| photo_url | varchar(1000) | Google Places photo URL |
| rating | numeric(2,1) | 0-5 |
| user_ratings_total | int | number of reviews |
| category | varchar(100) | human-readable type, e.g. "Restaurant" |
| price_level | int | 0-4 |
| is_priority | boolean | default false; set when a feed post venue is added to the party (migration 025) |
| created_at | timestamptz | |

Unique constraint on `(party_id, google_place_id)` prevents duplicate venues. Ordered by `is_priority DESC, rating DESC` when fetched.

---

### `votes`
One row per user per venue per party. Upserted on swipe.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| party_id | uuid FK → parties | |
| user_id | uuid FK → users | |
| location_id | uuid FK → locations | |
| vote | boolean | true = liked, false = passed |
| voted_at | timestamptz | used as tie-breaker in small-party match |

Unique on `(party_id, user_id, location_id)`.

---

### `party_dates`
Proposed time slots generated after a match (30 days × 4 time slots = 120 rows per party).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| party_id | uuid FK → parties | |
| starts_at | timestamptz | UNIQUE per party |
| ends_at | timestamptz | always starts_at + 2 hours |
| created_at | timestamptz | |

Time slots: morning (11:00), lunch (13:30), evening (18:00), night (21:00). Custom datetimes can also be submitted via `POST /api/party/:id/dates/custom`.

---

### `date_votes`
Which time slots each member marked as available.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| party_date_id | uuid FK → party_dates | |
| user_id | uuid FK → users | |
| available | boolean | |
| voted_at | timestamptz | |

Unique on `(party_date_id, user_id)`. The host's vote is wiped and replaced each time they submit.

---

### `discover_likes`
Venues saved by a user from the Discover / Explore tab. Independent of the party/vote flow.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | |
| google_place_id | text NOT NULL | UNIQUE per user |
| name / address / lat / lng / photo_url / rating / category / price_level | various | denormalized from Places API |
| liked_at | timestamptz | |

---

### `friendships`
Directional friend requests with status transitions: `pending → accepted` (or deleted on decline/remove).
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| requester_id | uuid FK → users ON DELETE CASCADE | |
| addressee_id | uuid FK → users ON DELETE CASCADE | |
| status | text | 'pending' | 'accepted' | 'blocked' |
| requested_at | timestamptz | |
| responded_at | timestamptz | |

Unique on `(requester_id, addressee_id)`. The `blocked` status exists in schema but is not exposed in the UI.

---

### `user_screen_hints`
Tracks which per-screen hint tooltips a user has already dismissed.
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → users ON DELETE CASCADE | composite PK |
| screen_key | text | e.g. 'home_friends_card', 'swipe_why_this' | composite PK |
| seen_at | timestamptz | |

---

### `feed_posts`
Posts created by users, each tagged with a venue.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| creator_id | uuid FK → users ON DELETE CASCADE | |
| image_url | text NOT NULL | Supabase Storage public URL (feed-photos bucket) |
| caption | text | max 500 chars |
| venue_name | text NOT NULL | |
| venue_address | text | |
| venue_latitude / venue_longitude | double precision | |
| venue_google_place_id | text | nullable; used to upsert as location if "Add to party" is tapped |
| created_at | timestamptz | |

---

### `feed_likes`
| Column | Type |
|---|---|
| user_id | uuid FK → users (composite PK) |
| post_id | uuid FK → feed_posts (composite PK) |
| liked_at | timestamptz |

---

### `feed_bookmarks`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → users (composite PK) | |
| post_id | uuid FK → feed_posts (composite PK) | |
| collection_id | uuid FK → bookmark_collections ON DELETE SET NULL | nullable; added migration 024 |
| bookmarked_at | timestamptz | |

---

### `feed_comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| post_id | uuid FK → feed_posts ON DELETE CASCADE | |
| author_id | uuid FK → users ON DELETE CASCADE | |
| body | text | 1-500 chars |
| created_at | timestamptz | |

---

### `user_follows`
Asymmetric follow relationship (separate from friendships).
| Column | Type |
|---|---|
| follower_id | uuid FK → users (composite PK) |
| followed_id | uuid FK → users (composite PK) |
| followed_at | timestamptz |

---

### `bookmark_collections`
Named collections that group bookmarked posts.
| Column | Type |
|---|---|
| id | uuid PK |
| user_id | uuid FK → users ON DELETE CASCADE |
| name | text (1-50 chars) |
| created_at | timestamptz |

---

### Views
**`v_party_vote_tallies`** — aggregates `yes_votes`, `no_votes`, and `total_members` per `(party_id, location_id)`. Used by the match engine to find majority winners without a full table scan.

---

### RLS Notes
- All tables have RLS enabled.
- The Express server uses the `service_role` key via `supabaseAdmin`, which bypasses RLS entirely.
- Most new feature tables (feed, friends, hints, follows) use `FOR ALL USING (true) WITH CHECK (true)` policies, meaning any direct client calls to Supabase would bypass intended server-side validation. All mutations go through the Express server.
- The `users` insert policy uses `WITH CHECK (true)` because `auth.uid()` is NULL for service_role requests, which would silently block inserts if the policy checked `auth.uid() = id`.
- The `party_members` policy avoids recursive self-joins that caused infinite recursion in earlier versions.

---

## Server API Reference

Base URL: `http://localhost:3000`

All routes return JSON. Errors return `{ error: string, message?: string }`. Auth token is passed as `Authorization: Bearer <access_token>` header.

---

### `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account. Body: `{ email, password, display_name, school_id?, graduation_year? }`. Returns `{ user, session }`. Handles orphaned auth users idempotently. |
| POST | `/api/auth/login` | No | Email/password login. Returns `{ user, session }`. |
| POST | `/api/auth/logout` | Yes | Revokes Supabase session token. |
| POST | `/api/auth/ensure-profile` | Yes | Idempotent upsert for OAuth users. Body: `{ email, display_name }`. Called by `AuthCallbackScreen` after Google sign-in. |
| GET | `/api/auth/me` | Yes | Returns current user profile including `google_calendar_connected` bool and computed `age`. Excludes `google_calendar_refresh`. |

---

### `/api/user`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/user/me` | Yes | Full profile row including `theme_preference`. |
| PATCH | `/api/user/me` | Yes | Update profile fields: `display_name`, `avatar_color`, `graduation_year`, `school_id`, `pronouns`, `birthday`, `bio`, `username`, `theme_preference`. Returns 409 on username conflict. |
| PUT | `/api/user/location` | Yes | Body: `{ latitude, longitude }`. Updates location + sets `location_permission_status = 'granted'` if not already. |
| PUT | `/api/user/location/manual` | Yes | Body: `{ city, country? }`. Geocodes the city name and saves coordinates. |
| PUT | `/api/user/me/avatar` | Yes | Body: `{ image_base64 }`. Uploads to Supabase Storage `avatars` bucket, saves public URL. |
| GET | `/api/user/:id/public` | Yes | Public profile for viewing another user. Returns: `id, display_name, username, avatar_url, avatar_color, school (name string), graduation_year, pronouns, age, bio`. |
| GET | `/api/user/me/parties` | Yes | All parties the caller is a member of, newest first. Includes `member_count`, `total_votes`, `venue_count`, `member_avatars` (first 3). |
| GET | `/api/user/me/hangouts` | Yes | Parties with status matched/scheduled/locked. Enriched with venue, locked_date, member_count. Sorted soonest-first. |
| DELETE | `/api/user/me` | Yes | Full account deletion. Order: GCal cleanup → hosted party data → feed photos → users row → auth record. Partial failures logged but do not abort. |
| GET | `/api/user/username-available?u=` | Yes | Returns `{ available, valid, reason? }`. |
| GET | `/api/user/me/hints` | Yes | Returns array of `screen_key` strings the user has dismissed. |
| POST | `/api/user/me/hints` | Yes | Body: `{ screen_key }`. Marks a hint as seen. |
| POST | `/api/user/me/location-permission` | Yes | Body: `{ status: 'granted' | 'maybe_later' }`. |
| DELETE | `/api/user/me/location` | Yes | Clears coordinates and sets `location_permission_status = 'maybe_later'`. |
| POST | `/api/user/me/walkthrough-seen` | Yes | Sets `has_seen_walkthrough = true`. |
| POST | `/api/user/:id/follow` | Yes | Follow a user. Upserts `user_follows`. |
| DELETE | `/api/user/:id/follow` | Yes | Unfollow. |

---

### `/api/schools`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/schools/lookup` | No | Body: `{ name }`. Finds or creates a school by case-insensitive name. |
| GET | `/api/schools?q=` | Yes | Search schools by name (case-insensitive contains). Max 20. |
| GET | `/api/schools/:id` | Yes | Get single school by ID. |

---

### `/api/party`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/party` | Yes | Create party. Body: `{ name?, is_public? }`. Host auto-added as member. Returns `{ party_id, code, party }`. |
| POST | `/api/party/join` | Yes | Body: `{ code }`. Joins a waiting or swiping party. |
| GET | `/api/party/:id` | Yes (member) | Full party object + members with display info. Members include fuzzed `display_lat/display_lng`. |
| GET | `/api/party/:id/members` | Yes (member) | Members with user details and fuzzed coordinates. |
| PATCH | `/api/party/:id/visibility` | Yes (host) | Body: `{ is_public: bool }`. |
| DELETE | `/api/party/:id/leave` | Yes | Leave party. Fires GCal event deletion in background. |
| DELETE | `/api/party/:id` | Yes (host) | Delete party. Cascades: date_votes → party_dates → votes → locations → party_members → party. Fires GCal deletion in background. |
| POST | `/api/party/:id/start` | Yes (host) | Computes midpoint from member locations, fetches venues from New Places API, inserts into `locations`, sets status to `swiping`. Also fires legacy Places call in background to seed a `next_page_token`. |
| GET | `/api/party/:id/locations` | Yes (member) | All venue candidates ordered by `is_priority DESC, rating DESC`. Enriched with `distances` array (miles from each member). |
| GET | `/api/party/:id/pitch?venue_id=` | Yes (member) | AI-generated 2-3 sentence pitch for the venue via Gemini. Process-wide in-memory cache keyed by `name+address+member_count+party_name`. |
| GET | `/api/party/:id/more-venues` | Yes (member) | Loads next batch of venues via `getVenuesWithRotation`. Rotates through 5 category buckets. Returns `{ new_venue_count, exhausted }`. |
| POST | `/api/party/:id/reset` | Yes (host) | Clears all votes and sets status back to `swiping`. |
| POST | `/api/party/:id/force-match` | Yes (member, solo only) | Solo-party shortcut: picks the most-recently-liked venue as the match. Returns `{ matched, location_id? }`. |

---

### `/api/party` — votes and match

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/party/:id/vote` | Yes (member) | Body: `{ location_id, vote: bool }`. Upserts vote, then evaluates match. Returns `{ ok, match }`. |
| GET | `/api/party/:id/votes` | Yes | Reads from `v_party_vote_tallies` view. |
| GET | `/api/party/:id/my-votes` | Yes | Returns `[{ location_id }]` for all locations this user has voted on. |
| GET | `/api/party/:id/match` | Yes | Returns `{ matched, status, location? }`. |

---

### `/api/party` — dates

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/party/:id/dates` | Yes (host) | Generates 120 date slots (30 days × 4 time slots), sets status to `scheduled`. Idempotent. |
| GET | `/api/party/:id/dates` | Yes | Returns date slots with `yes_count` tally. |
| POST | `/api/party/:id/dates/vote` | Yes | Body: `{ date_slot_ids: string[] }`. Replaces user's availability votes for this party. |
| POST | `/api/party/:id/dates/custom` | Yes (member) | Body: `{ datetime }`. Inserts a single custom time slot. Idempotent. |
| POST | `/api/party/:id/dates/lock` | Yes (host) | Body: `{ party_date_id }`. Sets `locked_date_id` and status to `locked`. |

---

### `/api/calendar`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/calendar/oauth/start` | Yes | Returns `{ url }` for Google OAuth consent screen. |
| GET | `/api/calendar/oauth/callback` | No | Exchanges code, stores tokens, renders success HTML page. |
| POST | `/api/calendar/party/:id/export` | Yes | Creates a Google Calendar event for a locked party. Saves `gcal_event_id` to party. Returns `{ ok, event_id, html_link }`. |
| GET | `/api/calendar/party/:id/ics` | Yes | Returns a `.ics` file download for parties without Google Calendar connected. |

---

### `/api/discover`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/discover/venues?lat=&lng=` | Yes | Trending venues via New Places API (20 results, 8km radius). Seeds legacy pagination token in background. |
| GET | `/api/discover/venues/more?lat=&lng=&exclude=` | Yes | Next batch via `getVenuesWithRotation`. Per-user in-memory token store resets on server restart. |
| GET | `/api/discover/parties?lat=&lng=` | Yes | Public open parties within 50 miles. Sorted friends-first then by distance. |
| POST | `/api/discover/likes` | Yes | Save a venue to personal likes. Upserts on `(user_id, google_place_id)`. |
| DELETE | `/api/discover/likes/:place_id` | Yes | Remove a liked venue. |
| GET | `/api/discover/likes` | Yes | All liked venues, newest first. |
| GET | `/api/discover/pitch?name=&category=&...` | Yes | AI pitch for a discover venue (no party context). |
| GET | `/api/discover/places/search?q=&lat=&lng=` | Yes | Text search via `places:searchText` (New API). Used by CreatePost venue picker. |

---

### `/api/discover` — feed (all mounted at `/api/discover`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/discover/feed?limit=&after=&lat=&lng=` | Yes | Paginated feed. Cursor-based (by `created_at`). Enriched with creator info, like/comment/bookmark counts, `liked_by_me`, `bookmarked_by_me`, `follows_creator`, `distance_miles`. |
| POST | `/api/discover/feed/posts` | Yes | Create post. Body: `{ image_url, caption?, venue_name, venue_address?, venue_latitude?, venue_longitude?, venue_google_place_id? }`. |
| POST | `/api/discover/feed/upload-url` | Yes | Body: `{ ext? }`. Returns signed upload URL for `feed-photos` bucket + public URL. |
| POST | `/api/discover/feed/posts/:id/like` | Yes | Like a post. |
| DELETE | `/api/discover/feed/posts/:id/like` | Yes | Unlike. |
| POST | `/api/discover/feed/posts/:id/bookmark` | Yes | Bookmark. Body: `{ collection_id? }`. |
| DELETE | `/api/discover/feed/posts/:id/bookmark` | Yes | Remove bookmark. |
| GET | `/api/discover/feed/posts/:id/comments` | Yes | Comments ordered newest first. Enriched with author info. |
| POST | `/api/discover/feed/posts/:id/comments` | Yes | Body: `{ body }`. Max 500 chars. |
| DELETE | `/api/discover/feed/comments/:id` | Yes | Author-only comment deletion. |
| PATCH | `/api/discover/feed/posts/:id` | Yes | Author-only caption edit. |
| DELETE | `/api/discover/feed/posts/:id` | Yes | Author-only post deletion. |
| GET | `/api/discover/feed/my-posts` | Yes | Caller's own posts with like/comment counts. |
| GET | `/api/discover/feed/collections` | Yes | User's bookmark collections, oldest first. |
| POST | `/api/discover/feed/collections` | Yes | Body: `{ name }`. Create collection. |
| DELETE | `/api/discover/feed/collections/:id` | Yes | Owner-only collection deletion. |
| GET | `/api/discover/feed/saved?collection_id=` | Yes | Bookmarked posts. Filter by collection_id, or `collection_id=none` for uncollected. |
| POST | `/api/discover/feed/posts/:id/add-to-party` | Yes (member) | Copies a feed post's venue into the party's `locations` table as `is_priority=true`. |

---

### `/api/friends`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/friends` | Yes | Accepted friends, with `is_online` computed from `last_seen_at` within 5 minutes. |
| GET | `/api/friends/pending` | Yes | Incoming friend requests (I am addressee). |
| GET | `/api/friends/outgoing` | Yes | Outgoing friend requests (I am requester). |
| POST | `/api/friends/request` | Yes | Body: `{ user_id }`. Creates friendship row with status `pending`. |
| POST | `/api/friends/:id/accept` | Yes (addressee) | Sets status to `accepted`. |
| POST | `/api/friends/:id/decline` | Yes (addressee) | Deletes the friendship row. |
| DELETE | `/api/friends/:user_id` | Yes | Removes an accepted friendship from either side. |
| GET | `/api/friends/search?q=` | Yes | Search by display_name/email/username (prefix `@` to search username only). Returns users with their friendship status. |
| GET | `/api/friends/status/:user_id` | Yes | Lightweight status check: `{ status, friendship_id?, direction? }`. |

---

## Mobile Screens

### `LoginScreen`
Email/password signup and login form, plus Google OAuth via Supabase. Toggles between signup and login modes. Signup collects display name, email, password, school (optional), and graduation year. Google sign-in fires `supabase.auth.signInWithOAuth` which redirects to the current origin and lets `AuthContext` handle the hash fragment. Always renders in dark theme regardless of user preference.

Navigates to: `Home` (automatically via session change in `RootNavigator`).

---

### `OnboardingScreen`
Simple splash/intro screen shown before the auth flow. Not part of the main stack.

---

### `AuthCallbackScreen`
Handles the OAuth deep-link callback on native. On web this is handled directly by `AuthContext`; on native this screen is reached via `linkdup://auth-callback`. Calls `api.ensureProfile` to guarantee a `users` row exists.

---

### `CompleteProfileScreen`
Post-OAuth profile completion for cases where display_name is missing or needs refinement. Accessed via `MainStack` with `slide_from_bottom` animation.

---

### `WalkthroughScreen`
6-slide animated onboarding carousel shown once on first sign-in (if `has_seen_walkthrough = false`). Slides cover: welcome, create/join a party, crew map midpoint, swipe to match, calendar, and Discover feed. Each slide has a custom visual component (`SlideOneVisual`…`SlideSixVisual`). Calls `api.walkthroughSeen()` on completion. Cannot be back-navigated (gestureEnabled: false).

---

### `LocationPermissionScreen`
Shown after the walkthrough (if `location_permission_status = 'unset'`). Requests GPS via `expo-location`. If granted, calls `api.updateLocation`. If declined, offers "Maybe Later" which calls `api.setLocationPermission('maybe_later')`. Also shown when a user manually navigates to set or update location. Theme-aware.

---

### `HomeScreen`
Main dashboard. Shows: online friends row (up to 5), Friends card with pending badge, "Your Active Parties" list with per-party progress bars and stacked member avatars. FAB for creating a party. Pull-to-refresh. On first load checks `has_seen_walkthrough` and `location_permission_status` to redirect to Walkthrough or LocationPermission if needed. Uses `useFocusEffect` to reload on return from party screens.

Navigates to: `Walkthrough`, `LocationPermission`, `PartyLobby`, `Swipe`, `Match`, `CreateParty`, `JoinParty`, `Friends`.

---

### `CreatePartyScreen`
Form to name a new party and choose public/private visibility. Calls `api.createParty`, then navigates to `PartyLobby`.

---

### `JoinPartyScreen`
6-character code input. Calls `api.joinParty(code)`, navigates to `PartyLobby`.

---

### `PartyLobbyScreen`
Waiting room before swiping starts. Shows party code (copy/share), member list with avatars, `CrewMap` showing fuzzed member locations (Supabase realtime). Host sees "Start Swiping" button (disabled if no member locations) and party visibility toggle. All members see a leave/delete option in the context menu. Subscribes to `party_members` realtime for live join notifications.

Navigates to: `Swipe` (when host starts), `CrewMapFullscreen`, `Home`.

---

### `SwipeScreen`
Core swiping UI. Card stack with drag gesture (25% of screen width threshold). Loads venues from `api.getLocations(partyId)`, resumes at first unvoted venue based on `api.getMyVotes`. Real-time via Supabase channels:
- `votes` channel: shows toast when a crewmate votes, updates crew HUD badge (liked/passed)
- `party_members` channel: adds new members to crew HUD live

Features: progress bar, distance-from-midpoint pill, crew HUD with avatar bubbles, "✨ Why this?" AI pitch sheet, party info modal with code share. Every 15 votes shows "Keep swiping?" modal. When 3 venues remain, silently calls `GET /more-venues`. Solo parties show a "Done — pick now" button that calls `force-match`. On last card, polls `getMatch` to detect a match.

Navigates to: `Match` (on match), `PartyLobby` (back).

---

### `MatchScreen`
Celebration screen with confetti particles on match. Shows venue name, photo, rating, address, and crew member avatars. "Plan a Date" button navigates to `DateTimeSetup`. Shows crew member avatars; tapping a non-self avatar opens `UserProfileSheet`.

Navigates to: `DateTimeSetup`, `Home`.

---

### `DateTimeSetupScreen`
Date/time voting. Host triggers `POST /api/party/:id/dates` to generate the 30-day grid. All members see slot cards with `yes_count` tallies. Members check off available slots and submit. Host sees each slot's vote count and a "Lock this time" button per slot which calls `POST /api/party/:id/dates/lock`. Also supports a custom datetime picker.

Navigates to: `CalendarConfirmationScreen` (after lock).

---

### `CalendarConfirmationScreen`
Final confirmation after a date is locked. Shows venue + date + time summary. Two CTAs: "Export to Google Calendar" (if connected) or "Download .ics". GCal export calls `POST /api/calendar/party/:id/export`.

---

### `HangoutsScreen`
List of upcoming hangouts (matched/scheduled/locked parties). Sorted soonest-first (undated ones last). Each card shows venue name, date/time, member count. Tapping routes to `CalendarConfirmation` (locked), `DateTimeSetup` (matched without date), or `PartyLobby` (otherwise). Has an options menu per hangout for leaving. Theme-aware.

Navigates to: `DateTimeSetup`, `CalendarConfirmation`, `PartyLobby`.

---

### `DiscoverScreen`
Three-tab screen:
- **Explore**: Featured venue card (web) + horizontal scroll row of `VenueCard`s with heart/like buttons. Venue detail modal with AI "Why this?" button. Below that: "Active parties nearby" list with join buttons. Uses session-level module-scope cache to avoid re-fetching on tab switch when location hasn't changed.
- **Feed**: Renders `FeedView` component.
- **Your Likes**: Grid of saved `DiscoverLike` venues with unlike buttons.

All tabs pull from `useFocusEffect`. Theme-unaware (static dark `colors` import, not `useTheme`).

---

### `FriendsScreen`
Three sub-tabs: Friends (accepted), Requests (incoming + outgoing), Search. Search supports display_name/email/username with `@`-prefix for username-only. Shows friendship status badge per result (send request, pending, accepted). Debounced search with 400ms delay. Theme-aware.

---

### `ProfileScreen`
Full profile management. Inline edit for: display name, username (with live availability check), pronouns (with chip suggestions), birthday (custom month/day/year picker), bio, school, graduation year. Photo upload via `expo-image-picker` (base64 → `PUT /api/user/me/avatar`). Location section shows last updated time, manual city entry, and clear location option. Theme picker (dark/light/system). Account deletion with confirmation. Logout. Theme-aware.

---

### `CreatePostScreen`
Photo + caption + venue post composer. Photo picked via `expo-image-picker`. Venue search via `GET /api/discover/places/search`. Upload flow: gets signed URL from `POST /api/discover/feed/upload-url`, uploads photo directly to Supabase Storage, then creates post via `POST /api/discover/feed/posts`. Theme-aware.

---

### `MyPostsScreen`
Grid of the current user's own feed posts with like/comment counts. Long-press to delete or edit caption (edit via `PATCH /api/discover/feed/posts/:id`). Theme-aware.

---

### `SavedScreen`
Bookmarked posts with collection filter. Lists user's `bookmark_collections` in a horizontal filter row. Supports creating new collections inline. Displays posts with unlike/unbookmark actions. Theme-aware.

---

### `CrewMapFullscreenScreen`
Full-screen map of party member locations (fuzzed). Uses `CrewMap.web.tsx` on web (placeholder), `CrewMap.tsx` on native (MapView). Accessed from `PartyLobbyScreen`.

---

### `CrewMapRevealScreen`
Not in `MainStack.tsx`; legacy/unused.

---

## Mobile Components (Reusable)

### `BottomNav`
Persistent bottom tab bar with four destinations: Home, Discover, Hangouts, Profile. Uses `useNavigation` and `useRoute` to highlight the active tab. Theme-aware via `useTheme`.

### `AvatarBubble`
Circular avatar showing either an image (`avatar_url`) or an initials circle (`avatar_color`). Supports a `pulse` animation (spring scale) when a crewmate votes. Accepts `onPress` for navigating to `UserProfileSheet`.

### `FeedCard`
Full post card: image, creator info (avatar + display name + username), venue name with distance, caption, like/comment/bookmark counts, action buttons. Shows follow/unfollow button for non-self creators. Supports long-press options for post authors (edit caption, delete).

### `FeedView`
Infinite-scroll post feed list powered by `FlatList`. Fetches from `GET /api/discover/feed` with cursor pagination. Renders `FeedCard` per post. FAB navigating to `CreatePost`. Pull-to-refresh. Opens `CommentSheet` and `BookmarkSheet` as needed. Integrates `UserProfileSheet` for creator taps. Theme-aware.

### `CommentSheet`
Modal bottom sheet showing comments for a post. Fetches from `GET /api/discover/feed/posts/:id/comments`. Inline text input for adding a comment. Author-owned comments show a delete button. Theme-aware.

### `BookmarkSheet`
Modal bottom sheet for choosing which bookmark collection to save a post to. Shows existing collections. Has "New collection" inline creation. Theme-aware.

### `UserProfileSheet`
Modal bottom sheet showing a user's public profile (avatar, username, school, pronouns, age, bio). Shows friendship status and relevant action button (Add Friend, Pending, Accept, Friends, Unfollow for follows). Fetches profile via `GET /api/user/:id/public` and status via `GET /api/friends/status/:user_id`. Used in SwipeScreen, MatchScreen, HomeScreen, FeedView.

### `GradientButton`
Primary CTA button with a purple-to-cyan gradient background. Supports `variant="white"` for OAuth button. Accepts `leftIcon` and `rightIcon`. Disabled + loading states with spinner.

### `GlassCard`
Frosted glass container with `glassBorder`. Accepts `style` overrides.

### `CrewMap` / `CrewMap.web`
Shows party member locations on a map (fuzzed coordinates from server). Native: uses `react-native-maps` MapView. Web: renders a placeholder "Map view available on native" card since `react-native-maps` does not work in Expo web.

### `AnchoredHint`
First-time tooltip anchored to a specific UI element (via `ref`). Checks `user_screen_hints` via `HintsContext`. Renders an arrow pointing to the target element. Dismissed by tapping. Auto-dismissed on second app focus.

### `FirstVisitHint`
Full-width bottom hint bar shown once on first visit to a screen. Simpler than `AnchoredHint` — no anchor ref needed.

### `HelpButton`
Circular `?` button that opens a modal list of screen-specific help items (title + description pairs).

### `AppSwitch`
Theme-aware toggle switch wrapping React Native's `Switch`.

### `IconBadge`
Icon with a notification badge circle overlay (count or dot).

### `LinkdUpLogo`
Renders the LINKDUP wordmark with gradient or solid color fallback.

### Walkthrough visuals (`walkthrough/`)
`SlideOneVisual` through `SlideSixVisual` — animated SVG/view compositions for the 6 walkthrough slides. `Callout` and `HighlightRing` are shared primitives used inside those visuals.

---

## Theme System

Two color palettes live in `mobile/src/theme/colors.ts`:

**`darkColors`** — default, always used on LoginScreen/WalkthroughScreen
- `bg: #0A0A0F`, `surface: #15151F`, `primary: #6C3EF4`, `primaryAlt: #00C2FF`
- `gradient: ['#6C3EF4', '#00C2FF']`
- Text: white at 100/80/60/40/30% opacity
- `glass: rgba(255,255,255,0.05)`, `glassBorder: rgba(255,255,255,0.10)`

**`lightColors`** — activates when user chooses light or system-follows-light
- `bg: #FAFAFB`, `surface: #FFFFFF`
- Same `primary` and `gradient`
- Text: `#0A0A0F` at 100/80/60/40/30% opacity
- `glass: rgba(0,0,0,0.04)`, `glassBorder: rgba(0,0,0,0.08)`

**`ThemeContext`** wraps the app and provides `{ mode, isDark, colors, setMode, syncFromProfile }`:
- `mode`: `'dark' | 'light' | 'system'`
- `isDark`: computed from mode + device `useColorScheme`
- `setMode`: persists to `localStorage` (key `linkdup_theme`) + PATCH /api/user/me with `theme_preference`
- `syncFromProfile`: called by HomeScreen on first load to apply the server-persisted preference

**Theme-aware screens** (use `useTheme()` and compute `StyleSheet` dynamically with `useMemo`): HomeScreen, SwipeScreen, PartyLobbyScreen, ProfileScreen, FriendsScreen, HangoutsScreen, CreatePostScreen, MyPostsScreen, SavedScreen, FeedView, LocationPermissionScreen, and most components.

**Always-dark screens** (import static `colors` directly): LoginScreen, WalkthroughScreen, DiscoverScreen, OnboardingScreen.

---

## External Integrations

### Google Places API (New)
- Endpoint: `https://places.googleapis.com/v1/places:searchNearby`
- Used for the initial venue load on party start and all Discover venue fetches
- Auth: `X-Goog-Api-Key` header
- `includedTypes` must be snake_case enum strings (e.g. `art_gallery`, `bowling_alley`) — the legacy text format returns 0 results
- Field mask: `places.id, places.displayName, places.formattedAddress, places.location, places.rating, places.userRatingCount, places.priceLevel, places.photos, places.primaryType, places.types`
- Photos use: `https://places.googleapis.com/v1/{photo.name}/media?maxHeightPx=800&key=...`
- **No pagination support** in `searchNearby` — use rotation buckets instead for load-more

### Google Places Legacy API (v1 — Nearby Search)
- Endpoint: `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
- Used only to seed `next_page_token` on party start and discover initial load so the first "load more" call gets page-2 results instead of duplicating page-1
- Pagination requires sending `pagetoken` as the **only** parameter besides `key`

### Google Geocoding API
- Endpoint: `https://maps.googleapis.com/maps/api/geocode/json`
- Used for `PUT /api/user/location/manual` to convert a city name to coordinates

### Google Calendar API
- Node.js `googleapis` package, `calendar.events.insert` and `calendar.events.delete`
- OAuth2 flow: user visits `/api/calendar/oauth/start` → Google consent → `/api/calendar/oauth/callback` stores `access_token` and `refresh_token` in `users` table
- Tokens auto-refresh via the `googleapis` client when `refresh_token` is set
- GCal event ID stored in `parties.gcal_event_id` for cleanup on leave/delete

### Google OAuth (User Auth)
- Handled by Supabase OAuth (`supabase.auth.signInWithOAuth({ provider: 'google' })`)
- On web: redirect returns to origin with hash fragment; `AuthContext` parses it and calls `ensureProfile`
- On native: deep link `linkdup://auth-callback` handled by `AuthCallbackScreen`

### Gemini AI (Venue Pitches)
- Model: `gemini-2.5-flash-lite`
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
- Free tier (as of April 2026): 15 req/min, 1,000 req/day
- Key must be created at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) in a **separate Google Cloud project with no billing attached** — keys in billing-enabled projects are routed to the paid tier and deplete quickly
- Results are cached process-wide in a `Map<string, string>` keyed by `name|address|member_count|party_name`
- Falls back to a static message if key is absent or Gemini errors

### Supabase Storage
Two public buckets created automatically on server startup:
- **`avatars`**: user profile photos. Path: `{userId}.jpg`. Max 5 MB. Public URL stored in `users.avatar_url`.
- **`feed-photos`**: post images. Path: `{userId}/{timestamp}.{ext}`. Max 10 MB. Uploaded via signed URL from `POST /api/discover/feed/upload-url`.

### Supabase Realtime
Used in `SwipeScreen` for:
- `postgres_changes` on `votes` table filtered by `party_id` — live crew vote status
- `postgres_changes` on `party_members` table — live join notifications

Used in `PartyLobbyScreen` for:
- `postgres_changes` on `party_members` — members joining in real-time
- `postgres_changes` on `parties` — status change to `swiping` triggers navigation to `SwipeScreen`

---

## Environment Variables

All vars read by `server/src/config.ts`. Required vars throw on startup if missing.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | CORS allowed origin (default `*`) |
| `SUPABASE_URL` | Yes | Supabase project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service_role key (bypasses RLS) |
| `GOOGLE_MAPS_API_KEY` | Yes | Google Maps + Places API key |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | OAuth 2.0 client ID for Google Calendar |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must match redirect URI in Google Cloud Console (e.g. `http://localhost:3000/api/calendar/oauth/callback`) |
| `GEMINI_API_KEY` | No | Gemini API key. Falls back to static pitch text if absent. Must be from AI Studio, not a billing-enabled project. |
| `ANTHROPIC_API_KEY` | No | Legacy field; not actively used. |

Mobile env var (in `mobile/.env` or `app.config.js`):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Full URL to the Express server (e.g. `http://localhost:3000`) |

---

## Known Quirks and Gotchas

**Never run `npm audit fix --force`** on this project. It downgrades Expo 54 to Expo 46 and catastrophically breaks the build. If dependency warnings appear, use `npm install --legacy-peer-deps`, never plain `npm install`.

**New Places API `includedTypes` must be snake_case** (`art_gallery` not `"art gallery"`). Using spaces or the wrong casing causes the API to return 0 results silently.

**Legacy Places API vs New Places API**: The New API (`places.googleapis.com/v1`) is used for all fresh venue fetches. The Legacy API (`maps.googleapis.com/maps/api/place/nearbysearch`) is used only to seed `next_page_token` for pagination, because the New `searchNearby` endpoint has no pagination — it returns up to 20 results with no continuation token.

**Gemini API key must live in a fresh Google Cloud project** with no billing configured. Keys in billing-enabled projects hit a paid tier quickly. Create at https://aistudio.google.com/app/apikey.

**Supabase RLS with service_role**: All server writes go through `supabaseAdmin` (service_role key), which bypasses RLS. The `WITH CHECK (true)` policies on `users` INSERT exist because `auth.uid()` returns NULL for service_role requests — the default `auth.uid() = id` check would silently block all server-side profile creation.

**No PostgREST nested selects**: FK joins to Supabase are always done as two sequential queries (fetch IDs → fetch related rows → merge in JS), never as PostgREST embedded selects (`?select=*,users(*)`). Embedded selects silently returned nulls on this project's schema cache configuration.

**Coordinate fuzzing**: Member locations shown on `CrewMap` and in `/api/party/:id/members` are fuzzed by ±~0.01° using a deterministic per-user hash. The actual coordinates are stored and used for midpoint calculation but never sent to clients raw.

**Online status**: `last_seen_at` is updated on each authenticated request via the `updateLastSeen` middleware. A user is considered online if `last_seen_at` is within the last 5 minutes.

**Venue rotation buckets** in `services/places.ts`:
- Bucket 0: culture (museums, art galleries, tourist attractions)
- Bucket 1: outdoor (parks, national parks)
- Bucket 2: entertainment (bowling, movies, night clubs, amusement parks)
- Bucket 3: fitness & retail (gyms, shopping malls, book stores)
- Bucket 4: food (restaurants, cafes, bars, bakeries) — last bucket to avoid food flooding early pages

Each load-more call increases the base radius by 3 km (capped at 25 km).

**Match engine rules**:
- Solo/duo parties (1-2 members): evaluates only after every member has voted on every venue. Winner is the venue with the latest `voted_at` timestamp among yes-votes, tie-broken by yes count.
- Normal parties (3+ members): first venue to cross strict majority (yes_count × 2 > member_count) wins mid-deck.

**Party visibility**: Parties default to `is_public = false`. Host can toggle in lobby. Only public parties appear in Discover. Private parties can only be joined by sharing the 6-character code.

**Storage buckets**: Avatars and feed-photos buckets are created automatically on server startup (`createBucket` with `ignoreDuplicates` via `.catch(() => {})`).

**`@react-native-masked-view/masked-view`** is used for the gradient wordmark on `LoginScreen`. On web it falls back gracefully to a single-color wordmark if the package throws.

---

## How to Run

```bash
# Terminal 1 — server
cd server
npm run dev
# Runs: tsx watch src/index.ts
# Listens on http://localhost:3000

# Terminal 2 — mobile
cd mobile
npx expo start --web --clear
# Browse to http://localhost:8082
```

Copy `server/.env.example` to `server/.env` and fill in all required values before starting.

---

## Migrations to Run on a Fresh Database

Run these in order in the Supabase SQL Editor. Start with `schema.sql`, then apply numbered migrations in sequence.

| File | Description |
|---|---|
| `schema.sql` | Baseline: schools, users, parties, party_members, locations, votes, party_dates, date_votes, v_party_vote_tallies view, RLS policies |
| `001_fix_fks.sql` | Fixes foreign key constraints on parties table |
| `002_fix_rls.sql` | Corrects early RLS policy mistakes |
| `003_fix_users_policy.sql` | Fixes users SELECT policy to avoid recursion |
| `004_avatar_url.sql` | Adds `avatar_url` column to users |
| `005_enable_realtime.sql` | Enables Supabase Realtime publication on key tables |
| `006a_seed_schools_part1.sql` | Seeds ~250 US colleges |
| `006b_seed_schools_part2.sql` | Seeds another ~250 US colleges |
| `006c_seed_schools_part3.sql` | Seeds remaining colleges |
| `007_add_next_page_token.sql` | Adds `next_page_token` column to parties for load-more pagination |
| `008_discover_likes.sql` | Creates `discover_likes` table |
| `009_venue_rotation.sql` | Adds `venue_rotation_seed` column to parties |
| `010_profile_fields.sql` | Adds `pronouns`, `birthday`, `bio` to users |
| `011_consolidated_state.sql` | Various state/status fixes |
| `012_gcal_event_id.sql` | Adds `gcal_event_id` column to parties |
| `013_friends.sql` | Creates `friendships` table |
| `015_walkthrough_flag.sql` | Adds `has_seen_walkthrough` to users |
| `016_screen_hints.sql` | Creates `user_screen_hints` table |
| `017_usernames.sql` | Adds `username` column to users + backfills from display_name |
| `018_online_status.sql` | Adds `last_seen_at` to users |
| `019_location_permission.sql` | Adds `location_permission_status` to users |
| `020_discover_feed.sql` | Creates `feed_posts` table |
| `021_feed_interactions.sql` | Creates `feed_likes`, `feed_bookmarks`, `feed_comments`, `user_follows` tables |
| `022_theme_preference.sql` | Adds `theme_preference` column to users |
| `023_party_visibility.sql` | Adds `is_public` boolean to parties |
| `024_bookmark_collections.sql` | Creates `bookmark_collections` table + adds `collection_id` to feed_bookmarks |
| `025_feed_priority.sql` | Adds `is_priority` boolean to locations |
| `026_remove_seed_posts.sql` | Deletes the 6 seed posts inserted by migration 020 |
| `fix_schema.sql` | Miscellaneous schema repairs — apply if any of the above hit constraint errors |

Note: migration 014 does not exist (skipped in numbering).

---

## Feature List (Confirmed Working)

### Auth
- Email + password signup with school lookup
- Email + password login
- Google OAuth (web: hash fragment; native: deep link)
- Profile auto-created on signup and on first OAuth sign-in
- Sign out + full account deletion

### Profile
- Edit display name, username (with live availability check), pronouns, birthday, bio, school, graduation year
- Avatar photo upload from device camera roll
- Username validation: 3-20 chars, lowercase letters/numbers/underscores, must start with letter, reserved names blocked

### Location
- GPS permission request on first login (after walkthrough)
- Manual city fallback (geocoded via Google Geocoding API)
- Location display in party lobby map (fuzzed per user)
- Clear location / revoke permission

### Theme
- Dark, light, and system-follows-device modes
- Persisted to `localStorage` on web and to `users.theme_preference` on server
- Applied on HomeScreen load via `syncFromProfile`

### Parties
- Create (optional name, public/private)
- Join via 6-char code
- Host-only: start swiping, delete party, lock date, toggle visibility
- Member: leave party
- Party progress bar on HomeScreen card
- Party lobby with member avatars and crew map

### Swipe
- Card stack with drag gesture + button taps (web-compatible)
- Realtime crew HUD showing crewmate vote status live
- Category-rotation load-more (5 buckets, radius expanding to 25 km)
- "✨ Why this?" AI pitch via Gemini
- "Keep swiping?" prompt every 15 votes with opt-out
- Solo "Done — pick now" button (force-match)
- Party info modal with code copy/share
- Deck resume from last unvoted venue on re-open

### Match Engine
- Small parties (1-2): last right-swipe timestamp wins after full deck
- Normal parties (3+): strict majority wins mid-deck
- Realtime match detection via server response and polling on last card

### Calendar
- Google Calendar OAuth connect/disconnect
- Export locked hangout to Google Calendar (with attendee emails)
- ICS file download fallback for non-connected users
- GCal event cleanup on party leave or delete (both host and member paths)

### Hangouts
- Upcoming hangouts sorted soonest-first
- Date/time voting grid (30 days × 4 slots)
- Custom datetime picker
- Host can lock any time slot

### Discover (Explore)
- Trending venues near user (New Places API, 8 km radius, popularity-ranked)
- Venue detail modal with photo, rating, address, AI pitch
- Heart-to-save venues to "Your Likes"
- Load-more with rotation buckets
- Your Likes tab with unlike
- Active parties nearby within 50 miles with friends-first sort and "Friends inside" badge
- One-tap join from Discover

### Discover (Feed)
- Social photo feed with infinite cursor-based pagination
- Like, comment, bookmark posts
- Follow/unfollow post creators
- Bookmark collections (named folders)
- Saved posts view with collection filter
- "Add to party" to push a feed venue into a party's swipe deck (as `is_priority=true`)
- Create post: photo + caption + venue search (text search via Places API)
- Edit post caption, delete post
- My Posts management screen

### Friends
- Search by name, email, or `@username`
- Send/cancel friend request
- Accept/decline incoming requests
- Remove accepted friendship
- Online status indicator (within 5 min)
- Pending request badge on HomeScreen Friends card

### Walkthrough
- 6-slide animated onboarding shown once on first sign-in
- Each slide has a custom visual component
- Skippable; completion marks `has_seen_walkthrough = true`

### Map
- Crew map in party lobby showing fuzzed member locations
- Full-screen map mode
- Native: `react-native-maps` MapView
- Web: placeholder (MapView not available on Expo web)

### Usernames
- Globally unique, case-insensitive
- 3-20 chars, lowercase `[a-z][a-z0-9_]+`
- Live availability check during profile edit
- Shown in feed cards, comments, friend search, public profiles

---

## Style Rules (For AI Tools)

- No comments in code unless strictly necessary for non-obvious logic. No `// Import X`, `// Define function`, `// Return result` style narration.
- Variable names must be self-explanatory.
- No semicolons in prose writing.
- No en-dashes — use hyphens or rephrase.
- TypeScript/JavaScript preferred. When writing Java (rare): intern-level, verbose, simple. No `streams` or `Optional` gymnastics.
- Install dependencies with `npm install --legacy-peer-deps`. Never `npm install` or `npm audit fix --force`.
- The Supabase service_role key lives in `server/.env` (not `.env.example`).
- The dev UUID for local testing is `19ac7bb1-8db5-4d27-883f-a4e8de8978b0`.
- Always use `--legacy-peer-deps` for installs.
