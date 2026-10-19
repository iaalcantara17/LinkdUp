import './env';
import { test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('unfollowing a friend removes only my follow, so they move to my follow back list', async () => {
    assert.equal((await call('DELETE', `/api/user/${MUTUAL}/follow`, as(ME))).status, 200);
    assert.equal(follows(ME, MUTUAL), false);
    assert.equal(follows(MUTUAL, ME), true);
    assert.deepEqual((await call('GET', '/api/friends', as(ME))).json, []);
    assert.deepEqual((await call('GET', '/api/friends', as(MUTUAL))).json, []);
    assert.deepEqual(ids((await call('GET', '/api/friends/follow-back', as(ME))).json), [MUTUAL, FOLLOWS_ME].sort());
    assert.deepEqual((await call('GET', '/api/friends/follow-back', as(MUTUAL))).json, []);
});

test('follow back lists people who follow me that I do not follow, as plain people', async () => {
    const res = await call('GET', '/api/friends/follow-back', as(ME));
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.map((u: any) => u.id), [FOLLOWS_ME]);
    assert.equal(res.json[0].display_name, 'Pat Followsme');
    assert.equal(res.json[0].followed_at, '2026-10-01T00:00:00Z');
    assert.equal(res.json[0].friendship_id, undefined);
});

test('follow back empties once I follow back', async () => {
    await call('POST', `/api/user/${FOLLOWS_ME}/follow`, as(ME));
    assert.deepEqual((await call('GET', '/api/friends/follow-back', as(ME))).json, []);
});

test('search marks each person with how we follow each other and nothing about requests', async () => {
    const res = await call('GET', '/api/friends/search?q=Pat', as(ME));
    assert.equal(res.status, 200);
    const by = Object.fromEntries(res.json.map((u: any) => [u.id, u]));
    assert.deepEqual(Object.keys(by).sort(), [MUTUAL, I_FOLLOW, FOLLOWS_ME, STRANGER].sort());
    assert.deepEqual([by[MUTUAL].i_follow, by[MUTUAL].follows_me], [true, true]);
    assert.deepEqual([by[I_FOLLOW].i_follow, by[I_FOLLOW].follows_me], [true, false]);
    assert.deepEqual([by[FOLLOWS_ME].i_follow, by[FOLLOWS_ME].follows_me], [false, true]);
    assert.deepEqual([by[STRANGER].i_follow, by[STRANGER].follows_me], [false, false]);
    for (const u of res.json) assert.equal('friendship' in u, false);
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
    assert.deepEqual((await call('GET', '/api/friends/follow-back', as(ME))).json.map((u: any) => u.id), [FOLLOWS_ME]);
});

test('the old friend request routes are gone and change nothing', async () => {
    const before = JSON.stringify(fake.db.user_follows);
    for (const [method, path, body] of [
        ['GET', '/api/friends/pending'],
        ['GET', '/api/friends/outgoing'],
        ['GET', `/api/friends/status/${MUTUAL}`],
        ['POST', '/api/friends/request', { user_id: STRANGER }],
        ['POST', `/api/friends/${FOLLOWS_ME}/accept`],
        ['POST', `/api/friends/${FOLLOWS_ME}/decline`],
        ['DELETE', `/api/friends/${MUTUAL}`],
    ] as const) {
        assert.equal((await call(method, path, as(ME), body)).status, 404, `${method} ${path}`);
    }
    assert.equal(JSON.stringify(fake.db.user_follows), before);
});

test('no server code reads the old friendships table or the bridge', () => {
    const src = join(__dirname, '..', 'src');
    const found = readdirSync(src, { recursive: true })
        .map(String)
        .filter((f) => /\.(ts|sql)$/.test(f) && !f.replace(/\\/g, '/').startsWith('db/migrations/'))
        .filter((f) => /\bfriendships\b|friendRequestBridge|legacyFriendship/.test(readFileSync(join(src, f), 'utf8')));
    assert.deepEqual(found, []);
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
