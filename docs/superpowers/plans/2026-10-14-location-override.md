# Live Location and Per-Party Override Implementation Plan

> **For agentic workers:** Executed natively in one session (no subagents, per request). Steps use checkbox syntax.

**Goal:** Party math and Discover use a fresh live reading by default, members can set a per-party custom place, and a stale saved location never wins.

**Architecture:** Per-party location lives on `party_members` (live and custom kept side by side plus a preferred mode). One server function, `effectiveLocation`, picks the coordinates for every party computation. One pure mobile function, `chooseLocation`, picks what the lobby shows and sends.

**Tech Stack:** Express + zod + supabase-js (server), Expo / React Native Web (mobile), node:test on both sides.

**Spec:** this document (design and ADR below).

## Root cause

`LocationPermissionScreen` is the only place that reads GPS, and it only opens while `location_permission_status` is not `granted`. After the first grant (taken at NJIT) the reading in `users.latitude/longitude` was reused by Discover, party start, the crew map and the distance lists forever. No hardcoded coordinates exist.

## ADR-001: Where per-party location lives

**Status:** Accepted. **Date:** 2026-10-14.

| Option | Complexity | Fits "per party" | Notes |
|---|---|---|---|
| A. `users` columns (source, label) | Low | No, one global override | Override leaks into every party and Discover |
| B. `party_members` columns | Low | Yes, one row per member per party already | No new joins, RLS already denies clients |
| C. New `member_locations` table | Medium | Yes | Extra table, joins and policies for no gain |

**Decision:** B. Columns `live_latitude`, `live_longitude`, `live_at`, `custom_latitude`, `custom_longitude`, `custom_label`, `location_mode` (`live` or `custom`, default `live`). `users.latitude/longitude` stays as the account's last live reading for Discover only and is never used for party math.

**Consequences:** members must have opened the lobby (which takes a live reading) or set a custom place before they count toward the midpoint. Migration 033 is required.

## Selection rules (both sides)

1. Mode `custom` and a custom place exists: custom.
2. A live reading newer than 3 hours: live.
3. A custom place exists: custom.
4. Otherwise: nothing, and the app asks the member.

## Global Constraints

- No code comments, no new dependencies, no hardcoded coordinates.
- Coordinates shown to other members stay fuzzed with `fuzzCoords`.
- Server validates finite numbers, lat in [-90, 90], lng in [-180, 180], label 1 to 120 chars, and rate limits the write (30/min) and the place search (10/min).
- Custom place lookups go through `geocodeCity` so quota errors become `venue_limit_reached`.

## Review Focus

- Member whose saved `users` row is NJIT but who has no party reading: excluded from the midpoint, not placed at NJIT.
- Live reading from yesterday plus a custom place: custom wins.
- Browser permission `prompt`: no prompt fires until the member taps the button under the explanation.
- Geolocation that never answers: reported as timeout, with Try again and Use a different location.
- Geocoding over quota: friendly paused message, never "not found".

---

### Task 1: Server selection rule
**Files:** create `server/src/services/memberLocation.ts`, test `server/test/memberLocation.test.ts`.
**Produces:** `effectiveLocation(row, now?) => LatLng | null`, `LIVE_MAX_AGE_MS`.
- [ ] Failing tests for the four rules and for null or non-finite coordinates.
- [ ] Implement, run, pass.

### Task 2: Migration and write endpoint
**Files:** create `server/src/db/migrations/033_party_member_location.sql`; modify `server/src/routes/party.ts`; test `server/test/partyLocation.test.ts`.
**Produces:** `PUT /api/party/:id/location` with `{ mode: 'live', latitude, longitude }` or `{ mode: 'custom', latitude, longitude, label }`, returning `{ mode, custom_label, live_fresh }`; `GET /api/party/:id` gains `my_location` of the same shape.
- [ ] Failing tests: bad types and ranges give 400, custom without label gives 400, non-member gives 403, the 31st call gives 429, live and custom both write `party_members`, live also refreshes `users`.
- [ ] Implement, run, pass.

### Task 3: Party math uses `effectiveLocation`
**Files:** modify `server/src/routes/party.ts` (members, start, locations) and `server/src/routes/discover.ts` (parties); update `server/test/location.test.ts`, `server/test/errors.test.ts`.
- [ ] Failing test: start ignores an NJIT `users` row and uses the party reading; members map shows fuzzed effective coordinates.
- [ ] Implement, run, pass.

### Task 4: Place search for custom locations
**Files:** modify `server/src/services/places.ts` (return a label), `server/src/routes/user.ts`; test in `server/test/partyLocation.test.ts`.
**Produces:** `GET /api/user/location/search?q=` returning `{ latitude, longitude, label }`.
- [ ] Failing tests: result shape, short query gives 400, ZERO_RESULTS gives 404 `place_not_found`, quota gives `venue_limit_reached`, rate limit.
- [ ] Implement, run, pass.

### Task 5: Mobile selection and live reading
**Files:** create `mobile/src/services/locationChoice.ts`, `mobile/src/services/liveLocation.ts`; test `mobile/test/locationChoice.test.mjs`.
**Produces:** `chooseLocation({ preferCustom, live, custom })`, `readWebLocation(nav, { prompt, timeoutMs })` returning `{ ok: true, coords } | { ok: false, reason: 'prompt' | 'denied' | 'unavailable' | 'timeout' }`, `getLiveLocation({ prompt })`.
- [ ] Failing tests for the fallback order and for each permission and error state, including a geolocation call that never answers.
- [ ] Implement, run, pass.

### Task 6: Lobby card and Discover
**Files:** create `mobile/src/components/LocationSourceCard.tsx`; modify `mobile/src/screens/PartyLobbyScreen.tsx`, `mobile/src/screens/DiscoverScreen.tsx`, `mobile/src/services/api.ts`; source-scan test in `mobile/test/locationChoice.test.mjs`.
- [ ] Failing test: Discover no longer reads `me.latitude`, the lobby renders `LocationSourceCard`.
- [ ] Build the card with existing tokens and `GradientButton`, run design-system, ux-copy and accessibility-review passes.
- [ ] Run server typecheck, build, lint, tests, mobile tests, `npm run build:web`. Commit, push.
