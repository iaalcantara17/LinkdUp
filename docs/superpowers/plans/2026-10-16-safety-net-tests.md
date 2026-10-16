# Safety Net Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the core flow (sign in, create, join, location, swipe, Link, date, lock, calendar export) with tests before the design refactor, without changing app behavior.

**Architecture:** Server flow tests boot the real `src/index.ts` app with `app.listen` captured onto a random port, Supabase replaced by an in-memory PostgREST/Auth fake behind `fetch`, and Google replaced at `axios.post` (Places) and `googleapis` (Calendar). Mobile logic stays on `node:test`; screen smoke tests use `jest-expo` with React Native Testing Library and mocked `api`, `supabase` and theme/auth contexts.

**Tech Stack:** Node 22 `node:test` + tsx (server), `node:test` with type stripping (mobile logic), jest-expo 54 + @testing-library/react-native (screens), GitHub Actions.

**Spec:** the user request for branch `safety-net-tests` (core flow list, five items, no behavior changes).

## Global Constraints

- No changes under `server/src` or `mobile/src`; tests, helpers, docs and CI only.
- A real bug found by a test becomes a skipped test named after the bug, listed in the report.
- No secrets in CI; tests use the fake env in `server/test/env.ts`.
- One commit per item; push `safety-net-tests`; do not merge.

## Review Focus

- Majority rule only exists in the legacy engine (`current_card_index` null); the locked-step engine needs everyone to vote and everyone to accept the proposal. Test both and say which applies.
- Login legitimately returns the session token; the token guard must allow that one field and nothing else.
- A round where nobody liked anything must load more venues and start round 2, not stall.
- Non-host lock and non-member reads must be 403 with no data in the body.
- Key buttons without an accessibility role cannot be found by name; record those as skipped bugs, not failures.

---

### Task 1: Server core-flow integration tests

**Files:**
- Create: `server/test/fakeSupabase.ts` (stateful tables, filters, order, count, upsert, embed, auth)
- Create: `server/test/flowApp.ts` (boots `src/index.ts`, captures the app, Google mocks)
- Create: `server/test/coreFlow.test.ts`

- [ ] Write the flow tests: auth 401s, create/join/location/start, 403 for non-members and non-hosts, locked-step voting to a proposal and Link, round with no likes opens round 2, rejected proposals, solo path with force match, legacy majority rule (2 members all, 3 and 4 strict majority), date propose/vote/lock, ICS contents, Google export, and a response guard for token and secret fields.
- [ ] Run `npm test` in `server`; any failure is either a fake gap (fix the fake) or a real bug (skip with its name).
- [ ] Commit.

### Task 2: Mobile logic tests

**Files:**
- Create: `mobile/test/coreFlowLogic.test.mjs`

- [ ] Table-driven location source state machine (live, custom, not set) including server `my_location` labels.
- [ ] Dialog manager lifecycle across confirm, error and toast together.
- [ ] Deck ordering by round as a shuffle-invariant property, matching the server ORDER BY.
- [ ] Permission change sequences through `watchWebPermission`.
- [ ] Every 4xx code the core-flow server routes throw maps to friendly text or the caller fallback, never the raw code.
- [ ] Run `npm test` in `mobile`, commit.

### Task 3: Mobile screen smoke tests

**Files:**
- Modify: `mobile/package.json` (devDependencies, `test` script runs node tests then jest)
- Create: `mobile/jest.config.js`, `mobile/jest.setup.js`
- Create: `mobile/screens-test/*.test.tsx`

- [ ] Render Home, Friends, PartyLobby, Swipe, Discover, Profile, CalendarConfirmation with mocked `api`, `supabase`, navigation and contexts; assert loading, empty, error and loaded states and key buttons by accessible name.
- [ ] Record install size and run time for the report.
- [ ] Commit.

### Task 4: Core flow checklist

**Files:**
- Create: `docs/CORE_FLOW_CHECKLIST.md`

- [ ] Manual post-deploy click-through matching the Task 1 and Task 3 tests, then commit.

### Task 5: CI coverage summary

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `server/package.json`, `mobile/package.json` (coverage scripts)

- [ ] Run tests with `--experimental-test-coverage` (server, mobile logic) and jest `--coverage` (screens), write the summary to `$GITHUB_STEP_SUMMARY`, no threshold, no secrets.
- [ ] Run all checks, commit, push.
