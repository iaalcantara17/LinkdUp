# Cursor Pro Prompts — Sequenced

These prompts are designed to be pasted into Cursor Pro **in order**. Each one tells Cursor exactly which files to touch and what to change. Do not skip ahead — each prompt builds on the state the previous one leaves the codebase in.

Open Cursor in the **monorepo root** (`linkdup/`). Cursor should have access to both `/server` and `/mobile` so it can read the spec and types when generating UI.

---

## Prompt 0 — Repo orientation (run once at start)

```
Read the following files top-to-bottom before writing any code:
1. docs/LinkdUp_Spec_v2.md
2. docs/LinkdUp_Scope_v2.md
3. server/src/db/schema.sql
4. server/src/index.ts and every file in server/src/routes/
5. mobile/App.tsx, mobile/src/theme/, mobile/src/services/api.ts, mobile/src/navigation/

Summarize back to me in 5 bullet points:
- What the app does
- The 5 main backend services
- The 5 most important screens
- The brand color tokens
- The match threshold rule

Do not write any code yet. Wait for my next prompt.
```

---

## Prompt 1 — Verify the install and boot the backend

```
In the /server folder:
1. Run `npm install`. If any peer dependency warnings appear, ignore them unless they are errors.
2. Verify the env vars I have set in /server/.env. List which ones are still set to "replace-me".
3. Run `npm run dev` and tell me whether the server boots. If it crashes, paste the error and propose a fix BEFORE making any code change.
4. Test GET http://localhost:3000/api/health and confirm it returns { ok: true }.

Report back. Do not modify code unless I approve.
```

---

## Prompt 2 — Verify the Supabase schema is in place

```
Using the Supabase URL and service role key in /server/.env:
1. Connect to Supabase via the @supabase/supabase-js admin client (a one-off TS script in /server/scripts/check-schema.ts).
2. Confirm all 8 tables exist: schools, users, parties, party_members, locations, votes, party_dates, date_votes.
3. Confirm the v_party_vote_tallies view exists.
4. Confirm the schools table has at least 10 seed rows.
5. Print a checklist of what is present and what is missing.

If something is missing, tell me what SQL needs to be re-run from server/src/db/schema.sql. Do NOT auto-apply.
```

---

## Prompt 3 — Boot the mobile app

```
In the /mobile folder:
1. Run `npm install`. Resolve any Expo SDK 51 peer dependency conflicts by using the versions in package.json — do not bump them.
2. Verify /mobile/.env has EXPO_PUBLIC_API_URL set to your laptop LAN IP (not localhost).
3. Run `npx expo start`. Open Expo Go on your phone and scan the QR code.
4. The app should land on SplashScreen → OnboardingScreen.
5. If anything errors at runtime, paste the error and propose a fix before changing code.

Confirm the splash, onboarding, login, and signup screens render with the dark mode + gradient styling from mobile/src/theme/.
```

---

## Prompt 4 — End-to-end auth smoke test

```
With the server running (port 3000) and the mobile app loaded on a real device:
1. Tap "Get Started" → SignUpScreen.
2. Fill in email, password, display name. Pick a school from the autocomplete.
3. Tap "Create Account".

Expected result:
- POST /api/auth/signup returns 201 with a session
- The mobile app calls supabase.auth.setSession with the returned tokens
- AuthContext detects the session and switches RootNavigator to MainStack
- MainTabs renders with HomeScreen visible

If any step fails, identify which file is the problem (server route, mobile screen, or supabase config) and propose a fix.
```

---

## Prompt 5 — Polish the SwipeScreen animation (the demo wow factor)

```
File to edit: mobile/src/screens/SwipeScreen.tsx

Right now, voting just changes the index. Add gesture-based swipe animations:
1. Wrap the venue card in a react-native-reanimated Animated.View.
2. Use useSharedValue for translateX and rotate.
3. Add a Gesture.Pan() from react-native-gesture-handler that updates translateX live.
4. On swipe end, if |translateX| > screen_width * 0.3, fly the card off-screen (translateX to ±screen_width) and call handleVote(true) for right, handleVote(false) for left.
5. Use withSpring for snap-back when the swipe is too short.
6. Add a subtle tint overlay: green when translateX > 0, red when translateX < 0, opacity proportional to |translateX| / (screen_width * 0.3).

Do not change the data flow or the vote API call. Only the visual swipe gesture.
```

