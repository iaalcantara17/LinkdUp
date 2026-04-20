# LinkdUp — Sprint Plan (Apr 8 → May 7, 2026)

Four weeks. Sole developer. Realistic, not aspirational.

---

## Week 1 — Foundations (Apr 8 → Apr 14)

**Goal:** Backend running locally, mobile shell loads on a real phone, end-to-end signup works.

### Day 1 (Tue Apr 8) — Setup day. No code.
- [ ] Create GitHub repo `iaalcantara17/linkdup`, push the scaffold
- [ ] Add team members as collaborators
- [ ] Create Supabase project, copy keys to a password manager
- [ ] Run `schema.sql` in Supabase SQL Editor
- [ ] Enable email auth provider, disable email confirmation for dev
- [ ] Toggle Realtime ON for `votes` and `party_members` tables
- [ ] Create Google Cloud project, link billing, set $5 budget alert
- [ ] Enable Places API (New), Geocoding API, Calendar API, Maps SDKs
- [ ] Create Maps API key, restrict to the four APIs
- [ ] Configure OAuth consent screen, add yourself as a test user
- [ ] Create OAuth client (Web), add localhost callback URL
- [ ] Fill in `server/.env` and `mobile/.env` with all the keys

### Day 2 (Wed Apr 9)
- [ ] `cd server && npm install && npm run dev`
- [ ] Hit `/api/health` from a browser, confirm 200
- [ ] Test signup via curl/Postman: `POST /api/auth/signup`
- [ ] Test login, verify JWT roundtrip with `/api/auth/me`
- [ ] Fix any bugs that surface

### Day 3 (Thu Apr 10)
- [ ] `cd mobile && npm install && npx expo start`
- [ ] Scan QR with Expo Go, app loads to splash screen
- [ ] Walk through onboarding → signup screens
- [ ] Create a test account through the actual UI
- [ ] Confirm the user lands on HomeScreen

### Day 4 (Fri Apr 11)
- [ ] Test the party create flow end to end
- [ ] Test joining a party from a second device
- [ ] Test the lobby presence indicator

### Day 5-6 (Sat-Sun Apr 12-13)
- [ ] Buffer days. Catch up on anything that slipped. Don't try to add new features.

### Day 7 (Mon Apr 14) — Sprint review
- [ ] Update the GitHub Project Kanban
- [ ] Post a one-line update to the team Discord/group chat
- [ ] **Milestone:** "Backend live, signup works, lobby works"

---

## Week 2 — Core feature: swipe and match (Apr 15 → Apr 21)

**Goal:** The headline demo flow works. You can sign in on two phones, create a party, start swiping, and trigger a match.

### Mon Apr 15
- [ ] Test the `POST /api/party/:id/start` endpoint via Postman with a real party
- [ ] Verify Google Places returns real venues for your actual location
- [ ] Verify the rows land in the `locations` table
- [ ] If the API returns ZERO_RESULTS, troubleshoot: API key restrictions? Billing?

### Tue Apr 16
- [ ] Open the SwipeScreen on a phone with a real party
- [ ] Verify cards render with photos
- [ ] Verify the vote API roundtrips
- [ ] Test the strict-majority math by hand-voting on Postman

### Wed Apr 17 — Cursor day
- [ ] Run **Prompt 5** (gesture-based swipe animations) from `CURSOR_PROMPTS.md`
- [ ] Eyeball the swipe animation, tweak feel
- [ ] Run **Prompt 6** (Supabase realtime for crew HUD)
- [ ] Test on two phones — confirm avatar status updates live

### Thu Apr 18
- [ ] Trigger a real match with two phones
- [ ] Verify both phones land on MatchScreen automatically
- [ ] Verify the match screen pulls the correct venue

### Fri Apr 19
- [ ] Polish: confetti, gradient glow on MatchScreen
- [ ] Buffer for bug fixing

### Sat-Sun Apr 20-21
- [ ] Buffer days. Catch up.
- [ ] **Milestone:** "Core swipe + match flow works on two phones"

---

## Week 3 — Dates, calendar, deploy (Apr 22 → Apr 28)

**Goal:** The full flow including calendar export works, and the backend is on Railway.

### Mon Apr 22
- [ ] Test `POST /api/party/:id/dates` — verify 56 slots are generated
- [ ] Test the date voting flow on the mobile app
- [ ] Test `POST /api/party/:id/dates/lock`

