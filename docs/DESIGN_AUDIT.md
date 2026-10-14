# LinkdUp Design Audit

Date: 2026-10-14. Branch: `design-audit`, cut from `main` at `8b57a2c`.
Scope: `mobile/` (Expo SDK 54, React Native Web) plus the server routes where they shape the UX.
This is a read-only audit. No app code was changed.

Ranks: **High** means a recruiter will hit it, or it is broken or unsafe. **Medium** means visible inconsistency or debt that slows every later change. **Low** means polish.

Every finding cites `file:line`. Counts come from greps over `mobile/src` (the method is given next to each count). Contrast ratios were computed with the WCAG 2.x relative-luminance formula, with alpha colours blended over the stated background.

---

## 0. Summary

### Top 10 findings

| # | Rank | Finding | Evidence |
|---|------|---------|----------|
| 1 | High | On web, `Alert.alert` is a no-op, so 79 alerts never show. That includes confirm dialogs that gate actions (remove friend, block, unblock, delete comment, delete collection, overflow menus), every error message, and the "Added to Google Calendar" success message. | `mobile/node_modules/react-native-web/dist/exports/Alert/index.js:10-12`; `mobile/src/screens/FriendsScreen.tsx:111`; `mobile/src/components/UserProfileSheet.tsx:108,146` |
| 2 | High (security) | `PATCH /api/user/me` returns the full `users` row, including the stored Google Calendar refresh token, to the browser. | `server/src/routes/user.ts:97-107` |
| 3 | High | Light theme is broken on 16 files that style with the static dark `colors` object. These include Discover, Login, Onboarding, Walkthrough and all three navigators. Separately, 162 hard-coded `'white'` text colours appear across the app. | `mobile/src/theme/colors.ts:71`; `mobile/src/screens/DiscoverScreen.tsx:30,970,1003` |
| 4 | High | Contrast fails in both themes. `text40`/`textMuted` (104 uses) measures 3.77:1 on dark and 2.69:1 on light. White text on the cyan end of the button gradient measures 2.07:1. | `mobile/src/theme/colors.ts:4,19,22,53,56` |
| 5 | High | The 4.4 MB web bundle includes the entire lucide icon set (about 1,692 icon modules, about 1.16 MB) even though the app uses 44 icons. | `mobile/package.json:34` |
| 6 | High | Mobile `tsc` stack overflow. Root cause: Expo's base tsconfig sets `allowJs`, the mobile tsconfig has no `include`, so tsc parses the minified `dist/` bundle. With `dist` excluded, tsc passes with 0 errors. | `mobile/tsconfig.json:1-9`; `mobile/node_modules/expo/tsconfig.base.json:6,20` |
| 7 | High | Screen readers get almost nothing: 212 touchables but 12 `accessibilityLabel`s. Icon-only back, like and nope buttons are unlabeled. | `mobile/src/screens/SwipeScreen.tsx:731,929,938` |
| 8 | High | A recruiter's first visit has no social preview, no Open Graph tags, no demo and a sign-up wall. `web/robots.txt` never ships. | `mobile/app.json:26-39`; `mobile/web/robots.txt` |
| 9 | Medium | When location is denied, Discover is a dead end with only "Try again". The server already accepts any lat/lng, and a place search already exists. | `mobile/src/screens/DiscoverScreen.tsx:684-697`; `server/src/routes/discover.ts:18-24`; `mobile/src/services/api.ts:85` |
| 10 | Medium | The design tokens exist but go unused: `spacing` has 0 uses against 952 numeric spacing literals; `typography` has 29 uses against 413 literal `fontSize`s across 25 distinct sizes. | `mobile/src/theme/spacing.ts:1-8`; `mobile/src/theme/typography.ts:3-16` |

### Decisions needed from you

1. **Desktop layout.** I recommend a centred phone-width column with a brand rail beside it (5.2), not a device bezel or a full responsive rebuild.
2. **Demo access.** Options: a read-only demo account behind a "Try the demo" button (recommended), or an unauthenticated scripted demo (7.3).
3. **Product identity.** Is LinkdUp an alumni app or a crew hangout app? The copy says both (8.1). The answer drives onboarding and empty-state wording.
4. **Theme stance.** Either fix light mode everywhere (Slice 3), or ship dark-only and remove the light toggle until it is fixed. Dark-only is the cheaper option.
5. **Match moment name.** Pick one: "It's a Link!" or "Matched!" (8.1).

---

## 1. Target design direction (brainstorm)

This is an audit, so the output is options plus a recommendation. You approve a direction; nothing is built here.

**What you asked for:** polish and consistency that feel "built in, not bolted on", for recruiters opening the web build. Stack and themes stay as they are.
**Assumption:** recruiters spend about 60 to 120 seconds, on desktop, mostly without signing up.

### Options

| | A. Refined glass (recommended) | B. Warm social | C. Map-first utility |
|---|---|---|---|
| Idea | Keep the violet identity, dark-first. Calm the type and colour so the one gradient moment (the Link/match) carries the brand. | Light-first, warm neutrals, photo-led, in the style of Partiful. | Map as home, venues as pins, in the style of Citymapper. |
| Churn | Low: re-tune the existing tokens in `theme/` | High: new palette, new imagery | Very high: new IA |
| HIG fit | Deference: chrome recedes and venue photos lead | Good | Clarity is good; depth is hard on web |
| Risk | Defaults to "dark + one bright accent" (a generic AI look) unless restraint is enforced | Big redesign before shipping polish | Rebuilds working flows |

**Recommendation: A.** Concretely:
- **One bold place.** The gradient appears only on the primary CTA per screen and on the Match screen (`mobile/src/screens/MatchScreen.tsx:253`). Everywhere else uses solid `accent`.
- **Quieter type.** Drop `Inter_900Black` (30 uses) to the wordmark and the Match title only. Screen titles move to 700 weight on a single scale (2.2). Today titles span 10 sizes, from 16 px (`mobile/src/screens/ProposalScreen.tsx:394`) to 42 px (`mobile/src/screens/MatchScreen.tsx:349`).
- **Real icons, not emoji.** Replace the 27 emoji-as-icons (6.4) with lucide icons at one stroke and size scale.
- **Motion with meaning.** Keep the card swipe and the match confetti. Cut decorative entry fades (39 `entering=` uses) to one per screen. Respect reduced motion (4.6).

---

## 2. Design system

### 2.1 Inventory (measured)

| Category | Tokens defined | Token uses | Hard-coded uses | Method |
|---|---|---|---|---|
| Colour | 24 roles × 2 themes (`mobile/src/theme/colors.ts:1-67`) | 448 `colors.*`/`c.*` refs | 72 hex literals, 144 `rgba()` literals, 162 `'white'` text colours | grep `'#[0-9A-F]{3,8}'`, `rgba\(`, `color: 'white'` outside `theme/` |
| Font size | 12 styles (`mobile/src/theme/typography.ts:3-16`) | 29 `typography.*` refs | 413 literal `fontSize`s, **25 distinct sizes** (8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 36, 40, 42, 44, 48, 52) | grep `fontSize: ?[0-9]+` |
| Font family | 5 Inter weights loaded (`mobile/App.tsx:57-63`) | none | 400 literal `fontFamily` strings | grep `fontFamily: '...'` |
| Spacing | 6 steps (`mobile/src/theme/spacing.ts:1-8`) | **0** `spacing.*` refs | 952 numeric padding/margin/gap literals; 296 are off the 4 pt grid (most common: 10 ×82, 6 ×64, 14 ×61) | grep padding/margin/gap literals |
| Radius | 5 steps (`mobile/src/theme/spacing.ts:10-16`) | 132 `radii.*` refs | 138 literal `borderRadius`s (20 ×34, 16 ×12, 12 ×12, 10 ×10, 18 ×8 …) | grep `borderRadius: ?[0-9]+` |
| Elevation | none | none | 9 files with ad hoc `shadow*`; radii 2 to 24, opacities 0.2 to 0.5, `elevation` 2 to 16 | grep `shadowColor` |
| Motion | none | none | 16 distinct durations (400 ×18, 500 ×14, 300, 250, 350, 600, 1000, 1500 …) | grep `duration` |
| Icons | lucide only (good: 0 other icon libs) | | 24 sizes (9 to 280); stroke widths 2, 2.5 and 3 mixed; 27 emoji used as icons | grep `size={n}`, `strokeWidth` |

