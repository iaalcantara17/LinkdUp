# Phase B Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Report, a visible Delete collection action, kit back buttons on seven screens, and a trimmed KNOWN_ISSUES.

**Architecture:** New `reports` table (service role only) behind `POST /api/reports`; a `ReportDialog` opened from the profile sheet menu; Saved gets a header menu; `ScreenHeader` gains a close variant and a node title.

**Tech Stack:** Express + zod + Supabase, Expo React Native Web, node:test, jest.

**Spec:** the phase-b-finish request (steps 1 to 5).

## Global Constraints

- No env, Supabase, Google or DNS changes; no migrations run; no new dependencies; no code comments; no attribution lines.
- Keep look and wording familiar. Toast copy exactly: `Thanks, we'll take a look.`
- One commit per step, push `phase-b-finish`, do not merge.

## Review Focus

- Report while signed in as demo: 403 `demo_read_only`, no row written. Test in Task 1.
- Double tap or retry on the same day: one row only, still `{ ok: true }`. Test in Task 1.
- Reporting a uuid that is not a user: 404 `user_not_found`, not 500. Test in Task 1.
- Note longer than 500 characters or unknown fields: 400. Test in Task 1.
- Long press on a collection tab still deletes after the menu is added. Test in Task 2.

---

### Task 1: Report flow

**Files:**
- Create: `server/src/db/migrations/036_reports.sql`, `server/src/routes/reports.ts`, `server/test/reports.test.ts`, `mobile/src/components/ReportDialog.tsx`
- Modify: `server/src/middleware/rateLimit.ts` (optional key fn), `server/src/index.ts` (mount `/api/reports`), `mobile/src/services/api.ts` (`reportUser`), `mobile/src/components/UserProfileSheet.tsx`, `mobile/src/components/kit.tsx` (Chip `role: 'radio'`), `mobile/test/friendsBlock.test.mjs`, `mobile/screens-test/screens.test.js`, `docs/DEPLOYMENT.md`

**Interfaces:**
- `rateLimit(limit: number, windowMs: number, key?: (req) => string | undefined)`
- `export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const`, `REPORT_IP_LIMIT = 30`, `REPORT_USER_LIMIT = 10` (per hour)
- `POST /api/reports { reported_user_id, reason, details? }` → `200 { ok: true }`
- `api.reportUser(userId: string, reason: string, details?: string)`

- [ ] Write `reports.test.ts`: 401 without token; 400 bad reason, 501 char details, extra field; 400 `cannot_report_self`; inserts one row with trimmed details and returns only `{ ok: true }`; second report within a day writes nothing; 23505 on insert is `{ ok: true }`; 23503 is 404; per-user and per-IP 429; demo user 403 through the app.
- [ ] Run `npm test` in server, see failures; implement migration, route, limiter key; run green.
- [ ] Write screen test: menu → Report → dialog; Send disabled until a reason; send calls `api.reportUser('bob', 'spam', 'note')` and toasts the copy; failure shows inline error and keeps the note. Update `friendsBlock.test.mjs`.
- [ ] Implement `ReportDialog` and wire it; run logic + screen tests green.
- [ ] Add "Reading reports" SQL to DEPLOYMENT.md; commit.

### Task 2: Delete collection

**Files:** Modify `mobile/src/screens/SavedScreen.tsx`, `mobile/screens-test/screens.test.js`

- [ ] Screen test: select a collection, `Options for Brunch` opens a menu with `Delete collection`, confirming calls `api.deleteCollection('c1')`; long press on the tab still opens the confirm.
- [ ] Header right `IconButton` (MoreHorizontal) shown when a collection is selected, calling `showMenu(name, [{ label: 'Delete collection', destructive: true }])` into the existing `handleDeleteCollection`. Drop the 12 px trash icon. Commit.

### Task 3: Back buttons

**Files:** Modify `kit.tsx` (`close?: boolean`, `title: ReactNode`, sides `minWidth: 44`), the seven screens, `mobile/test/kit.test.mjs`

- [ ] Logic test: the seven screens plus Saved render `<ScreenHeader` and no `styles.backBtn`; CreatePost passes `close`.
- [ ] Swap each header, keeping titles and borders; Swipe passes the midpoint pill as the title and its buttons as `right`. Commit.

### Task 4: KNOWN_ISSUES

- [ ] Remove the Report and Delete collection items. Commit.

### Task 5: Verify

- [ ] server: `npm run typecheck`, `npm run build`, `npm test`; mobile: `npm run typecheck`, `npm run test:logic`, `npm run test:screens`, `npm run shots`, `npm run build:web`. Commit refreshed screenshots, push.
