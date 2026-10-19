import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import friendsRoutes from '../src/routes/friends';
import feedRoutes from '../src/routes/feed';
import voteRoutes from '../src/routes/vote';
import userRoutes from '../src/routes/user';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const COMMENT = '33333333-3333-4333-8333-333333333333';
const USERS = { 'tok-alice': ALICE };

let friends: { server: Server; base: string };
let feed: { server: Server; base: string };
let votes: { server: Server; base: string };
let users: { server: Server; base: string };
before(async () => {
    friends = await serve('/api/friends', friendsRoutes);
    feed = await serve('/api/discover', feedRoutes);
    votes = await serve('/api/party', voteRoutes);
    users = await serve('/api/user', userRoutes);
});
after(() => {
    friends.server.close();
    feed.server.close();
    votes.server.close();
    users.server.close();
});

test('the vote that ends a round tells the client the party is now proposing', async () => {
    const PARTY = '44444444-4444-4444-8444-444444444444';
    const LOC = '55555555-5555-4555-8555-555555555555';
    mockSupabase(USERS, (c) => {
        if (c.table === 'party_members') return [{ user_id: ALICE }];
        if (c.table === 'locations') return [{ id: LOC, party_id: PARTY }];
        if (c.table === 'parties') return [{ id: PARTY, status: 'proposing', current_card_index: 8, voting_round: 1, rejected_location_ids: [], matched_location_id: null }];
        return [];
    });
    const res = await realFetch(`${votes.base}/api/party/${PARTY}/vote`, {
        method: 'POST',
        headers: { ...auth('tok-alice'), 'content-type': 'application/json' },
        body: JSON.stringify({ location_id: LOC, vote: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.proposing, true);
});
afterEach(() => mock.restoreAll());

test('unfriend with a real user id removes only my follow of them', async () => {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${friends.base}/api/friends/${BOB}`, { method: 'DELETE', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const dels = calls.filter((c) => c.method === 'DELETE');
    assert.equal(dels.length, 1);
    assert.equal(dels[0].table, 'user_follows');
    assert.equal(dels[0].url.searchParams.get('follower_id'), `eq.${ALICE}`);
    assert.equal(dels[0].url.searchParams.get('followed_id'), `eq.${BOB}`);
});

test('author can delete their comment', async () => {
    const calls = mockSupabase(USERS, (c) => (c.table === 'feed_comments' && c.method === 'GET' ? [{ author_id: ALICE }] : []));
    const res = await realFetch(`${feed.base}/api/discover/feed/comments/${COMMENT}`, { method: 'DELETE', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const del = calls.find((c) => c.table === 'feed_comments' && c.method === 'DELETE');
    assert.equal(del?.url.searchParams.get('id'), `eq.${COMMENT}`);
});

test('my parties list says which location each party uses for me', async () => {
    const LIVE = '66666666-6666-4666-8666-666666666666';
    const CUSTOM = '77777777-7777-4777-8777-777777777777';
    const NONE = '88888888-8888-4888-8888-888888888888';
    const now = new Date().toISOString();
    mockSupabase(USERS, (c) => {
        if (c.table === 'party_members' && c.url.searchParams.get('user_id')) return [
            { party_id: LIVE, location_mode: 'live', live_at: now, live_latitude: 40, live_longitude: -74 },
            { party_id: CUSTOM, location_mode: 'custom', custom_label: 'Newark', custom_latitude: 40.7, custom_longitude: -74.2 },
            { party_id: NONE, location_mode: 'live', live_at: null },
        ];
        if (c.table === 'parties') return [LIVE, CUSTOM, NONE].map((id) => ({ id, name: id.slice(0, 4), status: 'waiting', host_user_id: ALICE }));
        return [];
    });
    const res = await realFetch(`${users.base}/api/user/me/parties`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const byId = Object.fromEntries((await res.json()).map((p: any) => [p.id, p.my_location]));
    assert.deepEqual(byId[LIVE], { mode: 'live', custom_label: null, live_fresh: true });
    assert.deepEqual(byId[CUSTOM], { mode: 'custom', custom_label: 'Newark', live_fresh: false });
    assert.deepEqual(byId[NONE], { mode: 'live', custom_label: null, live_fresh: false });
});