Findings:

- **High: the static dark palette is used as a theme.** `export const colors = darkColors` (`mobile/src/theme/colors.ts:71`) is imported by 16 files that never call `useTheme`. Among them: `mobile/src/screens/DiscoverScreen.tsx:30`, `mobile/src/screens/LoginScreen.tsx:17`, `mobile/src/screens/OnboardingScreen.tsx:17`, `mobile/src/screens/WalkthroughScreen.tsx:15`, `mobile/src/navigation/MainStack.tsx:28`, `mobile/src/navigation/AuthStack.tsx:6`, `mobile/src/navigation/RootNavigator.tsx:6`. Discover renders a dark root in light mode (`mobile/src/screens/DiscoverScreen.tsx:970`) and a hard-coded white title (`mobile/src/screens/DiscoverScreen.tsx:1003`), which is 1.04:1 on the light background if the root ever becomes light. **Smallest fix:** delete the `colors` export and let tsc list every caller. Convert each to the `makeStyles(colors)` + `useMemo` pattern that 30 files already use (e.g. `mobile/src/components/BookmarkSheet.tsx:30,187`).
- **Medium: `spacing` tokens are dead.** There are 0 references (`mobile/src/theme/spacing.ts:1-8`). Smallest fix: adopt them inside the shared components (Slice 4), not by bulk-editing screens.
- **Medium: duplicate token names.** `text60` = `textSecondary` and `text40` = `textMuted` (`mobile/src/theme/colors.ts:18,21,19,22`); `glassBorder` = `border` (`mobile/src/theme/colors.ts:13,32`). Smallest fix: keep the role names and alias the numeric ones until they are migrated.
- **Low: the theme is not persisted on native.** `readStored` only reads `localStorage` (`mobile/src/context/ThemeContext.tsx:24-29`), and `app.json` forces `"userInterfaceStyle": "dark"` (`mobile/app.json:8`), so `system` mode cannot follow the OS on native. Fix: set `"automatic"` once light mode is fixed.

### 2.2 Proposed token set (works in dark and light)

Every text pair below was computed to ≥ 4.5:1; borders and focus rings target ≥ 3:1.

**Colour roles**

