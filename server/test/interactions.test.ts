import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import friendsRoutes from '../src/routes/friends';
import feedRoutes from '../src/routes/feed';
import voteRoutes from '../src/routes/vote';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const COMMENT = '33333333-3333-4333-8333-333333333333';
const USERS = { 'tok-alice': ALICE };

let friends: { server: Server; base: string };
let feed: { server: Server; base: string };
let votes: { server: Server; base: string };
before(async () => {
    friends = await serve('/api/friends', friendsRoutes);
    feed = await serve('/api/discover', feedRoutes);
    votes = await serve('/api/party', voteRoutes);
});
after(() => {
    friends.server.close();
    feed.server.close();
    votes.server.close();
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

test('unfriend with a real user id deletes the friendship in both directions', async () => {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${friends.base}/api/friends/${BOB}`, { method: 'DELETE', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const del = calls.find((c) => c.table === 'friendships' && c.method === 'DELETE');
    assert.ok(del, 'expected a friendships delete');
    assert.equal(
        del.url.searchParams.get('or'),
        `(and(requester_id.eq.${ALICE},addressee_id.eq.${BOB}),and(requester_id.eq.${BOB},addressee_id.eq.${ALICE}))`
    );
});

test('author can delete their comment', async () => {
    const calls = mockSupabase(USERS, (c) => (c.table === 'feed_comments' && c.method === 'GET' ? [{ author_id: ALICE }] : []));
    const res = await realFetch(`${feed.base}/api/discover/feed/comments/${COMMENT}`, { method: 'DELETE', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const del = calls.find((c) => c.table === 'feed_comments' && c.method === 'DELETE');
    assert.equal(del?.url.searchParams.get('id'), `eq.${COMMENT}`);
});
