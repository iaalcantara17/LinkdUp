import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import friendsRoutes from '../src/routes/friends';
import feedRoutes from '../src/routes/feed';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const COMMENT = '33333333-3333-4333-8333-333333333333';
const USERS = { 'tok-alice': ALICE };

let friends: { server: Server; base: string };
let feed: { server: Server; base: string };
before(async () => {
    friends = await serve('/api/friends', friendsRoutes);
    feed = await serve('/api/discover', feedRoutes);
});
after(() => {
    friends.server.close();
    feed.server.close();
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
