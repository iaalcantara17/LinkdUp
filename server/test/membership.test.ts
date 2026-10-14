import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import voteRoutes from '../src/routes/vote';
import matchRoutes from '../src/routes/match';
import datesRoutes from '../src/routes/dates';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-host': 'host-id', 'tok-member': 'member-id', 'tok-outsider': 'outsider-id' };
const D1 = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';

const db = (c: Call) => {
    if (c.method !== 'GET') return [];
    const uid = c.url.searchParams.get('user_id');
    if (c.table === 'party_members') return uid === 'eq.host-id' || uid === 'eq.member-id' ? [{ user_id: uid.slice(3) }] : [];
    if (c.table === 'parties') return [{ id: 'p1', host_user_id: 'host-id', status: 'matched', matched_location_id: 'l1' }];
    if (c.table === 'party_dates') {
        const id = c.url.searchParams.get('id');
        if (id === `eq.${FOREIGN}`) return [];
        return [{ id: D1 }];
    }
    if (c.table === 'locations') return [{ id: 'l1', name: 'Secret Spot' }];
    if (c.table === 'v_party_vote_tallies') return [{ location_id: 'l1', yes_votes: 2 }];
    return [];
};

let server: Server;
let base = '';
before(async () => {
    const router = express.Router();
    router.use(voteRoutes, matchRoutes, datesRoutes);
    ({ server, base } = await serve('/api/party', router));
});
after(() => server.close());
afterEach(() => mock.restoreAll());

const call = (token: string, method: string, path: string, body?: unknown) =>
    realFetch(`${base}/api/party/p1${path}`, {
        method,
        headers: { ...auth(token), 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

for (const [method, path, body] of [
    ['GET', '/votes'],
    ['GET', '/my-votes'],
    ['GET', '/match'],
    ['POST', '/dates/vote', { date_slot_ids: [D1] }],
] as const) {
    test(`${method} ${path} rejects a non-member`, async () => {
        const calls = mockSupabase(USERS, db);
        const res = await call('tok-outsider', method, path, body);
        assert.equal(res.status, 403);
        assert.ok(!(await res.text()).includes('Secret Spot'));
        assert.ok(!calls.some((c) => c.table === 'date_votes' || c.table === 'v_party_vote_tallies'));
    });

    test(`${method} ${path} works for a member`, async () => {
        mockSupabase(USERS, db);
        const res = await call('tok-member', method, path, body);
        assert.equal(res.status, 200);
    });
}

test('legacy date vote rejects slots from another party', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await call('tok-member', 'POST', '/dates/vote', { date_slot_ids: [D1, FOREIGN] });
    assert.equal(res.status, 400);
    assert.ok(!calls.some((c) => c.table === 'date_votes'));
});

test('legacy lock rejects a date from another party', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await call('tok-host', 'POST', '/dates/lock', { party_date_id: FOREIGN });
    assert.equal(res.status, 404);
    assert.ok(!calls.some((c) => c.table === 'parties' && c.method === 'PATCH'));
});

test('legacy lock works for the host with a date in this party', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await call('tok-host', 'POST', '/dates/lock', { party_date_id: D1 });
    assert.equal(res.status, 200);
    assert.ok(calls.some((c) => c.table === 'parties' && c.method === 'PATCH'));
});