| Role | Dark | Light | Notes |
|---|---|---|---|
| `bg` | `#0A0A0F` | `#FAFAFB` | unchanged |
| `surface` | `#15151F` | `#FFFFFF` | unchanged |
| `surfaceRaised` | `#1F1F2E` | `#F0F0F6` | was `surfaceElevated` |
| `text` | `#FFFFFF` | `#0A0A0F` | |
| `textSecondary` | white 70% (≈ 9:1) | ink 70% | |
| `textTertiary` | white 50% (5.36:1 on bg) | ink 60% (5.17:1 on bg) | replaces `text40`/`text30` for any readable text |
| `textDisabled` | white 30% | ink 30% | disabled text only (exempt from 1.4.3) |
| `accent` | `#6C3EF4` (fills) | `#6C3EF4` | white on accent 5.78:1 |
| `accentText` | `#9B7BFF` (6.27:1 on bg) | `#6C3EF4` (5.54:1) | accent-coloured text/icons on dark; today it is 3.42:1 |
| `gradient` | `#6C3EF4 → #2563EB` | same | white on `#2563EB` 5.17:1 (today's `#00C2FF` is 2.07:1) |
| `danger` | `#EF4444` | `#DC2626` | white on `#DC2626` 4.83:1; light text 4.63:1 |
| `success` | `#22C55E` | `#047857` | light 5.48:1 (today's `#10B981` is 2.54:1) |
| `warning` | `#FACC15` | `#B45309` | light 5.02:1 (today's `#F59E0B` is 2.15:1) |
| `border` | white 10% | ink 8% | decorative dividers only |
| `borderStrong` | white ≥ 32% | ink ≥ 35% | inputs, toggles, focus ring base: verify ≥ 3:1 in Slice 2 |
| `focus` | `#9B7BFF` 2 px | `#6C3EF4` 2 px | web focus ring |

**Type scale (Inter, 4 weights; drop 900 except wordmark and Match)**

| Token | Size / line | Weight | Replaces (current literals) |
|---|---|---|---|
| `largeTitle` | 32 / 38 | 700 | 30, 32, 36, 42 page titles |
| `title` | 22 / 28 | 700 | 20, 22, 24, 26, 28 |
| `headline` | 17 / 22 | 600 | 16, 17, 18 header titles |
| `body` | 16 / 24 | 400 | 15, 16 |
| `callout` | 15 / 20 | 500 | button text in compact rows |
| `subhead` | 14 / 20 | 400 | 14 |
| `footnote` | 13 / 18 | 500 | 13 |
| `caption` | 12 / 16 | 500 | 11, 12 (minimum readable size) |
| `display` | 48 / 52 | 900 | wordmark, party code, match title |

This removes sizes 8, 9, 10 and 19 (19 uses below 11 px; also the rarely used 19 px size).

**Spacing (4 pt base):** `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Map 6→8, 10→12, 14→16, 18→20 during component adoption.
**Radii:** `sm 8` (chips, inputs), `md 12` (buttons), `lg 20` (cards, sheets), `pill 999`. `20` is already the most common literal (34 uses).
**Elevation:** `0` flat, `1` card (y2 r8 α0.15), `2` floating button/nav (y8 r16 α0.25), `3` sheet/modal (y16 r32 α0.35). On web emit `boxShadow`; on dark rely on `surfaceRaised` more than shadow.
**Motion:** `instant 100`, `fast 200` (press, toggle), `base 300` (sheet, screen), `slow 500` (match celebration only); easing `standard` = ease-out cubic; all gated by reduced motion (4.6).

---

## 3. Components

### 3.1 What exists and who uses it

| Component | File | Used in (files) | Notes |
|---|---|---|---|
| `GradientButton` (gradient/ghost/white) | `mobile/src/components/GradientButton.tsx:19` | 15 | Best-built component (has role and state, `mobile/src/components/GradientButton.tsx:60-61`), but 18 px bold text (`:128`) and a heavy shadow (`:106-110`) |
| `GlassCard` | `mobile/src/components/GlassCard.tsx:14` | 4 | Most screens re-implement cards locally (11 local `card:` styles) |
| `AvatarBubble` | `mobile/src/components/AvatarBubble.tsx` | 10 | Good reuse |
| `AppSwitch` | `mobile/src/components/AppSwitch.tsx` | 2 | |
| `IconBadge` | `mobile/src/components/IconBadge.tsx` | 2 | |
| `BottomNav` | `mobile/src/components/BottomNav.tsx:8` | 6 (rendered inside each screen) | See 3.3 |
| `HelpButton` / `FirstVisitHint` / `AnchoredHint` | `mobile/src/components/` | 7 / 2 / 5 | Three hint systems |
| `LinkdUpLogo` | `mobile/src/components/LinkdUpLogo.tsx:7` | **0** | Dead code |

### 3.2 Duplicated UI (local style keys re-declared across files)

| Pattern | Files re-implementing | Example |
|---|---|---|
| Screen header (`header`/`headerTitle`) | 18 / 10 | Title sizes 16 (`mobile/src/screens/ProposalScreen.tsx:394`), 17 (`mobile/src/screens/BlockedUsersScreen.tsx:142`), 18 (`mobile/src/screens/SavedScreen.tsx:246`), 20 (`mobile/src/screens/CreatePartyScreen.tsx:245`), 22 (`mobile/src/screens/FriendsScreen.tsx:309`) |
| Back button (`backBtn`) | 8 | 38 px (`BlockedUsersScreen`, `FollowListScreen`) vs 40 px elsewhere; icons `ArrowLeft` (12 screens) vs `ChevronLeft` (3) vs `X` |
| Empty state (`emptyCard`/`emptyTitle`/`emptyText`/`emptyState`) | 3 / 8 / 5 / 2 | Emoji icon at 44 px (`mobile/src/screens/DiscoverScreen.tsx:1069`) vs lucide elsewhere |
| Loading (`ActivityIndicator` + text) | 19 files, 52 spinners | No skeletons; `"Loading..."` text repeated six times in Profile (`mobile/src/screens/ProfileScreen.tsx:388-432`) |
| Bottom sheet / modal (`sheet`/`backdrop`/`overlay`) | 6 / 4 / 4; `<Modal>` in 16 files | Each with its own drag bar, padding and radius |
| Text input | 11 files with `TextInput`, 3 local `input:` styles | Placeholder-as-label in Join (`mobile/src/screens/JoinPartyScreen.tsx:58`) |
| Segmented tabs (`tabBar`/`tabPill`) | Discover, Friends, FollowList, Saved | No `tab` role or selected state (`mobile/src/screens/DiscoverScreen.tsx:626-660`) |
| Confirm dialog | 11 `Alert.alert` confirms; 3 hand-rolled web fallbacks | `mobile/src/screens/HomeScreen.tsx:288-289`, `mobile/src/screens/ProfileScreen.tsx:299-300`, `mobile/src/screens/MyPostsScreen.tsx:99-100` |
| List row (avatar + name + action) | Friends, FollowList, BlockedUsers, Home | |

### 3.3 Proposed small library (`mobile/src/ui/`)

Nine pieces, each with a theme-aware `makeStyles`, a role and a label. No variants beyond those listed.

| Piece | API | Adopted by |
|---|---|---|
| `Text` | `variant` = type token, `tone` = text role | every screen (incremental) |
| `Button` | `variant: primary \| secondary \| destructive \| plain`, `size: md \| lg`, `loading`, `icon` (wraps current `GradientButton`) | all 15 current `GradientButton` users, plus the ad hoc buttons in Lobby, Swipe and Profile |
| `IconButton` | `icon`, **required** `label`, 44×44 minimum hit area | all back/close/overflow buttons (32 `ArrowLeft`/`ChevronLeft`/`X` sites) |
| `ScreenHeader` | `title`, `onBack?`, `right?`, `large?` | BlockedUsers, Calendar, CreateParty, CreatePost, CrewMap, DateTime, FollowList, Friends, Join, Lobby, MyPosts, Proposal, Saved, Swipe |
| `EmptyState` | `icon`, `title`, `body`, `action?` | Discover (3), Friends (2), Hangouts, Home, MyPosts, Saved, DateTime, BlockedUsers, CommentSheet |
| `LoadingState` / `Skeleton` | `label` | Discover, Swipe, Match, Profile, FollowList, Friends |
| `Sheet` | `visible`, `onClose`, `title`; focus-trapped, Escape closes | Bookmark, Comment, UserProfile, Hangouts and Home menus, Swipe pitch, Discover venue |
| `confirm()` / `notify()` | `confirm({title, message, confirmLabel, destructive}) → Promise<boolean>`; `notify(msg)` | replaces all 79 `Alert.alert` calls (fixes Top 10 #1) |
| `SegmentedControl` | `items`, `value`, `onChange`; `tablist` role | Discover, Friends, FollowList, Saved |

`ListRow`, `Chip` and `TextField` should wait until a third screen needs them. Skip them for now.

### 3.4 Navigation shell

- **Medium.** `BottomNav` is rendered by each screen, not by a navigator (6 files), while `@react-navigation/bottom-tabs` is installed but unused (`mobile/package.json:19`). Tabs therefore remount on every switch and use `slide_from_right` (`mobile/src/navigation/MainStack.tsx:70`), which reads as push navigation, not tab switching (HIG: tabs switch instantly). **Smallest fix:** keep the custom bar, but set `animation: 'none'` for the five tab routes.
- **Medium.** The "Party" tab opens the creation form (`mobile/src/components/BottomNav.tsx:17`). A tab that starts a creation flow breaks the expectation that tabs are places. The "Calendar" tab leads to a screen titled "Upcoming Hangouts" (`mobile/src/components/BottomNav.tsx:18`; `mobile/src/screens/HangoutsScreen.tsx:245`). **Fix:** rename it "Hangouts", and make Party a centre "+" action that opens Create/Join.
- **Medium.** Inactive tab labels are 11 px `text40` (3.77:1) (`mobile/src/components/BottomNav.tsx:28,67`). The active label is `primary` on dark (3.42:1). Tabs have no role or selected state (`:30`).

---

## 4. Screens and flows

Format per screen: header pattern / states / verdict. Headers are custom on all 25 screens (`headerShown: false`, `mobile/src/navigation/MainStack.tsx:68`).

| Screen | Header | Loading / empty / error | Theme-aware | Notes (rank) |
|---|---|---|---|---|
| Onboarding | none, wordmark | n/a | No (`:17`) | Hot-linked Unsplash slides (`mobile/src/screens/OnboardingScreen.tsx:23,28,33`); slide 1 sells "alumni" (`:21`) (M) |
| Login | wordmark | inline | No (`:17`) | "Terms & Privacy Policy" is not a link (`mobile/src/screens/LoginScreen.tsx:398`) (M) |
| AuthCallback | none | spinner + Alert (no-op on web) (`:47,58`) | Yes | Web errors invisible (H) |
| CompleteProfile | large title 30 px (`:425`) | inline validation (good, `:316`) | Yes | |
| Walkthrough | large | n/a | No (`:15`) | Infinite `withRepeat` loops (4.6) |
| LocationPermission | large `h1` (`:186-189`) | Alert on error (`:94`) | Yes | |
| Home | wordmark + help | no loading state; empty "No parties yet" (`:414`) | Yes | "MATCHED! 🎉" (`mobile/src/screens/HomeScreen.tsx:142`) vs "IT'S A LINK!" (M) |
| Discover | segmented tabs + help | spinners, emoji empty states (`:685,873,914`) | **No** | Location dead end (H/M, 7.4) |
| CreateParty | `headerTitle` h3 + back | Alert error | Yes | "Create a Party" title case (`:92`) |
| JoinParty | h3 + back, then 32 px title (`:79-81`) | Alert on invalid code (`mobile/src/screens/JoinPartyScreen.tsx:23`), a no-op on web | Yes | Two titles stacked (L) |
| PartyLobby | h3 + 32 px title (`:309-310`) | no skeleton; poll + realtime | Yes | "CODE" (`:170`) and "JOIN CODE" (`:193`) label the same thing twice (L) |
| Swipe | photo top bar, white icons (`:731`) | "Loading venues..." (`:590`) | partial | Unlabeled like/nope (`:929,938`); module-level width (`:37`) (H) |
| Proposal | 16 px header (`:394`) | spinners | Yes | |
| Match | 42 px title (`:349`) | "Loading your match..." (`:211`) | Yes | The signature moment: keep it bold |
| DateTimeSetup | h3 + back | empty "No dates proposed yet" (`:657`) | Yes | 1,070 lines (6.6) |
| CalendarConfirmation | h3 + 36 px title (`:444-446`) | 8 Alerts | Yes | Promises a reminder and a notification that don't exist (8.3) (M) |
| Hangouts | 32 px title (`:306`) | no loading indicator | Yes | |
| Friends / FollowList / Blocked | 22 / 17 / 17 px | Alerts | Yes | Confirms broken on web (H) |
| Profile | 32 px (`:764`) | six "Loading..." (`:388-432`) | Yes | ALL-CAPS section labels (`:383-583`) (L) |
| MyPosts / Saved / CreatePost | 18 / 18 / 17 px | Alerts | Yes | |

### Flow coherence (first run → party → swipe → match → date → calendar)

- **Medium, inconsistent chrome across one flow.** Lobby uses an h3 header with a 32 px title (`mobile/src/screens/PartyLobbyScreen.tsx:309-310`). Swipe uses a floating photo bar (`mobile/src/screens/SwipeScreen.tsx:731`). Proposal uses a 16 px header (`mobile/src/screens/ProposalScreen.tsx:394`). Match uses a 42 px title (`mobile/src/screens/MatchScreen.tsx:349`). Calendar uses h3 plus a 36 px title (`mobile/src/screens/CalendarConfirmationScreen.tsx:444-446`). Transitions also mix push, `slide_from_bottom` and `fade` (`mobile/src/navigation/MainStack.tsx:78-83`). **Fix:** `ScreenHeader` everywhere except Swipe and Match, which are immersive by design, and one transition per flow: push forward, modal only for Create/Join.
- **Medium, no progress through the funnel.** CreateParty has a progress bar (`mobile/src/screens/CreatePartyScreen.tsx:247-248`), but the lobby → swipe → match → date path has no "step n of 4". **Fix:** a 4-dot step indicator in `ScreenHeader` for the party flow.
- **HIG and Nielsen check.** *Clarity:* weakened by 25 type sizes. *Deference:* glass blur plus gradient plus shadow on every button competes with venue photos. *Depth:* sheet and modal motion is fine. *Visibility of system status (N1):* web errors are invisible (Top 10 #1). *Match between system and the real world (N2):* "party", "crew", "hangout" and "link" are used interchangeably (8.1). *Consistency (N4):* see 3.2. *Error prevention (N5):* destructive confirms do nothing on web, and the action still doesn't run, so users think it failed. *Help (N10):* there are three hint systems (3.1). Material 3 applies only to the Android touch ripple; the app is not using it, and that is fine.

---

## 5. Responsive web

### 5.1 Today

- **Medium.** There is no app-level max width. Only two cards cap width (`mobile/src/navigation/RootNavigator.tsx:86`; `mobile/src/hooks/useLocationGuard.tsx:125`). At 1440 px, the bottom nav spreads five icons across the full viewport (`mobile/src/components/BottomNav.tsx:58`), and MyPosts and Saved compute grid tiles from the window width (`mobile/src/screens/MyPostsScreen.tsx:34`; `mobile/src/screens/SavedScreen.tsx:37`), so tiles become about 480 px squares.
- **Medium.** Swipe and Match read `Dimensions.get('window')` once at module load (`mobile/src/screens/SwipeScreen.tsx:37-38`; `mobile/src/screens/MatchScreen.tsx:26`). The swipe threshold is 25% of the *desktop* width (≈ 360 px drag) and does not update on resize. **Fix:** `useWindowDimensions()` clamped to the column width.
- **Low.** `body { overflow: hidden }` comes from the Expo template, which is fine for the app shell.

### 5.2 Recommendation: centred column plus brand rail (decision 1)

| Option | Effort | Verdict |
|---|---|---|
| Fake device bezel | S | Looks like a mockup, not a product; frame chrome fights the dark UI |
| **Centred 440 px column; at ≥ 1024 px a left rail with logo, one-line pitch, "Try the demo" and QR** | **S–M** | **Recommended.** One wrapper in `App.tsx`; every screen stays untouched |
| True responsive layouts (sidebar nav, two-pane Discover) | XL | 25 screens to redesign; not worth it before the system work |

Lazy version: wrap `<RootNavigator/>` in a `View` with `maxWidth: 440, width: '100%', alignSelf: 'center'` on web (`mobile/App.tsx:51`), plus a `bg` backdrop. `position: 'absolute'` children (`BottomNav`, toasts) then pin to the column automatically.

Breakpoints: phone below 600 (full bleed), tablet 600 to 1023 (centred column, no rail), desktop 1024 and up (column plus rail).

---

## 6. Performance and architecture

### 6.1 Bundle (4,434,644 bytes, `AppEntry-*.js`, built 2026-10-14)

- **High: lucide ships every icon.** The bundle contains about 1,692 SVG-icon-shaped modules totalling about 1.16 MB, including unused icons (`Banana`, `AirVent`, `AlarmClock` names are present). The source imports 44 distinct icons through the barrel (`from 'lucide-react-native'`, 36 import lines). Metro does not tree-shake the barrel. **Smallest fix:** a single `mobile/src/ui/icons.ts` that re-exports the 44 icons by deep path (`lucide-react-native/dist/esm/icons/<name>`), then point the 36 imports at it. Expected saving is about 1.1 MB raw. An alternative is Expo's experimental tree shaking (`EXPO_UNSTABLE_TREE_SHAKING=1` with `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1`), which is riskier.
- **Medium: Leaflet CSS and JS ship in the main chunk** (the `leaflet` stylesheet is preloaded in the built `index.html`, and `react-leaflet` is at `mobile/package.json:33,37`). It is only used by `mobile/src/components/CrewMap.web.tsx`. **Fix:** `React.lazy` the web map on the two map screens.
- **Low: unused dependencies.** `@react-navigation/bottom-tabs` (`mobile/package.json:19`), `expo-clipboard` (`:25`) and `expo-notifications` (`:30`) have 0 imports in `src`. Removing them cuts native build size and confusion.
- **Low: remote hero images.** Onboarding pulls three 1080 px Unsplash images at first paint (`mobile/src/screens/OnboardingScreen.tsx:23,28,33`). **Fix:** bundle three compressed WebP files in `assets/`.

### 6.2 Typecheck stack overflow (root cause, verified)

- **High.** `npx tsc --noEmit` in `mobile/` crashes with `RangeError: Maximum call stack size exceeded` in `checkPropertyAccessExpression`. Cause: `expo/tsconfig.base.json` sets `"allowJs": true` (`mobile/node_modules/expo/tsconfig.base.json:6`) and excludes only `node_modules` and native folders (`:20`). `mobile/tsconfig.json:1-9` has no `include`, so tsc picks up `mobile/dist/_expo/static/js/web/AppEntry-*.js` (`--listFilesOnly` confirms) and overflows on the minified bundle's deeply nested expressions. It is not a source-code problem. Verification: a scratch tsconfig extending `mobile/tsconfig.json` with `"include": ["App.tsx", "src/**/*"]` typechecks with **0 errors**.
- **Smallest fix:** add `"include": ["App.tsx", "src/**/*", "test/**/*"]` to `mobile/tsconfig.json`.
- **Low.** `@types/react ~18.2.79` (`mobile/package.json:52`) is paired with `react 19.1.0` (`:35`). Align to `~19.1.x` per the Expo SDK 54 defaults.

### 6.3 Data fetching and state

- **Low.** Fetching is `useState` + `useEffect`/`useFocusEffect` per screen with no cache (e.g. `mobile/src/screens/DiscoverScreen.tsx:393-409`, which keeps eight loading/list states). This is acceptable at this size, so don't add React Query yet. Revisit if more than two screens need the same data.
- **Low.** The lobby runs both 15 s polling (`mobile/src/hooks/pollWhileVisible.ts:1`; `mobile/src/screens/PartyLobbyScreen.tsx:67`) and a realtime channel (`mobile/src/screens/PartyLobbyScreen.tsx:74`). The poll is a deliberate safety net and is tested (`mobile/test/pollWhileVisible.test.mjs`). Keep it.
- **Low.** The Google-connect poll uses a raw `setInterval` (`mobile/src/screens/CalendarConfirmationScreen.tsx:140`) and also checks a `google_refresh_token` field (`:146`) that `/api/auth/me` never returns (`server/src/routes/auth.ts:161-174`). Only `google_calendar_connected` works. Delete the dead branch.
- **Contexts:** Auth, Theme and Hints is the right amount. State lives in screens. No change.

### 6.4 Structure, naming, dead code

| Item | Evidence | Rank | Fix |
|---|---|---|---|
| Four screens over 850 lines | Discover 1,410, Swipe 1,302, DateTimeSetup 1,070, Profile 864 (`wc -l`) | Medium | Extract sub-components (venue card, pitch sheet, date list) only when touching them for slices |
| `any` | 270 occurrences, including 30 `useNavigation<any>()` | Low | Type `useNavigation<NativeStackNavigationProp<MainStackParamList>>` once in a hook |
| `console.*` | 32 in `src` | Low | Keep `console.error`, drop logs |
| Dead component | `mobile/src/components/LinkdUpLogo.tsx:7` (0 renders) | Low | Delete, or use it as the single wordmark (8.1) |
| Empty folder | `mobile/src/types/` | Low | Delete |
| Emoji as icons | 27 instances, e.g. `mobile/src/screens/DiscoverScreen.tsx:685`, `mobile/src/components/LocationBanner.tsx:38`, `mobile/src/screens/SwipeScreen.tsx:65,74,83` | Low | lucide icons via `EmptyState` |
| Deep links | Only 2 routes mapped (`mobile/App.tsx:25-28`); the prefix list is localhost and native schemes only (`:23`) | Medium | Map `party/:partyId`, `swipe/:partyId`, `match/:partyId` so refresh and shared URLs keep context |

### 6.5 Security (out of scope, but must be reported)

- **High.** `PATCH /api/user/me` updates and then `.select()`s all columns (`server/src/routes/user.ts:97-102`) and returns the row (`:107`). The `users` table holds `google_calendar_refresh` (`server/src/db/migrations/001_fix_fks.sql:66`), so every profile save sends the user's Google refresh token to the browser, where any XSS or extension can read it. **Smallest fix:** reuse the explicit column list from `GET /me` (`server/src/routes/user.ts:49`) in the PATCH `.select(...)`, plus a test asserting the token key is absent.

---

## 7. First impressions for a recruiter

### 7.1 Page metadata

- **High.** The built `index.html` has the title "LinkdUp", a description and a theme colour (from `mobile/app.json:26-39`), but **no `og:*` or `twitter:*` tags, no preview image and no `apple-touch-icon`**. A link pasted into LinkedIn or Slack shows a bare URL.
- **Medium.** `mobile/web/robots.txt` never reaches `dist/`, because Expo's Metro web export copies `public/`, not `web/` (the current `dist/` has no `robots.txt`).
- **Smallest fix:** create `mobile/public/` and move `robots.txt` there. Add `public/index.html` (the Expo web template) with `og:title`, `og:description`, `og:image` (`/og.png`, 1200×630), `og:url`, `twitter:card=summary_large_image`, `apple-touch-icon` and `<title>LinkdUp, plan a hangout with your crew</title>`. Copy the reset styles from the current template.
- **Low.** `app.json` `themeColor` `#6C3EF4` (`mobile/app.json:33`) colours the mobile browser bar violet while the UI is near-black. Use `#0A0A0F`.

### 7.2 Landing and onboarding

- **Medium.** The first screen is a three-slide carousel, and slide 1 sells alumni reconnection (`mobile/src/screens/OnboardingScreen.tsx:21`), not the core loop (swipe together, match, lock a date) that the rest of the app is built around. **Fix:** lead with "Swipe on spots together", then "It's a Link", then "Lock the date"; drop the alumni slide or merge it into the subtitle.
- **Low.** The wordmark is "LINKDUP" in caps (`mobile/src/screens/LoginScreen.tsx:24,26,31`; `mobile/src/screens/HomeScreen.tsx:349`), while the product name is "LinkdUp" (`mobile/app.json:3`). Pick one wordmark and render it from one component (`LinkdUpLogo`).

### 7.3 Demo mode (decision 2)

- **High.** Nothing works without an account. Swipe already ships `DEMO_VENUES` (`mobile/src/screens/SwipeScreen.tsx:61-89`) and an `isDemo` path (`:105`), but it is only reachable when `partyId` is missing.
- **Recommended:** a "Try the demo" button on Onboarding and the desktop rail that signs into a seeded, read-only demo account (one party mid-vote, three friends, one locked hangout). The seed script and account live server-side, so no secrets are in the client bundle. The demo account needs RLS so demo users cannot modify shared rows; that is the main risk.
- **Alternative:** an unauthenticated scripted tour (Swipe demo → Match → Calendar) using the existing `'demo'` fallbacks (`mobile/src/screens/MatchScreen.tsx:133`; `mobile/src/screens/DateTimeSetupScreen.tsx:265`; `mobile/src/screens/CalendarConfirmationScreen.tsx:38,82`). Cheaper on the backend, but the demo can drift from real behaviour.

### 7.4 Discover fallback, "pick a city"

- **Medium.** When location is denied or unavailable, Discover shows a card whose only action is "Try again" (`mobile/src/screens/DiscoverScreen.tsx:684-697`), with denied copy at `:34`. A recruiter on a desktop browser without location sees no venues.
- **Smallest fix (client only):** the server already accepts any `lat`/`lng` (`server/src/routes/discover.ts:18-24`), and `api.searchPlace` exists (`mobile/src/services/api.ts:85`; used by `mobile/src/components/LocationSourceCard.tsx:73`). Add a secondary "Pick a city" button that opens a city field, geocodes with `searchPlace`, and calls `api.discoverVenues(lat, lng)` (`mobile/src/services/api.ts:149`). Persist the choice in memory only.

---

## 8. Copy and tone

### 8.1 Vocabulary (decisions 3 and 5)

| Concept | Words in use | Evidence | Proposal |
|---|---|---|---|
| The group | party, crew, hangout, alumni | `mobile/src/components/BottomNav.tsx:17`; `mobile/src/screens/CreatePartyScreen.tsx:119`; `mobile/src/screens/HangoutsScreen.tsx:245`; `mobile/src/screens/HomeScreen.tsx:359` | **Party** = the planning room. **Crew** = its members. **Hangout** = a locked plan. Drop "alumni" outside sign-up. |
| The match | "MATCHED! 🎉", "IT'S A LINK! 🎉", "See the match" | `mobile/src/screens/HomeScreen.tsx:142`; `mobile/src/screens/MatchScreen.tsx:253`; `mobile/src/screens/PartyLobbyScreen.tsx:262` | "It's a Link" on the moment; "Match" everywhere else |
| The tab | "Calendar" tab → "Upcoming Hangouts" | `mobile/src/components/BottomNav.tsx:18`; `mobile/src/screens/HangoutsScreen.tsx:245` | "Hangouts" |
| Party code | "CODE", "JOIN CODE", "Party code (tap to copy / share)", "invite code" | `mobile/src/screens/PartyLobbyScreen.tsx:170,193`; `mobile/src/screens/SwipeScreen.tsx:1024`; `mobile/src/screens/CreatePartyScreen.tsx:190` | "Invite code" |

### 8.2 Style

- **Low, case.** Title Case and sentence case are mixed: "Create a Party" (`mobile/src/screens/CreatePartyScreen.tsx:92`), "Join a Party" (`mobile/src/screens/JoinPartyScreen.tsx:44`), "Pick a Date" (`mobile/src/screens/DateTimeSetupScreen.tsx:200`), "Blocked Users" (`mobile/src/screens/BlockedUsersScreen.tsx:95`), against "Complete your profile" (`mobile/src/screens/CompleteProfileScreen.tsx:231`) and "Propose a date" (`mobile/src/screens/DateTimeSetupScreen.tsx:504`). **Rule:** sentence case everywhere (HIG and Material agree).
- **Low, ellipsis.** "Loading venues..." (`mobile/src/screens/SwipeScreen.tsx:590`) vs "Finding nearby spots…" (`mobile/src/screens/DiscoverScreen.tsx:706`). **Rule:** use `…`.
- **Low, caps labels.** "USERNAME", "SCHOOL", "DANGER ZONE" (`mobile/src/screens/ProfileScreen.tsx:383,393,583`). Use sentence-case section headers.
- **Low, wayfinding in copy.** "No friends yet — add some from Home → Friends." (`mobile/src/screens/PartyLobbyScreen.tsx:177`). Replace with an inline "Find friends" button.

### 8.3 Errors and promises

- **Medium, false promises.** "Reminder: 1 hour before event" (`mobile/src/screens/CalendarConfirmationScreen.tsx:397-398`) and "💡 You'll receive a notification when it's time to head out" (`:431`). The server Google Calendar service sets no reminders (0 matches for `reminder` in `server/src`), and `expo-notifications` is never imported. **Fix:** delete both lines, or add `reminders.overrides` in `server/src/services/googleCalendar.ts` and keep only the first.
- **Medium, raw error text.** Fallbacks such as `'unknown'` (`mobile/src/screens/CalendarConfirmationScreen.tsx:159`; `mobile/src/screens/CreatePartyScreen.tsx:58`; `mobile/src/screens/DateTimeSetupScreen.tsx:403`), plus the generic title `'Error'` (`mobile/src/screens/FriendsScreen.tsx:100`; `mobile/src/screens/FollowListScreen.tsx:43`), show server codes like `invalid_coordinates` to users. **Fix:** route messages through one `errorMessage(e)` map that follows "what happened + how to fix", e.g. "Couldn't join. Check the code and try again."
- **Low, unlinked legal text.** "By continuing, you agree to our Terms & Privacy Policy" (`mobile/src/screens/LoginScreen.tsx:398`) links nowhere. Link it, or remove it until pages exist.

### 8.4 Empty states (what it is + why it's empty + how to start)

| Where | Now | Proposed |
|---|---|---|
| `mobile/src/screens/DiscoverScreen.tsx:874-875` | "No one's hanging out nearby yet" / "Be the first to start a party!" | "No public parties nearby" / "Start one and it'll show up here for people close by." + "Start a party" |
| `mobile/src/screens/DiscoverScreen.tsx:915` | "Nothing liked yet" | "No liked spots yet" / "Tap the heart on any spot in Explore to save it for your next party." |
| `mobile/src/screens/BlockedUsersScreen.tsx:108` | "No blocked users." | "You haven't blocked anyone" (no period, no action needed) |
| `mobile/src/screens/SwipeScreen.tsx:669` | "No more venues!" | "You've seen every spot" / "Wait for your crew, or match from your likes." |

---

## 9. Accessibility (WCAG 2.2 AA)

### 9.1 Perceivable

| # | Issue | WCAG | Rank | Evidence | Fix |
|---|---|---|---|---|---|
| P1 | `text40`/`textMuted` used for readable text: 3.77:1 (dark), 2.69:1 (light); `text30` 2.62 / 2.03 | 1.4.3 | High | `mobile/src/theme/colors.ts:19-22,53-56`; 104 uses | Token `textTertiary` (2.2) |
| P2 | White on the gradient's cyan end is 2.07:1 | 1.4.3 | High | `mobile/src/theme/colors.ts:4`; `mobile/src/components/GradientButton.tsx:88,129` | Gradient end `#2563EB` |
| P3 | Light `warning` 2.15:1, `success` 2.54:1, `danger` 3.61:1 | 1.4.3 | Medium | `mobile/src/theme/colors.ts:58,60,62` | 2.2 values |
| P4 | Accent text on dark is 3.42:1 (active tab label 11 px) | 1.4.3 | Medium | `mobile/src/components/BottomNav.tsx:28` | `accentText` |
| P5 | Input and border outlines are 1.26:1 (dark), 1.18:1 (light) | 1.4.11 | Medium | `mobile/src/theme/colors.ts:13,47` | `borderStrong` for inputs |
| P6 | Emoji announced by screen readers ("party popper") | 1.1.1 | Low | 27 instances (6.4) | `EmptyState` with `aria-hidden` icon |
| P7 | No font-scaling policy; 19 uses below 11 px | 1.4.4 | Medium | `fontSize` 8 (×5), 9, 10 (×13) | Minimum 12 px via `Text` |

### 9.2 Operable

| # | Issue | WCAG | Rank | Evidence | Fix |
|---|---|---|---|---|---|
| O1 | No visible focus style anywhere (0 matches for `outline`, `focus` or `tabIndex` in `src`) | 2.4.7, 2.4.11 | High | grep | `focus` ring in `Button`/`IconButton` via `:focus-visible` on web |
| O2 | Swipe is gesture-first; buttons exist but there are no keyboard shortcuts (←/→) on web | 2.1.1, 2.5.7 | Medium | `mobile/src/screens/SwipeScreen.tsx:537,929-966` | `keydown` listener on web while Swipe is focused |
| O3 | Small targets: close X 13 px icon (`mobile/src/components/LocationBanner.tsx:44`), 38 px back buttons, and text-only links | 2.5.8 (24 px minimum), HIG 44 pt | Medium | 30 `hitSlop` uses show this is known | `IconButton` enforces 44×44 |
| O4 | Nested touchables: a close button inside a pressable pill | 4.1.2 / 2.1.1 | Low | `mobile/src/components/LocationBanner.tsx:33-43` | Make them siblings |
| O5 | Modals: 16 `<Modal>` files, 3 with `accessibilityViewIsModal`/live-region props; no focus return on web | 2.4.3 | Medium | grep | `Sheet` component |
| O6 | Motion: 0 checks for reduced motion; infinite loops in the walkthrough | 2.3.3 (AAA), 2.2.2 | Medium | `mobile/src/components/walkthrough/HighlightRing.tsx:22`; `SlideFourVisual.tsx:21,30`; `SlideThreeVisual.tsx:27`; `SlideSixVisual.tsx:22` | Reanimated `useReducedMotion()` gate in a `motion` helper |

### 9.3 Understandable and robust

| # | Issue | WCAG | Rank | Evidence | Fix |
|---|---|---|---|---|---|
| U1 | Errors invisible on web (Alert no-op) | 3.3.1, 4.1.3 | High | Top 10 #1 | `notify()` with `accessibilityLiveRegion="polite"` / `role="status"` |
| U2 | Placeholder-only label on the join code | 3.3.2 | Low | `mobile/src/screens/JoinPartyScreen.tsx:58` | Visible label |
| R1 | 212 touchables, 12 labels, 16 roles, 4 states | 4.1.2 | High | grep counts | `IconButton` (required `label`), `Button` (role/state), `SegmentedControl` (`tab` + `selected`) |
| R2 | Like/nope buttons unlabeled | 4.1.2 | High | `mobile/src/screens/SwipeScreen.tsx:929,938,955,962` | `accessibilityLabel="Skip <venue>"`, `"Like <venue>"` |

Strengths to keep: `GradientButton` exposes role and state (`mobile/src/components/GradientButton.tsx:60-61`), images carry alt text (`mobile/src/screens/SwipeScreen.tsx:714,795`; `mobile/src/screens/OnboardingScreen.tsx:72`), and the Discover location message is a live region (`mobile/src/screens/DiscoverScreen.tsx:687`).

Manual checks still needed: VoiceOver on iOS and NVDA on web, keyboard-only pass of the party flow, and 200% browser zoom.

---

## 10. Tests and quality gates

| Area | Today | Evidence | Gap / rank |
|---|---|---|---|
| Server unit and integration | 152 tests pass (`npm test`); 14 test files covering 13 routes and 6 services | `server/test/` | `services/matchEngine.ts` is not referenced by any test file (Medium: it is core logic) |
| Server typecheck | passes | `server/package.json` `typecheck` | |
| Mobile unit | 21 tests pass, 3 files, pure logic only | `mobile/test/*.test.mjs`; `mobile/package.json:12` | No component or screen tests (Medium) |
| Mobile typecheck | **crashes** | 6.2 | High; one-line fix |
| Lint | none in either package (no ESLint config, no `lint` script) | `mobile/package.json:5-13`; `server/package.json` scripts | Medium |
| CI | none (no `.github/`) | repo root | High for a portfolio: a green badge is a recruiter signal |
| Web build | Vercel only | `mobile/vercel.json:2` | Not run on PRs before merge |

### Proposed test strategy (smallest useful set)

1. **CI (Slice 0):** a GitHub Actions workflow running `server: npm ci && npm run typecheck && npm test` and `mobile: npm ci && npm run typecheck && npm test && npm run build:web`. Add a bundle-size check on the web build: fail if the `AppEntry` JS exceeds 3.5 MB once Slice 5 lands.
2. **Lint:** `eslint` with `eslint-config-expo` in mobile, warnings only at first. Add the `react-native-a11y` rules later as an error once `IconButton` lands.
3. **Server:** one test for the PATCH `/me` column list (6.5), plus `matchEngine` unit tests (tie-break, all-yes, nobody-yes).
4. **Mobile pure logic (node:test, as today):** `confirm()`/`notify()` platform branching, `errorMessage()` map, and contrast check of every token pair (the script in 2.2 as a test).
5. **Screen-level:** don't add Jest and RN Testing Library for 25 screens now. Instead add **one Playwright smoke test** against `dist/` (served locally): it loads, the onboarding CTA is visible, the Tab key reaches it with a visible focus ring, and `axe` reports no serious violations. One test catches the web-only class of bugs this audit found.

---

## 11. Tech-debt register

Score = (Impact + Risk) × (6 − Effort), each 1 to 5.

| Item | Type | I | R | E | Score |
|---|---|---|---|---|---|
| tsc crash (6.2) | Infra | 4 | 4 | 1 | **40** |
| Refresh token in PATCH response (6.5) | Security | 3 | 5 | 1 | **40** |
| Alert no-op on web (Top 10 #1) | Code | 5 | 4 | 2 | **36** |
| No CI (10) | Infra | 3 | 4 | 2 | **28** |
| lucide full bundle (6.1) | Perf | 3 | 2 | 2 | **20** |
| Static dark `colors` (2.1) | Code | 4 | 3 | 3 | **21** |
| No shared header, empty state or icon button (3.3) | Code | 4 | 2 | 3 | **18** |
| Unused tokens and 25 font sizes (2.1) | Code | 3 | 1 | 4 | **8** |
| Large screens over 850 lines (6.4) | Code | 2 | 2 | 4 | **8** |
| `any` ×270 (6.4) | Code | 2 | 2 | 4 | **8** |

---

## 12. Quick wins (no refactor; each under an hour)

1. Add `"include": ["App.tsx", "src/**/*", "test/**/*"]` to `mobile/tsconfig.json` (fixes the tsc crash).
2. Change the PATCH `/me` `.select()` to an explicit column list (`server/src/routes/user.ts:101`) and add a test.
3. Delete the false reminder and notification copy (`mobile/src/screens/CalendarConfirmationScreen.tsx:397-398,431`).
4. Gradient end `#00C2FF` → `#2563EB` (`mobile/src/theme/colors.ts:4,38`); light `success`/`warning`/`danger` to the 2.2 values (`:58,60,62`).
5. `text40`/`textMuted` alpha to 0.50 (dark, `:19,22`) and 0.60 (light, `:53,56`). Fixes 104 uses at once.
6. Label the like and nope buttons (`mobile/src/screens/SwipeScreen.tsx:929,938,955,962`) and the Swipe back button (`:731`).
7. Rename the "Calendar" tab to "Hangouts" (`mobile/src/components/BottomNav.tsx:18`); add `accessibilityRole="tab"` and `accessibilityState={{ selected: active }}` (`:30`).
8. Move `mobile/web/robots.txt` to `mobile/public/robots.txt`.
9. Remove `@react-navigation/bottom-tabs`, `expo-clipboard` and `expo-notifications` (`mobile/package.json:19,25,30`), and delete `LinkdUpLogo.tsx` (or adopt it) and the empty `src/types/`.
10. Set `"themeColor": "#0A0A0F"` (`mobile/app.json:33`).
11. Link or remove the Terms line (`mobile/src/screens/LoginScreen.tsx:398`).
12. Use one match term: change "MATCHED! 🎉" (`mobile/src/screens/HomeScreen.tsx:142`) to the chosen one.

---

## 13. Refactor plan (ship slice by slice, in order)

Each slice is one PR off `main`, independently shippable and revertible. Effort: S ≤ ½ day, M ≈ 1 day, L ≈ 2 to 3 days.

**Global constraints for every slice:** no new runtime dependencies unless the slice names one; theme-aware styles only (`useTheme` + `makeStyles`); every new interactive element has a role and label; `mobile: npm run typecheck && npm test` and `server: npm test` pass; check the web build at 390 px and 1440 px in both themes.

**Review focus (failure modes no slice's unit tests cover):**
1. Web confirm dialogs with the browser's "block dialogs" setting: `confirm()` must return `false`, not hang.
2. Light theme on screens that never call `useTheme` (16 files): eyeball after Slice 3.
3. Swipe threshold after window resize on desktop (Slice 7).
4. Demo account writes: the demo user must not mutate shared rows (Slice 9).
5. Screen reader order inside `Sheet` on web (Slice 4).

### Slice 0: Safety and gates (S)
- **Scope:** quick wins 1, 2 and 8; CI workflow (10.1).
- **Files:** `mobile/tsconfig.json`, `server/src/routes/user.ts`, `server/test/` (new PATCH-columns test), `mobile/public/robots.txt`, `.github/workflows/ci.yml`.
- **Risk:** Low. The `.select()` column list must include every field the client reads after save (compare with `GET /me`, `server/src/routes/user.ts:49`).
- **Test plan:** CI is green; the new server test fails on today's code (the token key is present) and passes after; mobile `tsc` exits 0.

### Slice 1: Web-safe dialogs and messages (M)
- **Scope:** `mobile/src/ui/dialog.ts` exporting `confirm()` (web: `window.confirm`; native: `Alert` promise) and `notify()` (web: a toast via a tiny context; native: `Alert`), plus an `errorMessage(e)` map. Replace all 79 `Alert.alert` calls and remove the three hand-rolled fallbacks (`mobile/src/screens/HomeScreen.tsx:288`, `mobile/src/screens/ProfileScreen.tsx:299`, `mobile/src/screens/MyPostsScreen.tsx:99`).
- **Files:** new `mobile/src/ui/dialog.ts`, `mobile/src/ui/Toast.tsx`, `mobile/App.tsx`, and the 22 files that call `Alert.alert`.
- **Risk:** Medium (touches many files). It is a mechanical swap.
- **Test plan:** `mobile/test/dialog.test.mjs` covers platform branching and `errorMessage` mappings. Manual web check: remove friend, block user, delete comment and invalid join code all show UI.

### Slice 2: Token v2 (S)
- **Scope:** colour roles, type scale, spacing, radii, elevation and motion from 2.2, written into `mobile/src/theme/`. Keep the old names as aliases so nothing breaks. Includes quick wins 4 and 5.
- **Files:** `mobile/src/theme/colors.ts`, `mobile/src/theme/typography.ts`, `mobile/src/theme/spacing.ts`, `mobile/src/theme/index.ts`, new `mobile/src/theme/motion.ts`, new `mobile/test/contrast.test.mjs`.
- **Risk:** Low. It changes values, not structure; the visual diff is intentional.
- **Test plan:** the contrast test asserts every `text*` role is ≥ 4.5:1 on `bg`/`surface` in both themes and `borderStrong` is ≥ 3:1.

### Slice 3: Light-mode correctness (M) (skip if decision 4 is dark-only)
- **Scope:** remove the `colors` export (`mobile/src/theme/colors.ts:71`); convert the 16 static-import files to `useTheme` + `makeStyles`; replace hard-coded `'white'` on non-photo surfaces with `text`.
- **Files:** the 16 files in 2.1 (Discover, Login, Onboarding, Walkthrough, three navigators, CrewMap, IconBadge, LinkdUpLogo, six walkthrough visuals).
- **Risk:** Medium. Discover is 1,410 lines; convert its styles in place, with no logic edits.
- **Test plan:** tsc proves no static `colors` import remains. Manual check: every converted screen in light mode at 390 px.

### Slice 4: Core UI kit (L)
- **Scope:** `Text`, `Button` (wraps `GradientButton`), `IconButton`, `ScreenHeader`, `EmptyState`, `LoadingState`, `Sheet`, `SegmentedControl` in `mobile/src/ui/`. Adopt them **only** in the party flow first: Lobby, Swipe (header excluded), Proposal, Match, DateTimeSetup, CalendarConfirmation.
- **Files:** new `mobile/src/ui/*.tsx`; the 6 flow screens.
- **Risk:** Medium (visual change on the flow recruiters are most likely to see).
- **Test plan:** the Playwright smoke test (10.5) extended to Tab through the Lobby (visible focus, labelled buttons); `axe` shows no serious violations on Lobby.

### Slice 5: Icons and bundle (S)
- **Scope:** `mobile/src/ui/icons.ts` with deep-path re-exports for the 44 icons; repoint the 36 import lines; lazy-load the web map; replace emoji icons via `EmptyState`.
- **Files:** `mobile/src/ui/icons.ts`, the 36 importing files, `mobile/src/components/CrewMap.web.tsx` callers.
- **Risk:** Low. A wrong deep path fails at build time, not at runtime.
- **Test plan:** `npm run build:web`, then check `AppEntry` size ≤ 3.4 MB (from 4.43 MB); grep the bundle for `Banana` returns 0; add the CI size check.

### Slice 6: Navigation shell (S)
- **Scope:** tab routes use `animation: 'none'`; rename the tab to "Hangouts"; Party becomes a centre "+" that offers Create or Join; tab roles and states; deep-link config for party, swipe and match routes.
- **Files:** `mobile/src/components/BottomNav.tsx`, `mobile/src/navigation/MainStack.tsx`, `mobile/App.tsx`.
- **Risk:** Low to Medium (deep links on refresh need the party param validated; an unknown id should land on Home with a notice).
- **Test plan:** manual: refresh on `/party/<id>` keeps the lobby; keyboard Tab cycles the nav with focus visible.

### Slice 7: Desktop frame (S)
- **Scope:** a centred 440 px column on web with a brand rail at ≥ 1024 px (5.2); replace module-level `Dimensions` in Swipe and Match with clamped `useWindowDimensions`.
- **Files:** `mobile/App.tsx`, new `mobile/src/ui/WebFrame.tsx`, `mobile/src/screens/SwipeScreen.tsx:37-38`, `mobile/src/screens/MatchScreen.tsx:26`.
- **Risk:** Low.
- **Test plan:** Playwright screenshots at 390, 820 and 1440 px; drag threshold on Swipe at 1440 px is about 110 px.

### Slice 8: First impression (S)
- **Scope:** `mobile/public/index.html` with OG and Twitter tags, `og.png`, `apple-touch-icon`; reorder the onboarding slides and bundle the images locally (7.2); copy fixes from 8.1 to 8.4 (needs decisions 3 and 5).
- **Files:** `mobile/public/index.html`, `mobile/public/og.png`, `mobile/assets/onboarding-*.webp`, `mobile/src/screens/OnboardingScreen.tsx`, the screens named in section 8.
- **Risk:** Low.
- **Test plan:** the Playwright smoke test asserts `meta[property="og:image"]` exists; paste the URL into LinkedIn's Post Inspector after deploy.

### Slice 9: Demo and Discover fallback (M)
- **Scope:** a "Pick a city" fallback on Discover (7.4); a "Try the demo" entry point (7.3, per decision 2).
- **Files:** `mobile/src/screens/DiscoverScreen.tsx`, `mobile/src/screens/OnboardingScreen.tsx`, `mobile/src/ui/WebFrame.tsx`; server seed script plus RLS policy for the demo account (if chosen).
- **Risk:** Medium (demo writes need guarding).
- **Test plan:** server test that the demo user cannot mutate another party; manual: deny location → Pick a city → venues appear.

### Slice 10: Adoption sweep (L, optional)
- **Scope:** roll the UI kit out to the remaining screens; reduced-motion gate; sentence-case pass; split Discover, Swipe and DateTime into sub-components while touching them.
- **Risk:** Medium; do it one screen per PR if you prefer.
- **Test plan:** the ESLint a11y rule set flipped from warning to error at the end.

| Slice | Effort | Depends on |
|---|---|---|
| 0 Safety and gates | S | none |
| 1 Web dialogs | M | 0 |
| 2 Tokens v2 | S | 0 |
| 3 Light mode | M | 2 |
| 4 UI kit (party flow) | L | 1, 2 |
| 5 Icons and bundle | S | 0 |
| 6 Nav shell | S | 4 |
| 7 Desktop frame | S | 0 |
| 8 First impression | S | decisions 3 and 5 |
| 9 Demo and city fallback | M | 7, decision 2 |
| 10 Adoption sweep | L | 4 |
