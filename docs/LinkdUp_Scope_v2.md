# LinkdUp — Project Scope Document v2

**Project:** LinkdUp — Social midpoint meetup app for school alumni
**Sponsor:** NJIT Capstone Program (Stakeholder Panel — see `STAKEHOLDERS.md`)
**Project Manager:** Luis Duarte
**Sole Developer (and Tech Lead):** Israel Alcantara
**Team (presenters and contributors):** Joshua Hernandez (Frontend QA), Nekhi Glover (Integration & Testing), Yash Amin (UX & Business Logic)
**Start date:** Feb 17, 2026
**End date:** May 8, 2026
**Final presentation:** May 7, 2026

---

## Objective

Deliver a working MVP mobile app that helps friend groups of school alumni quickly agree on a fair meetup location by computing a geographic midpoint from each member's location, surfacing real venue candidates from Google Places, and letting the group swipe to a single matched spot. After the match, the group picks a date and exports the plan to Google Calendar so the meetup actually happens.

---

## Narrative

LinkdUp solves the "where should we even meet" problem that breaks every alumni group chat. A user creates a Party, friends join with a 6-character code, each person's location is captured with consent, and the app calculates a midpoint and pulls 10 to 15 nearby venues. Everyone in the party swipes Tinder-style on the candidates in real time. When a strict majority of the party swipes yes on the same venue, the app fires a match. From there, the group lands on a date/time picker, agrees on a slot, and the host locks it in — at which point the plan is added to everyone's Google Calendar.

The whole point is to take a problem that normally lives in a sprawling group chat for two weeks and turn it into a five-minute swipe game with a single concrete outcome.

---

## In Scope (MVP)

- Email/password authentication via Supabase Auth
- User profile with school name and graduation year
- GPS location capture with manual city fallback
- Party creation, join-by-code, and lobby with live presence
- Geographic midpoint calculation
- Google Places nearby venue discovery
- Real-time swipe and vote sync (Supabase Realtime)
- Strict-majority vote match engine (greater than 50%)
- Match celebration screen with venue details and per-member distance
- Group date/time availability picker
- Google Calendar event export with OAuth user consent
- ICS file fallback for users without Google
- Bottom-tab app shell (Home, Discover, Party, Calendar, Profile)
- Onboarding carousel (3 slides)
- Deployed backend on Railway, mobile delivered via Expo Go QR code

---

## Out of Scope (Phase 2 — explicitly cut)

These were either in the original Figma brief or the v1 scope document. They are deliberately deferred so the MVP is shippable in the time we have left:

- Google sign-in as a primary auth path
- TikTok-style full-screen vertical video venue cards
- In-app reservations or payments
- Direct messaging or group chat replacement
- ML-driven personalization
- Reporting, moderation, anti-abuse
- Spontaneous Mode
- Multi-stop itinerary planning
- Comments on venues
- Friend graph beyond party membership

---

## Dependencies

- Supabase project (Postgres + Auth + Realtime)
- Google Cloud project with billing enabled
- Google APIs: Places API (New), Geocoding API, Calendar API v3
- Google OAuth 2.0 client (web application type)
- Railway account for backend hosting
- GitHub repository
- Expo / EAS account for mobile delivery
- A real iOS or Android device for the demo

---

## Assumptions

- Users opt in to location sharing; we handle denial with a manual city fallback
- We stay within Google free tiers for the duration of the capstone (estimated < $5/mo)
- Team members will be available for the May 7 presentation regardless of their code contribution
- The demo will run against the Railway-deployed backend, not localhost
- Users will be willing to grant Google Calendar OAuth scope on first export

---

## Constraints

- Single developer, four weeks
- Mobile must run on both iOS and Android via Expo Go
- Backend must be deployed before May 1 to allow a full week of integration testing
- All API keys must be stored in environment variables, never in source

---

## Deliverables (graded items)

| Deliverable | Rubric weight | Owner |
|---|---|---|
| Working MVP mobile app + deployed backend | 30 pts (implementation) | Israel |
| WBS, Gantt, sprint plan | 5 pts | Israel (in `docs/`) |
| Risk identification + mitigation | 5 pts | Israel (Section in spec) |
| Stakeholder document + scope + FDD | 10 pts | Israel (`STAKEHOLDERS.md` + `LinkdUp_Scope_v2.md` + `diagrams/fdd.svg`) |
| Architecture / ERD / system diagram | 5 pts | Israel (`diagrams/`) |
| Testing evidence (test plan + UAT notes) | 5 pts | Israel + Nekhi (`TEST_PLAN.md`) |
| Presentation skills (communication, organization, personal, collaboration, tools) | 35 pts | Whole team (`PRESENTATION_SCRIPT.md`) |
| Team professionalism | 5 pts | Whole team |

Total: 100 pts.

---

## Estimated Budget

$0 to $5/month during development. All services chosen run on free tiers. The only thing that *could* incur cost is the Google Maps Platform — we set a $5 monthly budget alert as a hard guardrail, and we cache Places results per party to minimize calls.

---

## Risks (top 5)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Google Places billing surprises | Low | High | $5 budget alert; cache Places results per party so a 10-person party still costs 1 call |
| Realtime vote sync race conditions | Med | Med | DB is source of truth; clients re-pull on each push |
| Demo phone has no network | Low | High | Backend deployed to Railway; phone uses public URL |
| Single developer falls behind | Med | High | Sprint plan front-loads backend (week 1) so mobile build can be parallelized with Cursor in weeks 2-3 |
| Team no-shows on demo day | Med | Med (loses 15 pts collaboration) | Presentation script gives every member a speaking part; rehearse May 5 |

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| Project Manager | Luis Duarte | _____ |
| Tech Lead / Backend | Israel Alcantara | Apr 8, 2026 |
| Frontend QA | Joshua Hernandez | _____ |
| Integration & Testing | Nekhi Glover | _____ |
| UX & Business Logic | Yash Amin | _____ |
