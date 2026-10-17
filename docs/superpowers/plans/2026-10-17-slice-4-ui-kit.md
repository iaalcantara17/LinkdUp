# Slice 4 UI Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three visible light/dark bugs found by real browser screenshots, then normalise the party flow, Friends, Discover and Profile screens onto a small shared kit with fast, reduced-motion-aware motion.

**Architecture:** A Playwright script serves the static web export with the API and Supabase stubbed by request routing and captures each screen in both themes at 390px and 1440px. Shared components live in `mobile/src/components/kit/` and are built on the existing tokens in `mobile/src/theme/tokens.ts`; screens adopt them without changing copy, colours or layout.

**Tech Stack:** Expo 54 / React Native Web, React Navigation 6, Playwright (dev only), node:test, jest-expo.

**Spec:** the slice 4 request (Part 0 bugs a to c, Part 1 items 1 to 3).

## Global Constraints

- No env var, Supabase, Google, DNS or migration changes. No secrets in the repo or screenshots.
- No code comments, no attribution lines, no subagents.
- Same colours, same wording, same layout. Only sizes, spacing, radii and states change; every visible change is reported.
- Motion durations come from `motion` tokens and stay within 100 to 300 ms; prefers-reduced-motion disables non-essential animation; no animation blocks input.

## Review Focus

- Light mode on every button variant: text must reach 4.5:1 on its rendered fill, including disabled and loading.
- Reduced motion set: skeletons, list fades and the Link spring render their final state immediately.
- Screens whose existing jest tests query by text or role keep passing after kit adoption.
- Walkthrough opened from signup in light mode stays light on every slide.
- Match screen buttons stay clickable with confetti running.

---

### Task 1: Screenshot harness (`npm run shots`)

**Files:** Create `mobile/shots/shots.mjs`, `mobile/shots/stub.mjs`; Modify `mobile/package.json`, `.gitignore`.

- [ ] `npm run shots` exports web to `dist-shots` with stub `EXPO_PUBLIC_*` values set on the process only, serves it, routes `http://api.test/**` and the stub Supabase host to fixtures, seeds a fake session and theme in localStorage, opens each screen by path (`/PartyLobby?partyId=p1`) and writes `docs/screens/slice-4/<Screen>-<theme>-<width>.png`.
- [ ] Run it, read the shots, record what is wrong.

### Task 2: Button contrast (bug a)

**Files:** Modify `mobile/src/components/GradientButton.tsx`; Test `mobile/screens-test/buttonContrast.test.js`.

- [ ] Failing test: render every variant (gradient, ghost, white, disabled, loading) under light and dark themes, read the rendered text colour and the composited fill, assert 4.5:1.
- [ ] Fix the root cause in the shared button, re-run test and shots.

### Task 3: Walkthrough theme (bug b) and Match layering (bug c)

**Files:** Modify `mobile/src/screens/WalkthroughScreen.tsx`, walkthrough components, `mobile/src/screens/MatchScreen.tsx`.

- [ ] Find the dark-only source in light mode, swap to theme roles. Decorations render before content with `pointerEvents="none"`. Verify in shots.

### Task 4: Kit and adoption

**Files:** Create `mobile/src/components/kit/*`; Modify listed screens; Test `mobile/test/kit.test.mjs`, `mobile/screens-test/screens.test.js`.

- [ ] Audit list (under 12 lines) in the PR.
- [ ] Tests first for kit logic: button size table on the 4pt grid and 44pt minimum, `motionDuration(reduced)`; guard that kit files use only tokens.
- [ ] Build Button sizes, Card, ScreenHeader, EmptyState, TextField, Chip, ListRow, Skeleton, Pressable feedback; adopt; add roles/labels; unskip the `BUG:` tests.

### Task 5: Motion

- [ ] Press scale/opacity, short stack transitions, list fade-in, Link spring, web smooth scroll, skeletons on Home, Friends, Discover, all reduced-motion aware.
- [ ] Full test suite, typecheck, final shots, report visible changes.
