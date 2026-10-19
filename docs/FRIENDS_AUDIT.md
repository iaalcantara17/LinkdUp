# Friends Audit: one follow model

**Status:** Proposed. Nothing in this doc has been built, created or run.
**Date:** 2026-10-19
**Branch:** `friends-audit` (from `main` at `2bb2bd1`)

## Goal

Replace the separate friends system with one model:

- Following is a one-tap action. There are no requests.
- Two users who follow each other are friends.
- A one-way follow is just a follower or a following.
- Unfriend means unfollow.
- No private accounts.

## TL;DR

- "Friends" is worked out from `user_follows` by one shared server helper, `friendIds(userId)`. There is no new table and no view.
- The **Requests** tab becomes **Follow back**: people who follow you that you don't follow. Home's pending badge counts these instead.
- Migration: every `accepted` friendship becomes two follows, every `pending` request becomes one follow (requester to addressee). The `friendships` table is renamed, not dropped, so it can be rolled back.
- **The biggest risk is demo hiding.** `hiddenDemoUserIds` reads `friendships` and runs on the feed, search, follow lists and Discover. If the table goes away before the code changes, those routes return 500. If the code changes but the follows don't line up, demo friends show up for real users.
- **Bug found while auditing:** Home's Online Alumni bubbles set `profileUserId` ([HomeScreen.tsx:389](../mobile/src/screens/HomeScreen.tsx#L389)), but Home never renders `UserProfileSheet`, so tapping a bubble does nothing.

---

## 1. Inventory

### 1a. Schema and RLS

