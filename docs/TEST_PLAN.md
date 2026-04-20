# LinkdUp — Test Plan

20 test cases covering the full app. Run all 20 before the May 7 demo. Mark each PASS/FAIL/SKIP in the rightmost column on demo day.

**Test environment:**
- Backend: Railway (production URL)
- Mobile: Expo Go on iOS and Android (use both — at least one of each for the realtime tests)
- Test accounts: create 4 throwaway emails (you can use Gmail aliases like `you+test1@gmail.com`)

---

## Auth (TC-01 to TC-03)

### TC-01 — Successful signup
**Steps:**
1. Open the app, tap Get Started → Sign Up
2. Enter `you+test1@gmail.com`, password `password123`, display name `Test One`, school NJIT, grad year 2026
3. Tap Create Account

**Expected:** Account is created. Mobile app navigates to MainTabs with HomeScreen visible. `users` row exists in Supabase with the right `display_name` and `school_id`.

### TC-02 — Login with wrong password
**Steps:**
1. Sign out from ProfileScreen
2. Tap Log In
3. Enter the email from TC-01 and password `wrong-password`
4. Tap Log In

**Expected:** An alert dialog appears with "Login failed - Invalid login credentials" or similar. No session is created.

### TC-03 — Session persists across restart
**Steps:**
1. After TC-01, force-close the app on the phone
2. Reopen it

**Expected:** App skips onboarding and login, lands directly on HomeScreen. No re-authentication prompt.

---

## Location (TC-04 to TC-05)

### TC-04 — GPS permission grant
**Steps:**
1. With a logged-in user, navigate into a party lobby and tap Start (if host)
2. The LocationPermission screen appears
3. Tap Allow Location → grant the OS prompt

**Expected:** The user's `latitude` and `longitude` columns in the `users` table are populated with non-null values within 5 seconds.

### TC-05 — GPS denied falls back to manual
**Steps:**
1. As a fresh user (or after revoking location permission in iOS Settings), enter the LocationPermission screen
2. Tap Allow Location → deny the OS prompt
3. The screen should switch to the manual city input
4. Enter "Newark, NJ" and tap Use this city

**Expected:** The Geocoding API is called server-side, the user's lat/lng is populated with Newark coordinates, and the screen dismisses.

---

## Party (TC-06 to TC-10)

### TC-06 — Host creates a party
**Steps:**
1. From HomeScreen, tap + New Party
2. Enter a name (optional), tap Create Party

**Expected:** Server returns a 6-character code. The PartyLobby screen loads with the host listed as the only member. A `parties` row exists with status=`waiting`. The host is auto-added to `party_members`.

### TC-07 — Member joins with valid code
**Steps:**
1. Sign in on a second device as a different user (`you+test2@gmail.com`)
2. From HomeScreen tap Join with code, enter the 6-char code from TC-06
3. Tap Join

**Expected:** Mobile navigates to PartyLobbyScreen. A second `party_members` row exists. The host's lobby shows the new member appearing within 3 seconds.

### TC-08 — Invalid code returns 404
**Steps:**
1. From the JoinParty screen, enter `ZZZZZZ`
2. Tap Join

**Expected:** Alert: "Could not join - party_not_found". No navigation.

### TC-09 — Host taps Start, party transitions to swiping
**Steps:**
1. With at least 2 members in the lobby (both with locations stored), tap Start swiping as the host
2. Wait up to 5 seconds

**Expected:**
- POST `/api/party/:id/start` returns `{ ok: true, midpoint, venue_count }`
- The party row's status flips to `swiping` and `midpoint_lat`/`midpoint_lng` are set
- 10–15 rows appear in the `locations` table for this party
- All members' apps navigate to SwipeScreen automatically

