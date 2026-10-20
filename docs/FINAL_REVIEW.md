# Final Review

Scope: server security, data integrity, Google and Supabase cost, dead code and stale docs, and free-tier failure modes. Accessibility and native iOS/Android are out of scope. Review of `main` at `c43ce51`, 2026-10-19.

**Counts:** 1 Critical, 2 High, 12 Medium, 14 Low.

How findings were checked:
- Routes come from every `router.get/post/put/patch/delete` in `server/src/routes` (98 routes, list at the end).
- Secrets: a regex scan of the full git history (`git log --all -p`). Leaked values were compared by hash with the local `.env` files and never printed.
- Supabase exposure: count-only REST reads with the public key from the live web bundle, plus one REST read with the leaked legacy anon key.
- Tests on this commit: server `npm test` 310 passed, 0 failed.

## Critical

| # | Finding | Where | Smallest fix |
|---|---|---|---|
| C1 | **A live Google Maps key is in public git history.** The repo is public. Commits `c67322c` and `7263f2d` put real values in `mobile/.env.example`, `server/.env.example` and `server/.env.production.example`: a Maps key, a Google OAuth client secret, and the Supabase legacy anon and service_role JWTs. Both commits are in `origin/main` and every remote branch. The leaked Maps key is identical to `GOOGLE_MAPS_API_KEY` in the local `server/.env`. The key has no application restriction ([DEPLOYMENT.md:40](DEPLOYMENT.md)), so anyone can spend the Places and Geocoding quota. That blocks venue search for every user until the daily reset, and the project pays for it. **Already contained:** the legacy Supabase keys were disabled on 2026-10-14; a REST call with the leaked anon key returns 401 "legacy API keys disabled". The current OAuth secret differs from the leaked one. | `git show 7263f2d`, `git show c67322c` | In Google Cloud, create a new Maps key with the same API restrictions, put it on Render, then delete the old key. Never re-enable the Supabase legacy keys. Rewriting history is optional; clones and forks keep the old commits anyway. |

## High

