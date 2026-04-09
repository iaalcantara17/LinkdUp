# LinkdUp — Final Presentation Script (May 7, 2026)

This script is structured around the NJIT Capstone MDDE framework (Manage, Divide, Design, Develop, Evaluate) and the judges' rubric. Total run time: ~10 minutes including the live demo.

**Critical:** the rubric weights collaboration at 15 points, almost as much as the implementation grade (30). Every team member needs a speaking part. Do not let the demo become a one-person show even though Israel built it. Rehearse this together on May 5.

---

## Section 0 — Hook (30 seconds, opener — Luis)

> "We're going to ask the room a question. Raise your hand if you've ever been in a group chat trying to plan a hangout that died because nobody could agree on where to meet. *(pause for hands)* Yeah. Every single one of us has lived this. We built LinkdUp to fix it."

Cue the title slide with the LINKDUP wordmark and tagline.

---

## Section 1 — Manage (1 minute — Luis)

> "I'll cover the Manage phase. Our team is five people. Luis, project manager. Israel, tech lead and backend. Joshua, frontend QA. Nekhi, integration and testing. Yash, UX and business logic.
>
> We started February 17 with a four-month window and a final deadline of May 7. We organized using a sprint-based Scrum approach with weekly Wednesday standups. We used a work breakdown structure to split the project into five MDDE phases, and a Gantt chart to track the four core sprints.
>
> Our biggest risks were Google Maps API costs, real-time sync race conditions, and integration complexity. We mitigated cost by caching Places results per party — one API call per party, not one per swiper. We mitigated sync issues by making the database the source of truth and having clients re-pull on each push instead of trusting client state."

Show the WBS and Gantt diagrams on slide.

---

## Section 2 — Divide (1 minute — Yash)

> "I'll cover the Divide phase, which is where we identified our stakeholders, locked our scope, and figured out exactly what we were and weren't building.
>
> Our stakeholder panel includes our capstone instructor as the buyer-approver, two end-user volunteers, and our team as the admin-operators. Our primary users are college students and recent alumni in friend groups of three to eight people who live in different cities.
>
> We used a Feature Driven Diagram to break the app down into five top-level features: authentication and profile, location, party system, swipe and match, and date plus calendar export.
>
> Our biggest scoping decision was actually a cut. We had a richer Figma design that included TikTok-style video venue cards, in-app reservations, and a personalization engine. We deliberately moved all of those into a documented Phase 2 backlog so we could ship a working MVP in the time we had. Knowing what to cut is more important than knowing what to build."

Show the FDD and the in-scope/out-of-scope table from the scope document.

---

## Section 3 — Design (1.5 minutes — Joshua)

> "I'll cover Design. Once we knew what we were building, we sketched the user flow end-to-end and built it in Figma. The flow has nine screens: splash, onboarding, sign up, location permission, home, party lobby, swipe, match, and date setup.
>
> Our visual language is dark mode with glassmorphism and a deep purple to electric blue gradient. Think Tinder meets Google Maps meets BeReal. We chose this because the app is fundamentally a social discovery experience, and we wanted it to feel energetic, not corporate.
>
> On the technical side, we designed a system architecture with three layers. The mobile client is React Native via Expo. The backend is a Node.js Express API on Railway. The data layer is Supabase Postgres with eight tables, plus three Google Cloud APIs for venue search, geocoding, and calendar export.
>
> Our database has an interesting design choice. Venue candidates are stored per-party, not globally. That means each party gets its own personalized set of locations rather than sharing a global cache, which keeps the swipe experience fair and lets us delete cleanly when a party is done."

Show the system architecture and ERD diagrams.

---

## Section 4 — Develop and Live Demo (4 minutes — Israel)