### Tue Apr 23
- [ ] Walk through the OAuth flow end to end
- [ ] Hit `/api/calendar/oauth/start`, follow the URL, grant consent
- [ ] Verify the callback page loads
- [ ] Check that `users.google_calendar_token` is populated

### Wed Apr 24
- [ ] Test `POST /api/calendar/party/:id/export`
- [ ] **Open your real Google Calendar and verify the event landed**
- [ ] Test the ICS fallback

### Thu Apr 25 — Deploy day
- [ ] Run **Prompt 9** from `CURSOR_PROMPTS.md`
- [ ] Push to Railway
- [ ] Update `mobile/.env` with the Railway URL
- [ ] Update Google OAuth redirect URIs
- [ ] Smoke test the full flow against the deployed backend

### Fri Apr 26
- [ ] Run **Prompt 7** (Space Grotesk + Inter fonts)
- [ ] Run **Prompt 8** (typecheck both packages)

### Sat-Sun Apr 27-28
- [ ] Buffer
- [ ] **Milestone:** "Backend deployed, full flow works on cellular data, types clean"

---

## Week 4 — UAT, polish, and rehearsal (Apr 29 → May 7)

**Goal:** Fix bugs, get user feedback, rehearse the demo, ship.

### Mon Apr 29
- [ ] Run all 20 test cases from `TEST_PLAN.md` against the deployed backend
- [ ] Document which pass and which fail in the test plan results table

### Tue Apr 30
- [ ] Fix the highest-impact failures first: TC-09, TC-12, TC-19 are mandatory
- [ ] Fix any visual glitches that look bad in screenshots

### Wed May 1 — User testing day
- [ ] Get 2 NJIT classmates to install Expo Go and try the app
- [ ] Watch them use it without help
- [ ] Take notes on confusion points
- [ ] Fix the top 3 confusion points

### Thu May 2
- [ ] Run **Prompt 10** (final demo polish) from `CURSOR_PROMPTS.md`
- [ ] Add the active-parties endpoint and wire HomeScreen to it

### Fri May 3
- [ ] Buffer for last-minute bug fixing

### Sat May 4
- [ ] **First full team rehearsal of the presentation script**
- [ ] Time it. Cut anything that pushes past 10 minutes.
- [ ] Identify who needs to practice their section

### Sun May 5
- [ ] **Second team rehearsal**
- [ ] Run the live demo at least 3 times in a row, on the actual phones, on the venue WiFi if you can scout it
- [ ] Record the 90-second backup demo video

### Mon May 6
- [ ] Final smoke test of the deployed app
- [ ] Print the test plan results, the rubric, and a copy of the script for each presenter
- [ ] Charge phones, pack chargers, pack a hotspot if you own one

### Tue May 7 — Demo day
- [ ] Arrive 30 minutes early
- [ ] Run the pre-flight checklist from `PRESENTATION_SCRIPT.md`
- [ ] **Present**
- [ ] **Milestone:** "Capstone done"

---

## Time math

| Phase | Hours estimated | Notes |
|---|---|---|
| Week 1 (setup + verify) | 12-15 | Most of this is config, not code |
| Week 2 (swipe + match) | 18-22 | Real coding. Hardest week. |
| Week 3 (dates + deploy) | 15-18 | Calendar OAuth eats half a day |
| Week 4 (test + rehearse) | 10-12 | Mostly testing, fixing, presenting |
| **Total** | **55-67 hours** | Roughly 14-17 hours per week |

This is doable on top of your other classes if you protect your evenings. If you fall behind by more than 2 days, cut from the *bottom* of the in-scope list — Calendar export first, then date picker, then realtime sync. Keep auth + party + swipe + match no matter what. Those are the demo.

---

## Rules for surviving 4 weeks solo

1. **Commit to GitHub every day.** Even if it's broken. Your commit graph is part of the implementation grade and the team contribution story.
2. **Don't refactor.** If something works, leave it alone until the demo is recorded.
3. **One feature per day, max.** Don't try to ship two big things in one sitting; you'll break both.
4. **Eat. Sleep. Lift.** Your 10K is on Apr 12 — that's a hard rest day for code, no exceptions.
5. **If you're stuck for more than 30 minutes on the same bug**, ask Cursor or come back here. Don't grind.
6. **Write the test plan results in real time.** Don't wait until demo day to see what works.
