# LinkdUp

> Find your people. Find your place.

A mobile app that helps groups of school alumni agree on a place to meet up. Each member shares their location, the app computes a geographic midpoint, pulls nearby venues from Google Places, and the group swipes Tinder-style on the candidates. When a strict majority votes yes on the same spot, the app locks in a match, coordinates a date, and exports the plan to Google Calendar.

Built for the NJIT Capstone Program, Spring 2026.

## Repo layout

```
linkdup/
├── docs/        Specification, scope, setup guide, test plan, sprint plan
├── diagrams/    ERD, system architecture, FDD, WBS, Gantt (SVG)
├── server/      Express + TypeScript backend
└── mobile/      Expo React Native + TypeScript app
```

## Where to start

1. [`docs/LinkdUp_Spec_v2.md`](docs/LinkdUp_Spec_v2.md) — locked feature spec
2. [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) — step-by-step environment setup
3. [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md) — sprint breakdown and task assignments

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo (React Native) + TypeScript, React Navigation |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Realtime | Supabase Realtime (Postgres row replication) |
| Maps | Google Places API (New) + Geocoding API |
| AI | Gemini 2.5 Flash-Lite (venue pitch generation) |
| Calendar | Google Calendar API v3 with OAuth user consent |
| Hosting | Railway (backend), Expo Go / EAS (mobile) |

## Running locally

```bash
# Backend
cd server
cp .env.example .env       # fill in the values per SETUP_GUIDE.md
npm install --legacy-peer-deps
npm run dev                # http://localhost:3000

# Mobile (in another terminal)
cd mobile
cp .env.example .env       # set EXPO_PUBLIC_API_URL to your server address
npm install --legacy-peer-deps
npx expo start --web --clear
```

## Team

| Name | Role |
|---|---|
| Luis Duarte | Project Manager |
| Israel Alcantara | Backend Engineer |
| Joshua Hernandez | Frontend Developer |
| Nekhi Glover | QA & Integration |
| Yash Amin | UX Designer |

## Timeline

| Date | Milestone |
|---|---|
| Feb 17, 2026 | Project kickoff |
| Mar 10, 2026 | Spec locked, database schema finalized |
| Apr 8, 2026 | Build sprint begins |
| Apr 25, 2026 | Backend deployed to Railway |
| May 5, 2026 | Full team demo rehearsal |
| May 7, 2026 | Final capstone presentation |
| May 8, 2026 | Project end |

## License

Coursework. Not for redistribution.