> "I'll cover Develop and run the live demo. The implementation happened across roughly four weeks of focused sprint work, with the backend coming first in week one, the mobile screens in weeks two and three, and integration plus polish in week four.
>
> The backend exposes about twenty-five REST endpoints across eight route modules: auth, schools, user, party, vote, match, dates, and calendar. The interesting service is the match engine. Our threshold is strict majority: a venue wins when its yes-vote count is greater than half the total party members, and the first venue to cross that line locks in the match. We use optimistic locking on the party row so two simultaneous yes votes can't double-fire the match.
>
> For real-time sync, we use Supabase Realtime instead of running our own Socket.io layer. The mobile clients subscribe directly to row changes on the votes table for the active party. This was a deliberate scope-reduction choice — we got production-grade realtime for free.
>
> Now let me show it. *(switch to the phone screen mirrored to the projector)*
>
> 1. Open the app, tap Get Started, sign up. (sign up flow on screen 1)
> 2. Switch to the second device, sign in as user 2. (now on screen 2)
> 3. On device 1, create a party. The 6-character code appears.
> 4. On device 2, join with the code. Both devices now see each other in the lobby in real time.
> 5. On device 1, tap Start Swiping. The app calls the midpoint API, hits Google Places, returns 15 real venues around the midpoint of our two locations, and both devices flip to the swipe screen.
> 6. We swipe right on the same venue on both devices. Watch the crew HUD avatars update live. As soon as the second yes vote registers, the match fires.
> 7. The match screen shows the venue with the photo, address, rating, and a Get Directions button.
> 8. Tap Set the Date. The date picker grid appears. We tap a few slots, lock it in.
> 9. The calendar confirmation screen offers to add to Google Calendar. Tap it. Boom, the event lands in my actual Google Calendar — *(switch to Calendar app to prove it)*.
>
> That's the full flow, end to end, from cold start to a real calendar event in under two minutes."

This section is the highest-leverage moment of the entire presentation. Implementation is worth 30 points and most of those points hinge on whether the live demo actually works. Run this exact sequence at least three times in rehearsal on May 5 and May 6. Have a backup screen recording on standby in case the network fails.

---

## Section 5 — Evaluate (1 minute — Nekhi)

> "I'll cover Evaluate. We wrote a test plan with twenty test cases covering authentication, location, party flow, vote and match, date selection, and calendar export. Out of the twenty, we passed (fill in the actual number on demo day, target 18 of 20).
>
> The test cases that gave us the most trouble were the real-time vote sync — we had to re-architect the client to re-pull from the database on every push instead of trusting the broadcast payload — and the Google Calendar OAuth flow, which required adding test users to the Google Cloud consent screen for development.
>
> We also did informal user acceptance testing with two NJIT classmates, and the consistent feedback was that the swipe-to-match flow was faster than how they normally plan with their friends, which is exactly the success criterion we set in our scope document."

Show the test plan results table on slide.

---

## Section 6 — Wrap (30 seconds — Luis)

> "LinkdUp is a working mobile app that takes a problem every one of us has lived through — group chat planning paralysis — and turns it into a five-minute swipe game with a real, locked-in calendar event at the end. We have a deployed backend, a live demo on real phones, and twenty test cases passing. Thanks for watching. Happy to answer questions."

---

## Speaking time per person (rubric: 15 pts collaboration, 5 pts personal skills)

| Member | Section | Time |
|---|---|---|
| Luis | Hook + Manage + Wrap | ~2 min |
| Yash | Divide | ~1 min |
| Joshua | Design | ~1.5 min |
| Israel | Develop + live demo | ~4 min |
| Nekhi | Evaluate | ~1 min |
| **Total** | | **~10 min** |

Israel speaks more because he built it and is running the live demo, but every member has at least 1 minute of actual speaking time. Judges score the collaboration grade by visibly counting who talks; a member who only says "thanks" loses points.

---

## Demo day checklist

**Day before (May 6):**
- [ ] Charge two phones to 100%
- [ ] Confirm both phones can scan the Expo Go QR for the production build
- [ ] Test the full flow on the venue's WiFi or a hotspot
- [ ] Record a 90-second backup demo video and put it on the laptop desktop
- [ ] Print the rubric and the test plan results
- [ ] Confirm all team members have the script and have rehearsed once

**Demo day (May 7):**
- [ ] Arrive 30 minutes early
- [ ] Phones in airplane mode → off → reconnect to confirm fresh network
- [ ] Open the app, sign in on both phones, leave on the home screen
- [ ] Have the backup recording open in a hidden tab
- [ ] Have the Google Calendar of one phone visible in a second tab to prove the event lands

**If the demo fails mid-run:**
- Stay calm. Say: "Looks like we're hitting a network issue, let me show you the recorded version while my teammate retries." Switch to backup video.
- Do NOT try to debug live. Judges grade composure as part of personal skills.
