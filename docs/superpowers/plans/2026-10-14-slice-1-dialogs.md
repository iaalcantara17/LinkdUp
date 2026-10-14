# Slice 1: Web-safe dialogs and toasts

**Goal:** Replace all 79 `Alert.alert` calls (a no-op on web) and the 7 `window.confirm` fallbacks with one themed dialog and toast system that works on web, iOS and Android.

**Architecture:** A pure TypeScript store (`mobile/src/components/dialogs.ts`) owns a FIFO dialog queue and a toast list, with `confirm`, `showError`, `showInfo`, `showMenu`, `toast`, `respond`, `subscribe`. A React host (`mobile/src/components/DialogHost.tsx`), mounted once in `App.tsx` inside `ThemeProvider`, renders the head of the queue in a React Native `Modal` (react-native-web gives focus trap, Escape to `onRequestClose`, `aria-modal` and focus return) and toasts in a `role="status"` live region.

**Spec:** `docs/DESIGN_AUDIT.md` (branch `design-audit`), Top 10 #1 and Slice 1. The user's brief overrides the audit's `window.confirm` idea: dialogs are themed in-app on every platform.

## Global constraints
- No new dependencies. Theme through `useTheme()`. No code comments.
- Every button is at least 44×44 with a role and label. Confirm and error dialogs use `role="alertdialog"`; info and menu use `role="dialog"`.
- Sentence case, "Couldn't …" + how to fix, "Link" when a match is mentioned.

## Review focus
1. Two dialogs fired back to back (error inside a confirm's action): the second must show after the first closes, not replace it.
2. Escape or Android back on a confirm must count as cancel and never run the destructive action.
3. Raw server codes (`not_host`, `HTTP 500`) must never reach the user.
4. Focus returns to the button that opened the dialog on web.
5. Toasts never block taps and are announced politely.

## Tasks
1. **Store, tests first.** `mobile/test/dialogs.test.mjs`: queueing order, confirm resolves true/false, dismiss = cancel, destructive flag on the confirm button, menu runs the chosen action only, toast auto-expires, `errorText` maps codes. Then a guard test that greps `mobile/src` and `mobile/App.tsx` for `Alert.alert` (fails until Task 3 is done). Implement `dialogs.ts`. Commit.
2. **Host UI.** `DialogHost.tsx` + mount in `App.tsx`. Commit.
3. **Swap call sites** in three commits: confirms and menus, errors, success/info. Remove `window.confirm` branches. Guard test now passes.
4. **Verify.** `npm run typecheck`, `npm test`, `npm run build:web` in `mobile`. Server untouched. Push `slice-1-dialogs`, no merge.