| File:line | What |
|---|---|
| [013_friends.sql:4-13](../server/src/db/migrations/013_friends.sql#L4-L13) | `friendships(id, requester_id, addressee_id, status in pending/accepted/blocked, requested_at, responded_at)`, with `UNIQUE(requester_id, addressee_id)`. The reverse pair is **not** unique, so A→B and B→A rows could both exist. |
| [013_friends.sql:15-17](../server/src/db/migrations/013_friends.sql#L15-L17) | Indexes on requester, addressee, status. |
| [013_friends.sql:19-33](../server/src/db/migrations/013_friends.sql#L19-L33) | RLS on, plus an allow-all `friendships_all_backend` policy, which 032 later drops. |
| [021_feed_interactions.sql:25-31](../server/src/db/migrations/021_feed_interactions.sql#L25-L31) | `user_follows(follower_id, followed_id, followed_at)`, PK on the pair, no self-follow. There is no index that starts with `followed_id`; the PK covers lookups by `follower_id` only. |
| [021_feed_interactions.sql:36,40](../server/src/db/migrations/021_feed_interactions.sql#L36-L40) | RLS on, plus an allow-all policy, which 032 later drops. |
| [027_user_blocks.sql:1-11](../server/src/db/migrations/027_user_blocks.sql#L1-L11) | `user_blocks(blocker_id, blocked_id)`, with an index on `blocked_id`. |
| [032_lock_down_rls.sql:13,19,21](../server/src/db/migrations/032_lock_down_rls.sql#L13-L21) | Turns RLS on for `friendships`, `user_follows` and `user_blocks`. |
| [032_lock_down_rls.sql:27-29](../server/src/db/migrations/032_lock_down_rls.sql#L27-L29) | Drops the allow-all policies on all three tables. They now have **no policies**, so only the service role (`supabaseAdmin`) can read or write them. Clients never touch them directly. |

### 1b. Server routes and middleware

**`friendships` (to replace):**

| File:line | Route / fn | What it does |
|---|---|---|
| [index.ts:19,61](../server/src/index.ts#L19) | mount | `/api/friends` goes to `routes/friends.ts`. |
| [friends.ts:21-47](../server/src/routes/friends.ts#L21-L47) | `GET /api/friends` | Lists accepted friendships with `is_online` (`last_seen_at` within 5 min, line 41-44). This feeds Online Alumni and the lobby invite list. No block filter, because blocking deletes the row. |
| [friends.ts:49-74](../server/src/routes/friends.ts#L49-L74) | `GET /pending` | Incoming pending requests as `{friendship_id, requested_at, user}`. |
| [friends.ts:76-101](../server/src/routes/friends.ts#L76-L101) | `GET /outgoing` | Outgoing pending requests. **Nothing in mobile calls it** (`api.ts:340` defines it and nothing uses it). |
| [friends.ts:103-136](../server/src/routes/friends.ts#L103-L136) | `POST /request` | Checks blocks (110-115), returns 409 if any row exists in either direction (117-125), inserts a pending row. |
| [friends.ts:138-159](../server/src/routes/friends.ts#L138-L159) | `POST /:id/accept` | The addressee sets the row to accepted. |
| [friends.ts:161-177](../server/src/routes/friends.ts#L161-L177) | `POST /:id/decline` | The addressee deletes the row. |
| [friends.ts:179-193](../server/src/routes/friends.ts#L179-L193) | `DELETE /:user_id` | Unfriend. Deletes the row in both directions. Follows are untouched. |
| [friends.ts:195-247](../server/src/routes/friends.ts#L195-L247) | `GET /search` | Searches users by name, email or @username (input cleaned at 203), applies the demo hide (217-218), and attaches `friendship {status, direction}` (223-245). |
| [friends.ts:249-271](../server/src/routes/friends.ts#L249-L271) | `GET /status/:user_id` | Returns `none`, `self`, `pending+direction` or `accepted` for one pair. Used by the profile sheet. |
| [demo.ts:26-38](../server/src/middleware/demo.ts#L26-L38) | `hiddenDemoUserIds` | **Demo hiding.** The hidden set is the demo user plus every accepted friend of the demo user. It throws 500 if the query fails. |
| [discover.ts:114-122](../server/src/routes/discover.ts#L114-L122) | `GET /api/discover/parties` | Builds `friendIds` from accepted friendships. |
| [discover.ts:182-200](../server/src/routes/discover.ts#L182-L200) | same | Sets `friends_inside` when the host or any member is a friend, and sorts those parties first. |
| [discover.ts:137-138](../server/src/routes/discover.ts#L137-L138) | same | Demo hide on the party host. |
| [user.ts:724-725](../server/src/routes/user.ts#L724-L725) | `POST /api/user/:id/block` | Deletes friendships in both directions. |

**Users of `hiddenDemoUserIds`.** All of these break if it throws:

- [feed.ts:26](../server/src/routes/feed.ts#L26): feed
- [friends.ts:217](../server/src/routes/friends.ts#L217): search
- [user.ts:644](../server/src/routes/user.ts#L644) and [user.ts:686](../server/src/routes/user.ts#L686): followers and following lists
- [discover.ts:137](../server/src/routes/discover.ts#L137): Discover parties

**`user_follows` (stays, becomes the only source):**

| File:line | Route | What it does |
|---|---|---|
| [user.ts:30-37](../server/src/routes/user.ts#L30-L37) | `isEitherBlocked` | Block check in both directions. |
| [user.ts:544-558](../server/src/routes/user.ts#L544-L558) | `DELETE /me/followers/:userId` | Remove a follower. |
| [user.ts:591-611](../server/src/routes/user.ts#L591-L611) | `GET /:id/public` | Follower and following counts plus `is_blocked_by_me`. Returns 403 if the target blocked me (565-572). |
| [user.ts:615-624](../server/src/routes/user.ts#L615-L624) | `GET /:id/follow-counts` | Counts. |
| [user.ts:626-666](../server/src/routes/user.ts#L626-L666) | `GET /:id/followers` | Paged (limit up to 100), demo hide, plus `follows_back` (*I* follow this person) and `is_blocked`. |
| [user.ts:668-708](../server/src/routes/user.ts#L668-L708) | `GET /:id/following` | Same shape. |
| [user.ts:721-723](../server/src/routes/user.ts#L721-L723) | `POST /:id/block` | Deletes follows in both directions. |
| [user.ts:745-761](../server/src/routes/user.ts#L745-L761) | `POST /:id/follow` | Rejects self (749) and blocked pairs (751-752), then upserts. |
| [user.ts:763-774](../server/src/routes/user.ts#L763-L774) | `DELETE /:id/follow` | Unfollow. |
| [feed.ts:62-70,84,106](../server/src/routes/feed.ts#L62-L70) | `GET /feed` | Only the `follows_creator` flag. |

**Feed visibility does not depend on friends or follows.** The feed is global: all posts minus blocked people and hidden demo users ([feed.ts:22-42](../server/src/routes/feed.ts#L22-L42)). Follows only drive the flag. Nothing changes there except the demo hide source.

**Party invites are not a server feature.** There is no invite endpoint. People join with the party code.

### 1c. Demo seed

| File:line | What |
|---|---|
| [demo_seed.sql:50-53](../server/src/db/seed/demo_seed.sql#L50-L53) | Five accepted friendships: me→maya, theo, priya, jordan, sam. |
| [demo_seed.sql:55-58](../server/src/db/seed/demo_seed.sql#L55-L58) | Follows: me→maya, me→theo, maya→me, priya→me, jordan→me. **Under the new rule only Maya is mutual.** Theo, Priya, Jordan and Sam would stop being friends, and stop being hidden if hiding uses mutuals. |
| [DEPLOYMENT.md:108](DEPLOYMENT.md#L108) | Says the server hides "the demo user and its accepted friends". The wording needs updating. |

### 1d. Mobile

| File:line | What |
|---|---|
| [api.ts:265-287](../mobile/src/services/api.ts#L265-L287) | `followUser`, `unfollowUser`, `getFollowCounts`, `getFollowers`, `getFollowing`, `removeFollower`. These stay. |
| [api.ts:338-346](../mobile/src/services/api.ts#L338-L346) | `getFriends`, `getPendingRequests`, `getOutgoingRequests`, `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `removeFriend`, `searchFriends`, `getFriendStatus`. |
| [FriendsScreen.tsx:21-25](../mobile/src/screens/FriendsScreen.tsx#L21-L25) | Help text mentions accept/decline and "send a request". |
| [FriendsScreen.tsx:27,174-183](../mobile/src/screens/FriendsScreen.tsx#L27) | Tabs: Friends, `Requests (n)`, Search. |
| [FriendsScreen.tsx:60-93](../mobile/src/screens/FriendsScreen.tsx#L60-L93) | Loads `getFriends` and `getPendingRequests`. |
| [FriendsScreen.tsx:108-121](../mobile/src/screens/FriendsScreen.tsx#L108-L121) | Accept and decline handlers, keyed by `friendship_id`. |
| [FriendsScreen.tsx:123-135](../mobile/src/screens/FriendsScreen.tsx#L123-L135) | Remove friend (`removeFriend`). |
| [FriendsScreen.tsx:137-143](../mobile/src/screens/FriendsScreen.tsx#L137-L143) | Block from a friend row. |
| [FriendsScreen.tsx:145-155](../mobile/src/screens/FriendsScreen.tsx#L145-L155) | Send request from search. |
| [FriendsScreen.tsx:205-222](../mobile/src/screens/FriendsScreen.tsx#L205-L222) | Friend rows: `ListRow` with Remove and Block buttons. **The row itself is not tappable.** |
| [FriendsScreen.tsx:242-260](../mobile/src/screens/FriendsScreen.tsx#L242-L260) | Request rows with Decline and Accept. |
| [FriendsScreen.tsx:281-307](../mobile/src/screens/FriendsScreen.tsx#L281-L307) | Search rows: "Friends ✓", "Request sent", or a UserPlus button. |
| [UserProfileSheet.tsx:40,51-53](../mobile/src/components/UserProfileSheet.tsx#L40) | `FriendUi` state: `none`, `pending_out`, `pending_in`, `accepted`. |
| [UserProfileSheet.tsx:90-102](../mobile/src/components/UserProfileSheet.tsx#L90-L102) | Calls `getFriendStatus` after `api.me()`. |
| [UserProfileSheet.tsx:126-132](../mobile/src/components/UserProfileSheet.tsx#L126-L132) | Kebab menu with Block and Report. Report opens `ReportDialog` (316-318). |
| [UserProfileSheet.tsx:208-227](../mobile/src/components/UserProfileSheet.tsx#L208-L227) | Follower and following counts, which open FollowList. |
| [UserProfileSheet.tsx:254-310](../mobile/src/components/UserProfileSheet.tsx#L254-L310) | Add friend, Request pending, Accept request, Friends. **There is no Follow button on the sheet today.** |
| [HomeScreen.tsx:257-283](../mobile/src/screens/HomeScreen.tsx#L257-L283) | Loads `getPendingRequests` for the badge count and `getFriends` for Online Alumni (`is_online`, first 5). |
| [HomeScreen.tsx:375-394](../mobile/src/screens/HomeScreen.tsx#L375-L394) | Online Alumni bubbles. `onPress` sets `profileUserId` (389). **There is no `<UserProfileSheet>` in HomeScreen, so the tap is a dead end.** |
| [HomeScreen.tsx:396-425](../mobile/src/screens/HomeScreen.tsx#L396-L425) | Friends card: "n pending requests" or "Find and add friends", plus a badge. |
| [HomeScreen.tsx:33,469-472](../mobile/src/screens/HomeScreen.tsx#L33) | Help and tour copy about requesting and accepting. |
| [PartyLobbyScreen.tsx:49,72](../mobile/src/screens/PartyLobbyScreen.tsx#L49) | Lobby invite tab loads `getFriends` once, kept out of the poll loop. |
| [PartyLobbyScreen.tsx:179-188](../mobile/src/screens/PartyLobbyScreen.tsx#L179-L188) | "Your friends" list, display only ("Share the code above"). The empty copy points to Home → Friends. |
| [DiscoverScreen.tsx:84,360-363](../mobile/src/screens/DiscoverScreen.tsx#L84) | "Friends inside" badge from the `friends_inside` field. |
| [FollowListScreen.tsx:116-187](../mobile/src/screens/FollowListScreen.tsx#L116-L187) | Follow, Following and Unfollow pills. Long press shows View profile, Block, Remove follower. The profile sheet is mounted at 265-269. |
| [MainStack.tsx:19,36,93](../mobile/src/navigation/MainStack.tsx#L19) and [titles.ts:9](../mobile/src/navigation/titles.ts#L9) | `Friends` route. Unchanged. |

### 1e. Tests that pin the current behavior

| File:line | Pins |
|---|---|
| [server/test/friends.test.ts:61-79](../server/test/friends.test.ts#L61-L79) | Unfriend, status and block reject non-uuid ids. They assert that `friendships` is not touched. |
| [server/test/interactions.test.ts:53-63](../server/test/interactions.test.ts#L53-L63) | Unfriend deletes `friendships` in both directions. **This must change.** |
| [server/test/demoHidden.test.ts:21,85-138](../server/test/demoHidden.test.ts#L21) | The demo fixture uses a `friendships` row. The mock `rows()` only understands `eq`, `neq` and `in` ([43-54](../server/test/demoHidden.test.ts#L43-L54)). |
| [mobile/screens-test/screens.test.js:139-179](../mobile/screens-test/screens.test.js#L139-L179) | Friends tabs, "Requests", "No pending requests", Remove and Block labels. |
| [mobile/screens-test/screens.test.js:509](../mobile/screens-test/screens.test.js#L509) | Profile sheet mock of `getFriendStatus`. |
| [mobile/test/friendsBlock.test.mjs:7-36](../mobile/test/friendsBlock.test.mjs#L7-L36) | Block and Report placement. Report must **not** appear in FriendsScreen (line 34-35). |
| [mobile/test/listView.test.mjs:24,30](../mobile/test/listView.test.mjs#L24) | `listView(pending, loadingPending)` regex. |
| [mobile/test/pollWhileVisible.test.mjs:69-74](../mobile/test/pollWhileVisible.test.mjs#L69-L74) | The lobby keeps `getFriends` out of the poll. |
| [mobile/shots/shots.mjs:66,78](../mobile/shots/shots.mjs#L66) | Screenshot stubs for `/api/friends` and `/pending`. |

---

## 2. Target design (ADR-001)

### Context

There are two social graphs. `friendships` uses a request and accept flow. `user_follows` uses one-tap follows. They drift apart: the seed has five friends but only one mutual follow. Block has to clean up both. Demo hiding depends on the graph that's being removed.

### Decision

`user_follows` is the only graph. A friend is a mutual follow, worked out by a shared server helper:

```ts
// server/src/services/friends.ts
export async function friendIds(userId: string): Promise<Set<string>>
```

The helper runs two indexed queries: who I follow (PK prefix), then which of those follow me back (`.eq('followed_id', me).in('follower_id', following)`). It uses only `eq` and `in`, so the existing supabase mock handles it.

### Options considered

| | A: helper, two queries (**chosen**) | B: SQL view `friends` | C: keep `friendships` as a cache of mutuals |
|---|---|---|---|
| Migration | none for the logic | new view | trigger to keep both in sync |
| RLS risk | none (service role) | **high**: a plain view in `public` is exposed through PostgREST and skips table RLS unless created `WITH (security_invoker = true)` with grants revoked from `anon` and `authenticated` | same as today |
| Code | ~15 lines | ~10 SQL lines plus a grants test | trigger and backfill |
| Ceiling | the `in(...)` list grows with following count, and URLs get long past roughly 1-2k ids | none | none |

Upgrade path for A: if anyone follows thousands of people, move the same two-hop query into a `security invoker` RPC. The callers don't change.

### API changes

| Route | Today | After |
|---|---|---|
| `GET /api/friends` | accepted friendships | `friendIds(me)`, joined to users, same shape including `is_online` |
| `GET /api/friends/follow-back` | none | **new.** Followers of me that I don't follow, minus blocked people and hidden demo users, newest first, `limit` up to 100. Shape: `[{...user, followed_at}]` |
| `GET /api/friends/pending` | incoming requests | **removed** in slice 3; Home and the Friends screen switch to `follow-back` |
| `GET /api/friends/outgoing` | unused | **removed** |
| `POST /api/friends/request` | create pending | **removed** in slice 3; bridges to a follow in slice 2 (below) |
| `POST /api/friends/:id/accept` | accept | **removed** in slice 3; bridges to a follow back in slice 2 |
| `POST /api/friends/:id/decline` | delete | **removed.** To get rid of an unwanted follower, use the existing `DELETE /api/user/me/followers/:id` |
| `DELETE /api/friends/:user_id` | delete friendship both ways | **removed.** Unfriend means `DELETE /api/user/:id/follow` (only my follow) |
| `GET /api/friends/status/:user_id` | friendship status | **removed.** Replaced by fields on the public profile |
| `GET /api/friends/search` | `friendship: {status, direction}` | `i_follow: boolean, follows_me: boolean` |
| `GET /api/user/:id/public` | counts, `is_blocked_by_me` | adds `i_follow` and `follows_me` from one `user_follows` query on the pair |
| `GET /api/discover/parties` | `friends_inside` from friendships | `friends_inside` from `friendIds(me)` |
| `POST /api/user/:id/block` | deletes follows and friendships | deletes follows only (lines 724-725 go away) |

`/api/friends` stays mounted as the "friends view" namespace, so mobile route names stay stable. Moving search to `/api/user/search` is cosmetic and skipped.

### Requests tab becomes Follow back

- The tab is labeled `Follow back (n)`. Rows come from `GET /api/friends/follow-back`, with one primary button, **Follow back**, which calls `followUser`. On success the row moves to Friends.
- Empty state: "No one to follow back".
- There's no Decline. A follower who isn't followed back stays a follower, which is fine with no private accounts. Remove follower is still available from FollowList.
- Home badge: the count of `follow-back` results, still shown as `9+`. Subtitle: "n people to follow back".

### Profile sheet button (one control, four states)

| `i_follow` | `follows_me` | Button | Tap |
|---|---|---|---|
| no | no | **Follow** | `followUser` |
| no | yes | **Follow back** | `followUser`, then shows Friends |
| yes | no | **Following** | confirm "Unfollow?", then `unfollowUser` |
| yes | yes | **Friends ✓** | confirm "Unfriend? You'll stop following them.", then `unfollowUser` |

The kebab menu (Block, Report) is unchanged.

### Block

There's no new block behavior. Block already deletes follows in both directions ([user.ts:721-723](../server/src/routes/user.ts#L721-L723)), and follow already refuses blocked pairs ([user.ts:751-752](../server/src/routes/user.ts#L751-L752)). So a blocked pair can never be mutual, which means friends and Online Alumni are safe without an extra filter. `follow-back` still filters `user_blocks` as a guard against stale rows. Unblock does **not** restore follows (same as today).

### Demo hiding

The hidden set becomes `{demo} ∪ {followed_id where follower_id = demo}`, the people the demo account follows. This is intentionally *not* mutuals:

- The demo account is read-only ([demo.ts:40-47](../server/src/middleware/demo.ts#L40-L47)), so its outgoing follows are exactly what the seed wrote. A real user can't get hidden by following the demo account.
- It still hides a demo friend even if that friend's return follow is missing.

The seed changes to make all five pairs mutual. Replace [demo_seed.sql:50-58](../server/src/db/seed/demo_seed.sql#L50-L58) with follows in both directions for maya, theo, priya, jordan and sam, and drop the `friendships` insert. This keeps the demo at five friends, the same as today.

### RLS

No policy changes are needed. `user_follows` and `user_blocks` stay RLS-on with no policies, so they're service-role only (032). The renamed `friendships_archive` keeps RLS on with no policies. If option B (a view) is ever chosen, it must be `security_invoker` with `revoke all ... from anon, authenticated`.

---

## 3. Migration plan (not created, not run)

The plan has two steps so that old code and new code both keep working at every point.

### Step A: `037_follows_from_friendships.sql` (backfill, before the slice 2 deploy)

Additive only. The old code keeps working.

```sql
begin;
create table if not exists public.follow_backfill_037 (
    follower_id uuid not null, followed_id uuid not null, followed_at timestamptz not null,
    primary key (follower_id, followed_id));
alter table public.follow_backfill_037 enable row level security;

insert into public.follow_backfill_037 (follower_id, followed_id, followed_at)
select x.follower_id, x.followed_id, min(x.at) from (
    select requester_id as follower_id, addressee_id as followed_id, coalesce(responded_at, requested_at) as at
      from public.friendships where status = 'accepted'
    union all
    select addressee_id, requester_id, coalesce(responded_at, requested_at)
      from public.friendships where status = 'accepted'
    union all
    select requester_id, addressee_id, requested_at
      from public.friendships where status = 'pending'
) x
where not exists (select 1 from public.user_follows uf
                  where uf.follower_id = x.follower_id and uf.followed_id = x.followed_id)
  and not exists (select 1 from public.user_blocks b
                  where (b.blocker_id = x.follower_id and b.blocked_id = x.followed_id)
                     or (b.blocker_id = x.followed_id and b.blocked_id = x.follower_id))
group by x.follower_id, x.followed_id
on conflict do nothing;

insert into public.user_follows (follower_id, followed_id, followed_at)
select follower_id, followed_id, followed_at from public.follow_backfill_037
on conflict (follower_id, followed_id) do nothing;
commit;
```

What this does:

- **Accepted** friendships become both directions, so everyone who was a friend stays a friend.
- **Pending** requests become one follow from the requester to the addressee. A request already meant "I want to connect", and the addressee now sees that person in Follow back, which is the same thing the Requests tab showed them. Nobody's request is lost.
- **`blocked` status:** no code ever writes it (block deletes the row instead). It's ignored here, and the pre-flight check confirms the count is 0.
- **Blocked pairs** are skipped. Accepted rows across a block shouldn't exist, but this guards against them.
- `follow_backfill_037` records exactly which rows were added, so rollback can remove only those.
- The step is idempotent, so it's safe to run again.

### Pre-flight (read-only, run in the SQL editor first)

```sql
select status, count(*) from public.friendships group by status;
select count(*) as reverse_dupes from public.friendships a
  join public.friendships b on a.requester_id = b.addressee_id and a.addressee_id = b.requester_id;
```

### Verify after step A (expect 0)

```sql
select count(*) from public.friendships f
where f.status = 'accepted'
  and not exists (select 1 from public.user_blocks b where (b.blocker_id, b.blocked_id) in ((f.requester_id, f.addressee_id), (f.addressee_id, f.requester_id)))
  and not (exists (select 1 from public.user_follows where follower_id = f.requester_id and followed_id = f.addressee_id)
       and exists (select 1 from public.user_follows where follower_id = f.addressee_id and followed_id = f.requester_id));
```

### Step B: `038_archive_friendships.sql` (after slice 3 is deployed)

1. Re-run the step A insert. This picks up anything the old app wrote between A and the deploy.
2. `alter table public.friendships rename to friendships_archive;`
3. Drop `follow_backfill_037` and `friendships_archive` in a later migration, after about 2 weeks with no rollback.

### Rollback

- **After A only:** nothing to undo for users, since the old code ignores the new follows. For an exact undo:
  ```sql
  delete from user_follows uf using follow_backfill_037 b
  where uf.follower_id = b.follower_id and uf.followed_id = b.followed_id;
  ```
- **After B:** first redeploy the previous server, then `alter table public.friendships_archive rename to friendships;`. Friendships accepted *after* B exist only as follows. To recreate them, insert an accepted row for each mutual pair that has no friendship row.

### What could break

| Risk | When | Guard |
|---|---|---|
| `hiddenDemoUserIds` throws and the feed, search, follow lists and Discover all return 500 | the table is renamed while old code is still live | Step B runs **only after** the new server is live. There's a test that demo hiding makes no `friendships` call. |
| Demo friends appear for real users | new code is live but the demo account's follows are incomplete | Hide by the demo account's *outgoing* follows. Step A backfills the prod demo friendships into both directions. Update the seed. |
| The friend set **grows**: people who only mutually followed through the feed become friends, and show up in Online Alumni, the lobby list and the Discover "Friends inside" badge | the slice 2 deploy | This is what the new rule says, but call it out. Count it with `select count(*) from user_follows a join user_follows b on a.follower_id=b.followed_id and a.followed_id=b.follower_id` before deploying. |
| Old native builds call `/request`, `/accept`, `/status` and get 404 | slice 3 | Slice 2 bridges `/request` and `/accept`. The removals land in slice 3, after clients update. |
| Follow-back list is long for popular users | always | Paged at `limit` 100, and the badge caps at `9+`. |
| The `in(...)` list gets long in `friendIds` | following count over roughly 1-2k | Move to an RPC (see the ADR above). |
| No index starting with `followed_id` | follower and follow-back queries | Optional `create index on user_follows(followed_id, follower_id)` in step A. It's cheap and additive. |

---

## 4. Tappable Friends rows that open the profile sheet

Today Friends rows are a plain `View` ([kit.tsx:168-180](../mobile/src/components/kit.tsx#L168-L180)). The profile sheet already has the follow control, Block and Report ([UserProfileSheet.tsx:126-132](../mobile/src/components/UserProfileSheet.tsx#L126-L132)). FollowList already mounts it ([FollowListScreen.tsx:265-269](../mobile/src/screens/FollowListScreen.tsx#L265-L269)).

Plan:

1. `ListRow` gets an optional `onPress?: () => void` and `pressLabel?: string`. When `onPress` is set, `left` plus the title and subtitle render inside a kit `Tap` with `accessibilityLabel={pressLabel ?? title}`. `right` stays a **sibling**, not a child, so the IconButtons aren't nested inside another button (on web that would be a button inside a button, which is invalid and confuses screen readers).
2. In FriendsScreen, add `const [profileUserId, setProfileUserId] = useState<string | null>(null)`. Rows on all three tabs (Friends, Follow back, Search) call `onPress={() => setProfileUserId(u.id)}` with `pressLabel={`Open ${name}'s profile`}`. Mount `<UserProfileSheet userId={profileUserId} visible={!!profileUserId} onClose={...} />` once, and reload the friends and follow-back lists in `onClose` so follow changes made in the sheet show up.
3. Keep the row's Block button. **Do not add Report to the rows.** Report stays in the sheet's menu, which [friendsBlock.test.mjs:30-36](../mobile/test/friendsBlock.test.mjs#L30-L36) enforces.
4. Fix Home: mount `<UserProfileSheet>` for `profileUserId` ([HomeScreen.tsx:248](../mobile/src/screens/HomeScreen.tsx#L248)), so Online Alumni bubbles actually open the profile.

Lighter alternative: skip the `ListRow` change and wrap the `Avatar` only in a `Tap`. That's a smaller diff, but the tap target is small. The plan above is the default.

---

## 5. Tests first, then three slices

All server tests use the existing `node:test` setup with `supabaseMock` (`npm test` in `server/`). Mobile uses `test:logic` (node) and `test:screens` (jest).

### Tests to write first (red before green)

**Server**

1. `friendIds` returns only mutual follows: A↔B plus A→C gives `{B}`, and nothing for a user with no follows.
2. `GET /api/friends` lists mutuals with `is_online`, leaves out one-way follows, and makes **no** `friendships` call.
3. `GET /api/friends/follow-back` lists followers I don't follow back, and leaves out mutuals, blocked people and hidden demo users.
4. `GET /api/user/:id/public` returns `i_follow` and `follows_me` correctly for all four states.
5. `GET /api/friends/search` rows carry `i_follow` and `follows_me`, and still hide demo users (rewrite of [demoHidden.test.ts:97-106](../server/test/demoHidden.test.ts#L97-L106)).
6. Demo hiding comes from the demo account's outgoing follows: a real user doesn't see a demo friend's post, and a stranger who follows the demo account is **not** hidden. Fixture change: replace the `friendships` row in [demoHidden.test.ts:21](../server/test/demoHidden.test.ts#L21) with `{follower_id: DEMO, followed_id: FRIEND}`.
7. Discover `friends_inside` is true only when a member is a mutual follow.
8. Block deletes `user_follows` in both directions and makes no `friendships` call. Update [friends.test.ts:75-80](../server/test/friends.test.ts#L75-L80).
9. Slice 3: `/request`, `/:id/accept`, `/:id/decline`, `/outgoing`, `/pending`, `/status/:id`, `DELETE /:id` all return 404. Replaces [interactions.test.ts:53-63](../server/test/interactions.test.ts#L53-L63) and [friends.test.ts:61-73](../server/test/friends.test.ts#L61-L73).

**Mobile**

10. The Friends screen shows tabs `Friends`, `Follow back`, `Search`, with no `Requests`. A Follow back row's button calls `api.followUser`.
11. Tapping a friend row (button `Open Bob Builder's profile`) opens the sheet and calls `getPublicUser('bob')`. Block is still a separate labeled button.
12. The profile sheet shows **Follow**, **Follow back**, **Following** or **Friends ✓** from `getPublicUser` flags, with no `getFriendStatus` mock.
13. Tapping a Home Online Alumni bubble opens the profile sheet. This is the regression test for the dead tap.
14. Static check (`friendsBlock.test.mjs` style): no file in `mobile/src` references `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `getFriendStatus` or `getPendingRequests`.

### Slices

| # | Slice | Contents | Risk | Effort |
|---|---|---|---|---|
| 1 | **Tappable rows and the Home sheet fix** | Section 4. Works on the current model, no server change. Tests 11 and 13. | Low: UI only | S (~half a day) |
| 2 | **Server on follows, plus step A** | `services/friends.ts` helper, `GET /api/friends`, `/follow-back`, demo hiding, Discover, block, `i_follow`/`follows_me` on public profile and search, seed update, step A migration (and the optional index). **Bridge:** `/request` also upserts a follow from me to them, and `/:id/accept` also upserts a follow from the addressee to the requester, so the current app keeps working. Tests 1-8. | **High:** demo hiding and backfill correctness | M (~1-1.5 days) |
| 3 | **Mobile switch and cleanup, plus step B** | FriendsScreen tabs and Follow back, profile sheet button states, Home badge and copy, help text, `api.ts` cleanup, delete `server/src/routes/friendRequestBridge.ts` and its mount in `server/src/index.ts`, drop the `friendship` compatibility field from status and search, update `shots.mjs` stubs, then step B rename after deploy. Tests 9, 10, 12, 14. | Medium: old clients get 404s | M (~1 day) |

Order: 1 can ship today. Run step A, then deploy 2. Deploy 3, then run step B.

---

## Decisions needed

1. **Pending requests:** turn them into one-way follows (recommended), or drop them?
2. **Unfriend:** only remove my follow (as specified), or also remove their follow of me? With only mine removed, they show up in my Follow back list right after I unfriend them.
3. **Friend set grows:** is it OK that people who already mutually follow through the feed become friends on deploy?
4. **Old native builds:** is anyone on an installed build that needs the slice 2 bridges to stay up for a while, or is it web-only so slice 3 can follow right away?
5. **Friends count** on the profile: add it, or keep only followers and following? Skipped by default.