| # | Finding | Where | Smallest fix |
|---|---|---|---|
| H1 | **Anyone can spend the Place Photos quota without logging in.** `/api/photo` has no auth. It allows 120 requests a minute per IP, and the cache key includes the width (`w` from 1 to 1600), so changing `w` skips the cache. With the documented cap of 1,000 photos a day, one IP uses it up in about 9 minutes. After that every venue photo fails for every user until the reset. | [photo.ts:11](../server/src/routes/photo.ts#L11), [photo.ts:41](../server/src/routes/photo.ts#L41), [photo.ts:91](../server/src/routes/photo.ts#L91), [photo.ts:101](../server/src/routes/photo.ts#L101) | Round the width to 400 or 800 in `parseQuery`, and lower `RATE_LIMIT` to about 30. |
| H2 | **The Discover routes that call Google have no rate limit.** `/venues`, `/venues/more` and `/places/search` call Places on every request. The nearby cache key is a 0.01° grid cell, so varying `lat` and `lng` always misses it. One signed-in script can use up the 300/day Nearby cap in seconds, and venue search then stops for everyone. `/places/search` uses Text Search, which has no daily cap in [DEPLOYMENT.md:46-49](DEPLOYMENT.md), and it has no timeout, so that cost is unbounded apart from the budget alert. | [discover.ts:36](../server/src/routes/discover.ts#L36), [discover.ts:66](../server/src/routes/discover.ts#L66), [discover.ts:277](../server/src/routes/discover.ts#L277), [discover.ts:292](../server/src/routes/discover.ts#L292), [places.ts:101-114](../server/src/services/places.ts#L101-L114) | After `requireAuth` on all three routes, add `rateLimit(10, 60_000, (req) => (req as AuthedRequest).user?.id)`, the same pattern as [reports.ts:25](../server/src/routes/reports.ts#L25). Set a daily cap on Text Search in Google Cloud. |

## Medium

| # | Finding | Where | Smallest fix |
|---|---|---|---|
| M1 | `ensure-profile` saves whatever email the client sends. That email shows up in friend search and becomes a Google Calendar attendee for party exports. | [auth.ts:190](../server/src/routes/auth.ts#L190), [calendar.ts:66-72](../server/src/routes/calendar.ts#L66-L72), [dates.ts:132](../server/src/routes/dates.ts#L132) | Use `email: req.user!.email`. |
| M2 | Calendar invites can be sent again and again. Export has no limit or idempotency, and every Lock re-exports for every connected member with `sendUpdates: 'all'`, so each tap emails every member again. `gcal_event_id` is overwritten, so older events are left behind. | [calendar.ts:47](../server/src/routes/calendar.ts#L47), [dates.ts:303](../server/src/routes/dates.ts#L303), [googleCalendar.ts:94](../server/src/services/googleCalendar.ts#L94) | Skip the export when `parties.gcal_event_id` is already set, and in `lock` return early when `locked_date_id` already equals `dateId`. |
| M3 | Friend search matches email substrings, so anyone signed in can check whether an address has an account. There is no rate limit. | [friends.ts:72-74](../server/src/routes/friends.ts#L72-L74) | Remove `email.ilike` from the filter. |
| M4 | There is no limit on signed upload URLs, and posts accept any `image_url`. One account can fill the 1 GB free storage, or put external tracking images in everyone's feed. | [feed.ts:164-182](../server/src/routes/feed.ts#L164-L182), [feed.ts:120-137](../server/src/routes/feed.ts#L120-L137) | Add a per-user `rateLimit` to `upload-url`, and require `image_url` to start with the caller's `feed-photos/<uid>/` public URL. |
| M5 | When the host leaves, the party is stuck. The host still owns it but fails `assertMember`, and nobody else can start or delete it. A party whose last member leaves is never cleaned up. | [party.ts:202-224](../server/src/routes/party.ts#L202-L224) | In `leave`, return `409 host_must_delete` when the caller is the host. |
| M6 | Account deletion reports `ok` even when the auth user wasn't deleted. supabase-js returns errors instead of throwing them, so the `try/catch` around each `.delete()` never catches anything. | [user.ts:362-412](../server/src/routes/user.ts#L362-L412), [user.ts:415-424](../server/src/routes/user.ts#L415-L424) | If `authErr` is set, respond with 500 so the user can retry. |
| M7 | Realtime `party_members` inserts never reach other members, because RLS only lets each user read their own row. The Swipe crew list and the "joined the party" toast stay stale with no error. The lobby falls back to its 15-second poll. The README says the opposite. Don't loosen RLS: these rows hold exact live coordinates. | [PartyLobbyScreen.tsx:82-84](../mobile/src/screens/PartyLobbyScreen.tsx#L82), [SwipeScreen.tsx:397-399](../mobile/src/screens/SwipeScreen.tsx#L397), [032_lock_down_rls.sql:66-67](../server/src/db/migrations/032_lock_down_rls.sql#L66-L67), [README.md:67](../README.md#L67) | Remove the two `party_members` subscriptions, and call `api.getMembers` from the Swipe screen's `parties` UPDATE handler. |
| M8 | The card advance has no compare-and-set. Two last votes at the same moment, or a double tap in a solo party, can skip a card or run `closeRound` twice. That means two Places calls and `voting_round` going up by 2. | [matchEngine.ts:296-315](../server/src/services/matchEngine.ts#L296-L315) | Add `.eq('current_card_index', party.current_card_index)` to the update, and only call `closeRound` if a row was updated. |
| M9 | The keep-alive runs once a week, but Supabase pauses after about a week idle. GitHub can delay scheduled runs, and turns schedules off after 60 days without repo activity, so after the semester the database will pause with no warning. | [keepalive.yml:5](../.github/workflows/keepalive.yml#L5), [DEPLOYMENT.md:66-68](DEPLOYMENT.md) | Run it twice a week: `'0 13 * * 1,4'`. |
| M10 | DEPLOYMENT.md says place IDs, names, addresses, photo names and exact locations are never stored in Supabase. They are stored: party `locations` rows, `discover_likes`, `party_members.live_*` and `users.latitude/longitude`. This is a compliance claim, so it matters that it's wrong. | [DEPLOYMENT.md:58](DEPLOYMENT.md), [party.ts:293-294](../server/src/routes/party.ts#L293-L294), [discover.ts:210-226](../server/src/routes/discover.ts#L210-L226), [party.ts:136-145](../server/src/routes/party.ts#L136-L145), [user.ts:110-112](../server/src/routes/user.ts#L110-L112) | Correct the doc, then recheck it against the Places terms. |
| M11 | `PUT /location/manual` geocodes with no rate limit, while `/location/search` has one. Every new city name is a paid Geocoding call; the cache stops writing after 60 a minute. | [user.ts:143](../server/src/routes/user.ts#L143), [user.ts:132](../server/src/routes/user.ts#L132) | Add `rateLimit(PLACE_SEARCH_LIMIT, 60_000)` before `requireAuth`. |
| M12 | `POST /schools/lookup` has no auth and inserts into the shared school list, up to 30 a minute per IP. | [schools.ts:14-38](../server/src/routes/schools.ts#L14-L38) | Add `requireAuth`. The app only calls it after sign-in. |

## Low

| # | Finding | Where |
|---|---|---|
| L1 | `v_party_vote_tallies` is a plain view, so it runs with its owner's rights. Checked live: the public key reads 0 rows, so nothing leaks today. Fix: `alter view ... set (security_invoker = true)` or revoke it from `anon` and `authenticated` to make that explicit. | [schema.sql:176](../server/src/db/schema.sql#L176) |
| L2 | The local `server/.env` and `mobile/.env` still hold the disabled legacy Supabase keys, so local development against Supabase gets 401s. | local only |
| L3 | Some migrations can't be re-run. `005` fails on a second run even though its comment says it's safe. The `ADD TABLE proposal_responses` in `029` isn't guarded. `037` can't run after `038` (documented). There's no `014`, `fix_schema.sql` has no number, and README step 1 doesn't say how `schema.sql` and the migrations should be ordered on a fresh project. | [005_enable_realtime.sql:3-6](../server/src/db/migrations/005_enable_realtime.sql), [029_locked_step_voting.sql:44](../server/src/db/migrations/029_locked_step_voting.sql#L44), [README.md:135](../README.md#L135) |
| L4 | Dead code. No screen calls the server endpoints `POST /dates/vote`, `/dates/custom`, `/dates/lock`, `GET /votes`, `PATCH /visibility` or `GET /more-venues`, and the matching wrappers in `api.ts` are unused. `legacyEvaluateMatch` only runs for parties from before migration 029. The `getNearbyVenues` alias is unused. `next_page_token` is always null. | [dates.ts:349](../server/src/routes/dates.ts#L349), [dates.ts:386](../server/src/routes/dates.ts#L386), [dates.ts:422](../server/src/routes/dates.ts#L422), [vote.ts:47](../server/src/routes/vote.ts#L47), [party.ts:189](../server/src/routes/party.ts#L189), [party.ts:416](../server/src/routes/party.ts#L416), [matchEngine.ts:19-122](../server/src/services/matchEngine.ts#L19-L122), [places.ts:240](../server/src/services/places.ts#L240) |
| L5 | `MatchScreen` calls `api.generateDates`, which posts with no body. That always returns 400, and the error is swallowed. | [MatchScreen.tsx:197](../mobile/src/screens/MatchScreen.tsx#L197), [dates.ts:29](../server/src/routes/dates.ts#L29) |
| L6 | Some in-memory maps only shrink on restart: the pitch cache, last-seen throttle and Discover rotation seeds. | [aiPitch.ts:21](../server/src/services/aiPitch.ts#L21), [updateLastSeen.ts:5](../server/src/middleware/updateLastSeen.ts#L5), [discover.ts:19](../server/src/routes/discover.ts#L19) |
| L7 | Some error details reach the client: signup returns Supabase's error text, the 404 handler echoes the path, and Zod issues are returned as-is. | [auth.ts:43](../server/src/routes/auth.ts#L43), [index.ts:65-67](../server/src/index.ts#L65-L67), [error.ts:30](../server/src/middleware/error.ts#L30) |
| L8 | morgan's `combined` format logs full URLs. That puts precise `lat`/`lng` from Discover and feed requests, and the OAuth `code`, in the Render logs. | [index.ts:40](../server/src/index.ts#L40) |
| L9 | Blocks are only partly enforced: comment lists still show blocked users, and friend search still returns them. | [feed.ts:258](../server/src/routes/feed.ts#L258), [friends.ts:61-89](../server/src/routes/friends.ts#L61-L89) |
| L10 | The OAuth app is in Testing mode, so refresh tokens expire after 7 days. Export then fails with a 500, while `/auth/me` still says Google is connected. KNOWN_ISSUES doesn't mention the 7-day expiry. | [auth.ts:213-215](../server/src/routes/auth.ts#L213-L215), [KNOWN_ISSUES.md:3](KNOWN_ISSUES.md) |
| L11 | `leave` deletes the party's calendar event using the caller's Google token, even when the caller isn't a member. If the event's organizer leaves, the event is cancelled for everyone. | [party.ts:207-215](../server/src/routes/party.ts#L207-L215) |
| L12 | Creating a party ignores a failed host-member insert. The host then can't open their own party. | [party.ts:57-61](../server/src/routes/party.ts#L57-L61) |
| L13 | `requireAuth` calls Supabase Auth on every request, and the lobby polls every 15 seconds, so Auth traffic grows with each open lobby. That's fine at the current scale. | [auth.ts:21](../server/src/middleware/auth.ts#L21), [pollWhileVisible.ts:1](../mobile/src/hooks/pollWhileVisible.ts#L1) |
| L14 | Several docs are out of date. README test counts: 254/193/78 listed, 310/214/126 now. README claims write caps run before every Google call (see H1 and H2). TEST_PLAN and SETUP_GUIDE still mention Railway. FRIENDS_AUDIT describes the code from before follows. | [README.md:103-105](../README.md#L103-L105), [README.md:129](../README.md#L129), [TEST_PLAN.md:6](TEST_PLAN.md), [SETUP_GUIDE.md:75](SETUP_GUIDE.md), [FRIENDS_AUDIT.md](FRIENDS_AUDIT.md) |

## What held up

- Every party, vote, match, date and calendar route checks membership or host. The 404 vs 403 behaviour is consistent.
- The demo guard runs inside `requireAuth`. It blocks every write except logout, plus the three GET routes that cost money. The demo account is served Discover, more-venues and pitches from stored data.
- RLS is on for every table. Since `032` there are no allow-all policies, `reports` and `google_cache` are revoked from client roles, and live counts with the public key return 0 rows.
- The report route uses a strict schema, limits per IP and per account, rejects reporting yourself, and allows one report per pair per day.
- Follows: you can't follow yourself, blocks are checked before following, and blocking removes follows in both directions. `friendships_legacy` is unused and keeps its rows.
- Foreign keys cascade from `auth.users` through `users` to every user-owned table, so deleting an account leaves no orphaned rows. The only leftovers are feed photos uploaded without a post.
- CORS needs an allow-list in production, helmet is on, and 5xx errors hide internal messages.
- No TODO, FIXME or HACK markers in the source.

## Route list

`index.ts` mounts 14 routers.

- auth (7): signup, login, demo-available, demo, logout, ensure-profile, me
- calendar (4): oauth/start, oauth/callback, party/:id/export, party/:id/ics
- dates (8)
- discover (8)
- feed (18)
- friends (3)
- health (1, plus `/healthz` and `/api/health` in `index.ts`)
- match (1)
- party (15)
- photo (1)
- reports (1)
- schools (3)
- user (25)
- vote (3)

All routes use `requireAuth` except these:

- `/api/photo`: H1
- `/api/schools/lookup`: M12
- `/api/health/db`: rate limited
- `/api/calendar/oauth/callback`: protected by signed state
- `/api/auth/signup`, `login`, `demo`: rate limited
- `/api/auth/demo-available`