### TC-10 — Non-host tries to start, gets 403
**Steps:**
1. As a non-host member of a `waiting` party, fire a manual POST to `/api/party/:id/start` (use Postman or curl with the user's bearer token)

**Expected:** Server returns `{ error: "not_host" }` with status 403. The party stays in `waiting`.

---

## Vote and match (TC-11 to TC-14)

### TC-11 — Vote is recorded and broadcast
**Steps:**
1. With two devices in a `swiping` party, swipe right on the same venue from device A
2. Watch device B

**Expected:**
- A `votes` row exists with `vote=true` for that user/location
- Device B's HUD avatar for user A shows the green check ring within 2 seconds (Supabase realtime)

### TC-12 — Strict majority triggers match
**Steps:**
1. Create a 3-person party, all swipe right on the same venue (the first card)

**Expected:**
- After the second yes vote, the match engine fires (2/3 > 50%)
- All three devices navigate to MatchScreen
- The party `status` is `matched` and `matched_location_id` is set

### TC-13 — Minority does NOT match
**Steps:**
1. With a 4-person party, only 1 person swipes right on a venue

**Expected:** No match. The other 3 can keep swiping. `status` remains `swiping`.

### TC-14 — Match screen shows distances
**Steps:**
1. After TC-12, observe the MatchScreen on each device

**Expected:** Venue name, photo, address, and rating are visible. The `Get Directions` button opens Google Maps. (Stretch: per-member distances appear under the venue card — this is in the API response under `location.distances`, just needs UI in `MatchScreen.tsx`.)

---

## Dates (TC-15 to TC-17)

### TC-15 — Host generates date slots
**Steps:**
1. After a match, tap Set the Date as the host

**Expected:** POST `/api/party/:id/dates` runs. 56 rows are created in `party_dates` (14 days × 4 slots). Party status flips to `scheduled`. DateTimeSetupScreen loads with the slot grid.

### TC-16 — Members vote availability
**Steps:**
1. On each device, tap a few date slots
2. Tap Lock It In

**Expected:** Each user's selected slots create `date_votes` rows. Tally counts increment per slot.

### TC-17 — Host locks the winning slot
**Steps:**
1. After all members vote, the most-voted slot should highlight with a `yes_count` indicator
2. The host's app calls `/api/party/:id/dates/lock` with the top slot

**Expected:** Party status → `locked`, `locked_date_id` set. Mobile navigates to CalendarConfirmationScreen.

---

## Calendar export (TC-18 to TC-20)

### TC-18 — Google OAuth flow
**Steps:**
1. From CalendarConfirmationScreen, tap Add to Google Calendar
2. The first time, the app should open a browser to the Google consent screen
3. Grant the calendar.events scope

**Expected:** Browser redirects to `/api/calendar/oauth/callback` and shows the "Connected" page. The `users.google_calendar_token` column is populated for the current user.

### TC-19 — Real Google Calendar event created
**Steps:**
1. After TC-18, tap Add to Google Calendar again

**Expected:** A new event appears in the Google Calendar of the user, with summary "LinkdUp: <party name>", correct start/end times, location set to the matched venue, and other party members invited as attendees.

### TC-20 — ICS fallback
**Steps:**
1. As a user not connected to Google, hit GET `/api/calendar/party/:id/ics` directly in a browser tab (with the bearer token via a REST client)

**Expected:** A valid `.ics` file downloads. Opening it in the macOS Calendar or Outlook adds the event.

---

## Test results template (fill on demo day)

| TC | PASS/FAIL | Notes |
|---|---|---|
| TC-01 | | |
| TC-02 | | |
| TC-03 | | |
| TC-04 | | |
| TC-05 | | |
| TC-06 | | |
| TC-07 | | |
| TC-08 | | |
| TC-09 | | |
| TC-10 | | |
| TC-11 | | |
| TC-12 | | |
| TC-13 | | |
| TC-14 | | |
| TC-15 | | |
| TC-16 | | |
| TC-17 | | |
| TC-18 | | |
| TC-19 | | |
| TC-20 | | |

If at least 16 of 20 pass, you have a demo. If fewer, prioritize fixes in this order: TC-09, TC-12, TC-19 — those three are the make-or-break visual demo moments.