---

## Prompt 6 — Wire Supabase Realtime for live vote sync

```
File to edit: mobile/src/screens/SwipeScreen.tsx

Add realtime updates to the crew HUD avatars so they show live swipe status from other party members.

1. Inside SwipeScreen, after load(), set up a Supabase Realtime channel:
   const channel = supabase.channel(`votes:party_id=eq.${partyId}`)
     .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `party_id=eq.${partyId}` }, (payload) => {
       // refetch the latest votes via api.getVotes
     })
     .subscribe();
2. On each realtime event, call api.getVotes(partyId) and store the tally in state.
3. The crew HUD AvatarBubble should now pass a `status` prop based on whether each member has voted on the *current* card. Map: not voted → 'waiting', vote=true → 'yes', vote=false → 'no'.
4. Clean up the channel in the useEffect return.

Test: open the app on two phones (or one phone + the web Expo build), join the same party, and confirm that when one device swipes the other device's HUD updates within a second.
```

---

## Prompt 7 — Fonts (Space Grotesk + Inter)

```
The theme references Space Grotesk and Inter but we're using the system font fallback.

1. Install: `npx expo install expo-font @expo-google-fonts/space-grotesk @expo-google-fonts/inter`
2. In App.tsx, use useFonts to load SpaceGrotesk_700Bold, SpaceGrotesk_800ExtraBold, Inter_400Regular, Inter_600SemiBold, Inter_700Bold.
3. Show a loading state while fonts load.
4. Update mobile/src/theme/typography.ts to set fontFamily on each style:
   - display, h1, h2, h3 → 'SpaceGrotesk_800ExtraBold' (or 700Bold for h3)
   - body, bodyBold, caption → 'Inter_400Regular' / 'Inter_600SemiBold'
```

---

## Prompt 8 — Fix any TypeScript errors across the monorepo

```
1. cd server && npm run typecheck
2. cd mobile && npm run typecheck
3. For each error, fix it in place. Do NOT use `any` to silence errors unless it is genuinely untyped third-party data.
4. Common ones to expect:
   - Supabase joined-table types (party_members.users) are typed as arrays even though they should be single objects — cast with `as any` only at the access site, not the variable declaration.
   - Optional chain on possibly-undefined route params.

Report a clean typecheck on both packages before stopping.
```

---

## Prompt 9 — Deploy the backend to Railway

```
1. Confirm /server/package.json has `start: node dist/index.js` and `build: tsc`.
2. Add a `Procfile` (single line: `web: npm run start`) and a `railway.json` if needed for monorepo root detection.
3. Walk me through pushing the repo and connecting Railway to /server as the root directory.
4. After Railway gives me a public URL, update /mobile/.env EXPO_PUBLIC_API_URL to that URL.
5. Update the Google OAuth client redirect URIs to include the Railway URL.

Do not push secrets to GitHub. Verify .gitignore covers .env.
```

---

## Prompt 10 — Final demo polish

```
Before May 7, do these polish passes:
1. SplashScreen — add a fade-in animation on the wordmark using reanimated.
2. MatchScreen — add a confetti animation (use react-native-confetti-cannon, install via expo install).
3. HomeScreen — actually fetch active parties from a new GET /api/user/parties endpoint. Add the endpoint to /server/src/routes/user.ts: returns parties where the user is a member, ordered by updated_at desc.
4. ProfileScreen — add an avatar color picker (3-4 swatches from the gradient palette).
5. Run the full TC-01 → TC-20 flow from docs/TEST_PLAN.md and report which pass.

Do these in order. Stop after each step and let me eyeball it.
```

---

## How to use these with Cursor Pro

- Paste **one prompt at a time**. Wait for Cursor to finish before sending the next.
- After each prompt, eyeball the result on your phone or in the browser before moving on.
- If Cursor produces something that contradicts the spec (`docs/LinkdUp_Spec_v2.md`), tell it: "That doesn't match Section X of the spec. Re-read it and fix."
- If Cursor wants to install extra dependencies, only approve the ones in the prompt. Reject anything new.
- Don't let Cursor refactor files outside the ones the prompt names. If it offers, decline.
