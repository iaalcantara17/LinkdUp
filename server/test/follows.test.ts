import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { bootApp, client, freshWorld } from './flowApp';
import type { FakeSupabase } from './fakeSupabase';

const ME = '10000000-0000-4000-8000-000000000001';
const MUTUAL = '10000000-0000-4000-8000-000000000002';
const I_FOLLOW = '10000000-0000-4000-8000-000000000003';
const FOLLOWS_ME = '10000000-0000-4000-8000-000000000004';
const STRANGER = '10000000-0000-4000-8000-000000000005';
const NAMES: Record<string, string> = { [ME]: 'Pat Me', [MUTUAL]: 'Pat Mutual', [I_FOLLOW]: 'Pat Ifollow', [FOLLOWS_ME]: 'Pat Followsme', [STRANGER]: 'Pat Stranger' };

let server: Server;
let base = '';
let fake: FakeSupabase;
let call: ReturnType<typeof client>['call'];

before(async () => ({ server, base } = await bootApp()));
after(() => server.close());
beforeEach(() => {
    mock.method(console, 'error', () => {});
    fake = freshWorld();
    for (const [id, name] of Object.entries(NAMES)) fake.addUser(id, { display_name: name, username: name.toLowerCase().replace(' ', '_') });
    for (const [a, b] of [[ME, MUTUAL], [MUTUAL, ME], [ME, I_FOLLOW], [FOLLOWS_ME, ME]]) {
        fake.db.user_follows.push({ follower_id: a, followed_id: b, followed_at: '2026-10-01T00:00:00Z' });
    }
    call = client(base).call;
});
afterEach(() => mock.restoreAll());

const as = (id: string) => `tok-${id}`;
const ids = (rows: any[]) => rows.map((r) => r.id ?? r.user?.id).sort();
const follows = (a: string, b: string) => fake.db.user_follows.some((f) => f.follower_id === a && f.followed_id === b);

test('friends are only people who follow each other', async () => {
    const res = await call('GET', '/api/friends', as(ME));
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res.json), [MUTUAL]);
    assert.equal(res.json[0].is_online, false);
});

test('a one-way follow in either direction is not a friend', async () => {
    const mine = await call('GET', '/api/friends', as(ME));
    assert.ok(!ids(mine.json).includes(I_FOLLOW));
    assert.ok(!ids(mine.json).includes(FOLLOWS_ME));
    const theirs = await call('GET', '/api/friends', as(FOLLOWS_ME));
    assert.deepEqual(theirs.json, []);
});

test('following someone back with one tap makes you friends', async () => {
    assert.equal((await call('POST', `/api/user/${FOLLOWS_ME}/follow`, as(ME))).status, 200);
    const res = await call('GET', '/api/friends', as(ME));
    assert.deepEqual(ids(res.json), [MUTUAL, FOLLOWS_ME].sort());
});

test('friends lists never read the old friendships table', async () => {
    fake.db.friendships.push({ id: '10000000-0000-4000-8000-0000000000f1', requester_id: ME, addressee_id: STRANGER, status: 'accepted' });
    const res = await call('GET', '/api/friends', as(ME));
    assert.deepEqual(ids(res.json), [MUTUAL]);
    assert.ok(!fake.calls.some((c) => c.table === 'friendships'));
});

test('unfriend removes only my follow and leaves theirs', async () => {
    assert.equal((await call('DELETE', `/api/friends/${MUTUAL}`, as(ME))).status, 200);
    assert.equal(follows(ME, MUTUAL), false);
    assert.equal(follows(MUTUAL, ME), true);
    assert.deepEqual((await call('GET', '/api/friends', as(ME))).json, []);
    assert.deepEqual((await call('GET', '/api/friends', as(MUTUAL))).json, []);
});

test('the requests list is people who follow me that I do not follow back', async () => {
    const res = await call('GET', '/api/friends/pending', as(ME));
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.map((r: any) => r.user.id), [FOLLOWS_ME]);
    assert.equal(res.json[0].friendship_id, FOLLOWS_ME);
    assert.equal(res.json[0].user.display_name, 'Pat Followsme');
});

test('the requests list empties once I follow back', async () => {
    await call('POST', `/api/user/${FOLLOWS_ME}/follow`, as(ME));
    assert.deepEqual((await call('GET', '/api/friends/pending', as(ME))).json, []);
});

test('status reports friends, one-way each way, and none, from follows', async () => {
    const status = async (id: string) => (await call('GET', `/api/friends/status/${id}`, as(ME))).json;
    assert.deepEqual(await status(MUTUAL), { friendship_id: MUTUAL, status: 'accepted', direction: 'outgoing', i_follow: true, follows_me: true });
    assert.deepEqual(await status(I_FOLLOW), { friendship_id: I_FOLLOW, status: 'pending', direction: 'outgoing', i_follow: true, follows_me: false });
    assert.deepEqual(await status(FOLLOWS_ME), { friendship_id: FOLLOWS_ME, status: 'pending', direction: 'incoming', i_follow: false, follows_me: true });
    assert.deepEqual(await status(STRANGER), { status: 'none', i_follow: false, follows_me: false });
});

test('search marks each person with how we follow each other', async () => {
    const res = await call('GET', '/api/friends/search?q=Pat', as(ME));
    assert.equal(res.status, 200);
    const by = Object.fromEntries(res.json.map((u: any) => [u.id, u]));
    assert.deepEqual(Object.keys(by).sort(), [MUTUAL, I_FOLLOW, FOLLOWS_ME, STRANGER].sort());
    assert.equal(by[MUTUAL].friendship.status, 'accepted');
    assert.deepEqual([by[I_FOLLOW].i_follow, by[I_FOLLOW].follows_me], [true, false]);
    assert.equal(by[FOLLOWS_ME].friendship.direction, 'incoming');
    assert.equal(by[STRANGER].friendship, null);
});

