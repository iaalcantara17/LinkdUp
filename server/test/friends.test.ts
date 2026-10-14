import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import friendsRoutes from '../src/routes/friends';
import userRoutes from '../src/routes/user';
import { mockSupabase, serve, auth, realFetch } from './supabaseMock';

const USERS = { 'tok-alice': '11111111-1111-4111-8111-111111111111' };
const SAFE = /^(display_name|email|username)\.ilike\.%[A-Za-z0-9 _.@+-]*%$/;

let friends: { server: Server; base: string };
let user: { server: Server; base: string };
before(async () => {
    friends = await serve('/api/friends', friendsRoutes);
    user = await serve('/api/user', userRoutes);
});
after(() => {
    friends.server.close();
    user.server.close();
});
afterEach(() => mock.restoreAll());

async function searchFilter(q: string) {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${friends.base}/api/friends/search?q=${encodeURIComponent(q)}`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const call = calls.find((c) => c.table === 'users' && c.method === 'GET');
    return call?.url.searchParams.get('or') ?? null;
}

for (const q of [
    'bob,id.neq.0',
    'bob),or(id.not.is.null',
    'b*o"b\\:x',
    '@bob,email.ilike.*',
    'al(ice)',
    'x%,id.gt.0',
]) {
    test(`search filter cannot be altered by ${JSON.stringify(q)}`, async () => {
        const or = await searchFilter(q);
        assert.ok(or, 'expected a users query');
        assert.ok(or.startsWith('(') && or.endsWith(')'));
        const parts = or.slice(1, -1).split(',');
        assert.equal(parts.length, q.startsWith('@') ? 1 : 3);
        for (const p of parts) assert.match(p, SAFE);
    });
}

test('ordinary search keeps letters, digits, spaces and email characters', async () => {
    const or = await searchFilter('Jo Ann.b+1@x-y_z');
    assert.equal(or, '(display_name.ilike.%Jo Ann.b+1@x-y_z%,email.ilike.%Jo Ann.b+1@x-y_z%,username.ilike.%Jo Ann.b+1@x-y_z%)');
});

test('search made only of filter syntax runs no query', async () => {
    assert.equal(await searchFilter('(),*'), null);
});

const INJECT = encodeURIComponent('x),id.not.is.null,and(requester_id.eq.x');

test('unfriend rejects a non-uuid id without touching friendships', async () => {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${friends.base}/api/friends/${INJECT}`, { method: 'DELETE', headers: auth('tok-alice') });
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => c.table === 'friendships'));
});

test('friend status rejects a non-uuid id', async () => {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${friends.base}/api/friends/status/${INJECT}`, { headers: auth('tok-alice') });
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => c.table === 'friendships'));
});

test('block rejects a non-uuid id without touching follows or friendships', async () => {
    const calls = mockSupabase(USERS);
    const res = await realFetch(`${user.base}/api/user/${INJECT}/block`, { method: 'POST', headers: auth('tok-alice') });
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => ['user_blocks', 'user_follows', 'friendships'].includes(c.table)));
});
