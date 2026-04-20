# LinkdUp — Stakeholder Document

This document defines the LinkdUp stakeholder panel, problem statement, users, constraints, success criteria, and communication plan. Submitted to satisfy the NJIT Capstone non-industry-track stakeholder requirement.

---

## Stakeholder Panel

| Stakeholder Type | Name | Role / Organization | Contact |
|---|---|---|---|
| Buyer / Approver | Capstone Instructor | NJIT CS Capstone faculty | NJIT email |
| End User 1 | NJIT Senior Volunteer (TBD) | Student / Alumni Group Organizer | TBD |
| End User 2 | NJIT Senior Volunteer (TBD) | Student / Social Planner | TBD |
| Admin / Operator | Israel Alcantara | LinkdUp Backend Lead + Tech Lead | iaa-redacted@njit.edu |
| Constraints Owner | Israel Alcantara | Data + platform + security responsibility (sole developer) | iaa-redacted@njit.edu |

If end-user volunteers are unavailable before demo day, use NJIT classmates as approved proxies and document who tested what in the test plan.

**Team contributors** (not stakeholders, but listed for the rubric collaboration grade):

| Role | Name |
|---|---|
| Project Manager | Luis Duarte |
| Tech Lead / Backend / Sole Developer | Israel Alcantara |
| Frontend QA | Joshua Hernandez |
| Integration & Testing | Nekhi Glover |
| UX & Business Logic | Yash Amin |

---

## Problem Statement (Stakeholder Wording)

Many friend groups, especially NJIT alumni who scatter across different cities and states after graduation, struggle to plan in-person meetups. Group chats turn into multi-day debates over where to go, who can travel how far, and what date works for everyone. Most of the time, the plan dies in the chat and nobody meets up.

LinkdUp solves this by treating the meetup decision as a structured, time-boxed activity instead of an open-ended chat. Each member's location is captured with consent, the app calculates a fair geographic midpoint, and Google Places returns real venue candidates around that point. The group swipes Tinder-style on the candidates in real time. As soon as a strict majority swipes yes on the same place, that venue wins. The group then picks an available time slot from a shared grid, locks it in, and the plan is exported to everyone's Google Calendar so it actually happens.

---

## Users + Top Use Cases

### Primary users
- College students and recent alumni (NJIT first, then expand)
- Friend groups of 3–8 people spread across multiple cities
- Anyone who has lost a meetup plan to group-chat paralysis

### Top use cases
1. **Reunite scattered alumni for a weekend.** Five college friends, now in five different cities, want to pick a place to meet for a weekend. They each share their location. LinkdUp finds the geographic midpoint and surfaces venues there, the group swipes to consensus, and the plan lands in everyone's calendar.
2. **Pick a Friday night spot for a local crew.** Three friends in the same city open the app, create a party, and use it as a faster-than-chat way to pick a bar everyone agrees on without the usual indecision.
3. **Plan a birthday meetup without DMing 12 people.** The host creates the party, sends one 6-character code, everyone joins, and the swiping resolves the venue without the host having to negotiate one-on-one.

---

## Constraints (Platform / Data / Security / Integrations)

### Platform
- Mobile-first via Expo (single codebase for iOS and Android)
- Backend on Railway, accessible from any network for the demo

### Data
- User location is captured only with explicit consent
- Manual city fallback for users who deny GPS permission
- Location data is not persisted longer than necessary; only the most recent reading is stored
- All venue candidate data is fetched fresh from Google Places and cached only for the duration of an active party

### Security
- Authentication is handled by Supabase Auth using JWTs
- Passwords are bcrypt-hashed by Supabase, never stored in our application database
- Row-level security policies are enabled on every Supabase table as a defense-in-depth layer
- API keys live in environment variables and are never committed to source control
- Google OAuth tokens for Calendar are stored encrypted at rest

### Integrations
- Google Places API (New) for venue search
- Google Geocoding API for the manual city fallback
- Google Calendar API v3 for event export, with user OAuth consent
- Supabase Realtime for live vote synchronization

---

## Success Criteria (How "Done" is Judged)

| Criterion | Specific Measure |
|---|---|
| Users can sign up, log in, and persist a session | TC-01, TC-02, TC-03 in the test plan all pass |
| Location is captured with consent and a fallback | TC-04, TC-05 pass |
| Parties can be created, joined, and started | TC-06, TC-07, TC-08, TC-09 pass |
| Real venues are returned from Google Places | TC-09 returns 10–15 real venues with names, addresses, photos |
| Real-time vote sync works across devices | TC-11 confirms a swipe on device A updates device B within 2 seconds |
| Strict majority match fires correctly | TC-12, TC-13 pass |
| Group date picker works | TC-15, TC-16, TC-17 pass |
| Calendar export creates a real Google Calendar event | TC-19 verified by opening Google Calendar and seeing the event |
| App is deployed and demo-runnable from any network | Backend reachable via Railway URL on cellular data |
| Stakeholder feedback | At least 2 end-user testers report the app feels faster than their normal group chat planning |

A passing demo requires at least 16 of 20 test cases to pass, with TC-09, TC-12, and TC-19 mandatory.

---

## Weekly Communication Plan

| Channel | Cadence | Purpose |
|---|---|---|
| In-person meeting | Weekly, Wednesdays 7 PM | Sprint review, blockers, next-week planning |
| Discord (or group text) | Daily | Quick async updates, blockers, demo coordination |
| GitHub Projects (Kanban) | Continuous | Issue tracking, who is doing what |
| GitHub PRs | Per change | Code review, even though Israel is sole developer — others approve so collaboration is documented |
| Demo rehearsal | May 5 | Run the full presentation script end-to-end with all team members present |

Each team member posts a one-line weekly update on Wednesdays:
- What I did this week
- What I'm doing next week
- What is blocking me

---

## Stakeholder Sign-off

| Role | Name | Date |
|---|---|---|
| Project Manager | Luis Duarte | _____ |
| Tech Lead / Sole Developer | Israel Alcantara | Apr 8, 2026 |
| Frontend QA | Joshua Hernandez | _____ |
| Integration & Testing | Nekhi Glover | _____ |
| UX & Business Logic | Yash Amin | _____ |