test('a public profile says whether I follow them and whether they follow me', async () => {
    const p = (await call('GET', `/api/user/${FOLLOWS_ME}/public`, as(ME))).json;
    assert.equal(p.i_follow, false);
    assert.equal(p.follows_me, true);
    assert.equal(p.friend_count, undefined);
});

test('blocking removes follows both ways, ends the friendship and stops following again', async () => {
    assert.equal((await call('POST', `/api/user/${MUTUAL}/block`, as(ME))).status, 200);
    assert.equal(follows(ME, MUTUAL), false);
    assert.equal(follows(MUTUAL, ME), false);
    assert.deepEqual((await call('GET', '/api/friends', as(ME))).json, []);
    assert.equal((await call('POST', `/api/user/${ME}/follow`, as(MUTUAL))).status, 403);
    assert.deepEqual((await call('GET', '/api/friends/pending', as(ME))).json.map((r: any) => r.user.id), [FOLLOWS_ME]);
});

test('bridge: sending a friend request from an old tab just follows them, with no request row', async () => {
    const res = await call('POST', '/api/friends/request', as(ME), { user_id: STRANGER });
    assert.equal(res.status, 201);
    assert.equal(follows(ME, STRANGER), true);
    assert.equal(fake.db.friendships.length, 0);
    assert.equal((await call('POST', '/api/friends/request', as(ME), { user_id: STRANGER })).status, 201);
    assert.equal(fake.db.user_follows.filter((f) => f.follower_id === ME && f.followed_id === STRANGER).length, 1);
});

test('bridge: a request to yourself or across a block is refused and follows nobody', async () => {
    assert.equal((await call('POST', '/api/friends/request', as(ME), { user_id: ME })).status, 400);
    fake.db.user_blocks.push({ blocker_id: STRANGER, blocked_id: ME });
    assert.equal((await call('POST', '/api/friends/request', as(ME), { user_id: STRANGER })).status, 403);
    assert.equal(follows(ME, STRANGER), false);
});

test('bridge: accepting from the requests list follows them back and makes you friends', async () => {
    const [request] = (await call('GET', '/api/friends/pending', as(ME))).json;
    assert.equal((await call('POST', `/api/friends/${request.friendship_id}/accept`, as(ME))).status, 200);
    assert.deepEqual(ids((await call('GET', '/api/friends', as(ME))).json), [MUTUAL, FOLLOWS_ME].sort());
});

test('bridge: accepting an old request id from a tab opened before the switch follows the requester back', async () => {
    const OLD = '10000000-0000-4000-8000-0000000000f2';
    fake.db.friendships.push({ id: OLD, requester_id: STRANGER, addressee_id: ME, status: 'pending' });
    fake.db.user_follows.push({ follower_id: STRANGER, followed_id: ME });
    assert.equal((await call('POST', `/api/friends/${OLD}/accept`, as(ME))).status, 200);
    assert.equal(follows(ME, STRANGER), true);
    assert.ok(ids((await call('GET', '/api/friends', as(ME))).json).includes(STRANGER));
});

test("bridge: nobody can accept an old request that was sent to someone else", async () => {
    const OLD = '10000000-0000-4000-8000-0000000000f3';
    fake.db.friendships.push({ id: OLD, requester_id: STRANGER, addressee_id: MUTUAL, status: 'pending' });
    assert.equal((await call('POST', `/api/friends/${OLD}/accept`, as(ME))).status, 403);
    assert.equal(follows(ME, STRANGER), false);
});

test('bridge: decline changes nothing, and bad ids are rejected', async () => {
    const before = JSON.stringify(fake.db.user_follows);
    assert.equal((await call('POST', `/api/friends/${FOLLOWS_ME}/decline`, as(ME))).status, 200);
    assert.equal(JSON.stringify(fake.db.user_follows), before);
    assert.equal((await call('POST', '/api/friends/x),id.not.is.null/accept', as(ME))).status, 400);
    assert.equal((await call('POST', '/api/friends/not-a-uuid/decline', as(ME))).status, 400);
    const unfriend = await call('DELETE', `/api/friends/${encodeURIComponent('x),id.not.is.null,and(follower_id.eq.x')}`, as(ME));
    assert.equal(unfriend.status, 400);
    assert.equal(JSON.stringify(fake.db.user_follows), before);
});

test('the unused outgoing requests route is gone', async () => {
    assert.equal((await call('GET', '/api/friends/outgoing', as(ME))).status, 404);
});

test('Discover marks a party as having friends inside only when a mutual follow is in it', async () => {
    const at = { location_mode: 'custom', custom_latitude: 40.74, custom_longitude: -74.03, custom_label: 'Hoboken' };
    for (const [id, host] of [['10000000-0000-4000-8000-0000000000a1', MUTUAL], ['10000000-0000-4000-8000-0000000000a2', I_FOLLOW], ['10000000-0000-4000-8000-0000000000a3', FOLLOWS_ME]]) {
        fake.db.parties.push({ id, name: `Party of ${NAMES[host]}`, code: id.slice(-6), status: 'waiting', host_user_id: host, is_public: true });
        fake.db.party_members.push({ party_id: id, user_id: host, ...at });
    }
    const res = await call('GET', '/api/discover/parties?lat=40.74&lng=-74.03', as(ME));
    assert.equal(res.status, 200);
    const inside = Object.fromEntries(res.json.map((p: any) => [p.host_display_name, p.friends_inside]));
    assert.deepEqual(inside, { 'Pat Mutual': true, 'Pat Ifollow': false, 'Pat Followsme': false });
    assert.equal(res.json[0].host_display_name, 'Pat Mutual');
});
