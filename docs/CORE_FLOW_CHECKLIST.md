# Core Flow Checklist

Run this after every deploy. It takes about 15 minutes and follows the same path as the automated tests in `server/test/coreFlow.test.ts`, `mobile/test/coreFlowLogic.test.mjs` and `mobile/screens-test/screens.test.js`. If a step fails, note the step number and stop: the later steps depend on it.

## Before you start

- Two test accounts (call them **Host** and **Guest**), each signed in on a different browser or device.
- Host has Google Calendar connected (Profile, or the Calendar screen). Guest does not.
- One browser where you can allow location and one where you will block it.

## 1. Sign in

1. Sign out, then sign in as Host with the right password. You land on Home and see "Hey <name>!".
2. Sign out and try a wrong password. You see "That email and password don't match. Try again." and stay on the login screen.
3. Sign back in as Host.

## 2. Create and join

1. Host: tap **+** (Party tab) and create a party named "Checklist <date>". The lobby shows the name and a 6-character join code.
2. Guest: Home, **Have a code? Join a party**, type the code in lowercase. Guest lands in the same lobby.
3. Guest: try the code `ZZZZZZ`. You see "We couldn't find that party. Check the code and try again."
4. Both: the lobby crew list shows both people.

## 3. Set location

1. Host: **Use my live location** and allow it. The card says **Live**.
2. Guest: **Use a different location**, pick a city. The card says **Custom: <city>**.
3. Neither lobby shows exact coordinates anywhere, only "approximate" wording on the map.
4. On a browser with location blocked, the card says the browser location is **Blocked** and the city option still works.

## 4. Start swiping

1. Guest: there is no **Start swiping** button; it says "Waiting for the host to start...".
2. Host: **Start swiping**. Both screens move to Swipe and show "Card 1 of N".
3. Host: open the lobby again and try Start once more if the button shows. It must not start a second time.

## 5. Vote to a Link

1. Host likes card 1. Host sees "Voted ✓ - waiting for <Guest>…"; the card does not advance yet.
2. Guest votes on card 1. Both advance to card 2 together.
3. Finish the round with at least one card liked by both. When the last vote lands, both screens switch to the proposal.
4. Both accept the proposal. Both see the Link (match) screen with the same venue.

**Side checks (run on a throwaway party when time allows):**

- Nobody likes anything in a round: a new round starts with fresh cards after the old ones.
- Reject the proposal three times: a new swiping round starts.
- Solo party (Host only, custom city): each vote advances immediately, and **Done — pick now** then **Yes, pick one** locks the most recent like.

## 6. Propose and vote on a date

1. Guest proposes a date and time. It appears for both members.
2. Host proposes a second date.
3. Both mark the first date available; Guest marks the second unavailable. The first date is listed first with 2 of 2 votes.

## 7. Lock the date

1. Guest: there is no working lock action (only the host can lock).
2. Host: lock the first date. Both see the Calendar Confirmation screen with the venue, the date and the time.
3. Host: try to delete the locked date. It refuses with "This date is locked in, so it can't be deleted."

## 8. Calendar export

1. Host (Google connected): the event is already on Host's Google Calendar after the lock, with both emails as guests, the venue as the location, and a 2-hour slot.
2. Host: **Add to Google Calendar** shows "Added to Google Calendar". Each tap adds another copy of the event, so delete the extra one afterwards.
3. Guest (not connected): **Add to Google Calendar** shows "Almost there" and opens the Google connect page instead of adding anything.
4. Download the `.ics` file and open it in a calendar app. The title is "LinkdUp: <party name>", the time matches, and commas in the address show normally.

## 9. Failure states

1. Turn on airplane mode (or block the API in devtools) and reload Home, Friends, the lobby and Swipe. Write down what each shows. Known issue: they show their empty state or stay on "Loading..." instead of an error (see the skipped `BUG:` tests).
2. Signed out, open a party link directly. You are sent to sign in, not shown party data.

## 10. Demo mode

Only when demo mode is set up (see "Demo mode" in `docs/DEPLOYMENT.md`). Use a private window that is signed out.

1. Login and the last Onboarding slide show **Try the demo** with "Look around with sample data. No sign up needed." Tap it. You land on Home as Demo Guest without typing anything.
2. A slim banner at the top says "Demo mode, read only. Sign up to create your own parties." on every screen.
3. Home lists Demo: Friday Trivia Night (waiting), Demo: Saturday Brunch (swiping) and Demo: Rooftop Hangout (locked). Venue photos and avatars load, and the browser devtools Network tab shows no request to googleapis.com.
4. Open Trivia Night. The lobby map shows the crew. Open Saturday Brunch. Swipe shows card 3 of 6 with the Like and Skip buttons disabled. Dragging a card snaps it back and shows the demo dialog.
5. Open Rooftop Hangout. The Link and the locked date show.
6. Discover shows the demo venues and says "Using: Chosen city". It does not ask for your location. Feed shows the demo posts, and the like buttons are disabled.
7. Try to create a party, follow someone and edit your profile. Each shows the "Demo mode, read only" dialog with **Not now** and **Sign up**, never a raw error. **Not now** closes it.
8. Tap **Sign up** in the banner. You are signed out and back on Onboarding. In a second window that is still in the demo, the demo keeps working.

## Results

| Step | Pass | Notes |
| --- | --- | --- |
| 1 Sign in | | |
| 2 Create and join | | |
| 3 Location | | |
| 4 Start | | |
| 5 Link | | |
| 6 Dates | | |
| 7 Lock | | |
| 8 Calendar | | |
| 9 Failures | | |
| 10 Demo mode | | |
