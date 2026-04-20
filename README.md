# LinkdUp

> Find your people. Find your place.

A mobile app that helps groups of friends — specifically school alumni who live in different cities — agree on a place to meet up. Each member shares their location, the app computes a geographic midpoint, pulls nearby venues from Google Places, and the group swipes Tinder-style on the candidates. When a strict majority swipes yes on the same venue, the app locks in a match, lets the group pick a date, and exports the plan to Google Calendar.

Built for the NJIT Capstone Program, Spring 2026.

## Repo layout

```
linkdup/
├── docs/        Specification, scope, setup guide, test plan, sprint plan, presentation script
├── diagrams/    ERD, system architecture, FDD, WBS, Gantt (SVG)
├── server/      Express + TypeScript backend
└── mobile/      Expo React Native + TypeScript app
```

## Where to start

1. Read [`docs/LinkdUp_Spec_v2.md`](docs/LinkdUp_Spec_v2.md) — the locked spec
2. Read [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) — step-by-step environment setup
3. Read [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md) — what to do day by day
4. When you sit down at Cursor Pro, follow [`docs/CURSOR_PROMPTS.md`](docs/CURSOR_PROMPTS.md) in order

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo (React Native) + TypeScript, React Navigation |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email + password) |
| Realtime | Supabase Realtime (Postgres row replication) |
| Maps | Google Places API (New) + Geocoding API |
| Calendar | Google Calendar API v3 with OAuth user consent |
| Hosting | Railway (backend), Expo Go / EAS (mobile) |

## Running locally

```bash
# Backend
cd server
cp .env.example .env       # fill in the values per SETUP_GUIDE.md
npm install
npm run dev                # http://localhost:3000

# Mobile (in another terminal)
cd mobile
cp .env.example .env       # fill in EXPO_PUBLIC_API_URL with your laptop LAN IP
npm install
npx expo start             # scan the QR with Expo Go
```

## Team

| Role | Name |
|---|---|
| Project Manager | Luis Duarte |
| Tech Lead / Backend / Sole Developer | Israel Alcantara |
| Frontend QA | Joshua Hernandez |
| Integration & Testing | Nekhi Glover |
| UX & Business Logic | Yash Amin |

## Timeline

| Date | Event |
|---|---|
| Feb 17, 2026 | Project start |
| Apr 8, 2026 | Build window opens (Israel solo) |
| Apr 25, 2026 | Backend deployed to Railway |
| May 5, 2026 | Full team demo rehearsal |
| May 7, 2026 | Final capstone presentation |
| May 8, 2026 | Project end |

## License

Coursework. Not for redistribution.
