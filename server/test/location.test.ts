import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import axios from 'axios';
import discoverRoutes from '../src/routes/discover';
import partyRoutes from '../src/routes/party';
import { fuzzCoords } from '../src/services/locationFuzz';
import { midpoint, distanceMiles } from '../src/services/midpoint';
import { gridCell } from '../src/services/googleCache';
import { config } from '../src/config';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-alice': 'alice-id', 'tok-bob': 'bob-id' };
const ALICE = { latitude: 40.7128, longitude: -74.006 };
const BOB = { latitude: 40.7614, longitude: -73.9776 };
const NJIT = { latitude: 40.7424, longitude: -74.1784 };
const live = (p: typeof ALICE) => ({ live_latitude: p.latitude, live_longitude: p.longitude, live_at: new Date().toISOString(), location_mode: 'live' });
const fuzzed = (id: string, p: typeof ALICE) => {
    const f = fuzzCoords(p.latitude, p.longitude, id);
    return { latitude: f.lat, longitude: f.lng };
};

let discover: { server: Server; base: string };
let party: { server: Server; base: string };
before(async () => {
    discover = await serve('/api/discover', discoverRoutes);
    party = await serve('/api/party', partyRoutes);
});
after(() => {
    discover.server.close();
    party.server.close();
});
afterEach(() => mock.restoreAll());

test('discover miles_away is a whole number from fuzzed member coordinates', async () => {
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ id: 'p1', name: 'Bob party', code: 'ABC123', status: 'waiting', host_user_id: 'bob-id' }];
        if (c.table === 'party_members' && c.url.searchParams.has('party_id')) return [{ party_id: 'p1', user_id: 'bob-id', ...live(BOB) }];
        if (c.table === 'users') return [{ id: 'bob-id', display_name: 'Bob', ...NJIT }];
        return [];
    });
    const res = await realFetch(`${discover.base}/api/discover/parties?lat=${ALICE.latitude}&lng=${ALICE.longitude}`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const [p] = await res.json();
    assert.ok(Number.isInteger(p.miles_away), `miles_away ${p.miles_away} is not whole`);
    assert.equal(p.miles_away, Math.max(1, Math.round(distanceMiles(ALICE, fuzzed('bob-id', BOB)))));
});

test('discover keeps listing a party whose only reading is a few hours old', async () => {
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ id: 'p1', name: 'Bob party', code: 'ABC123', status: 'waiting', host_user_id: 'bob-id' }];
        if (c.table === 'party_members' && c.url.searchParams.has('party_id')) return [{ party_id: 'p1', user_id: 'bob-id', ...live(BOB), live_at: old }];
        if (c.table === 'users') return [{ id: 'bob-id', display_name: 'Bob' }];
        return [];
    });
    const res = await realFetch(`${discover.base}/api/discover/parties?lat=${ALICE.latitude}&lng=${ALICE.longitude}`, { headers: auth('tok-alice') });
    assert.equal((await res.json()).length, 1);
});

test('fuzz offset depends on a server secret, not just the user id', () => {
    const before = fuzzCoords(40, -74, 'bob-id');
    const key = config.supabase.serviceRoleKey;
    config.supabase.serviceRoleKey = 'a-different-secret';
    try {
        assert.notDeepEqual(fuzzCoords(40, -74, 'bob-id'), before);
    } finally {
        config.supabase.serviceRoleKey = key;
    }
    assert.deepEqual(fuzzCoords(40, -74, 'bob-id'), before);
    for (const id of ['a', 'b', 'c', 'bob-id', 'alice-id']) {
        const f = fuzzCoords(40, -74, id);
        assert.ok(Math.abs(f.lat - 40) <= 0.0072 && Math.abs(f.lng + 74) <= 0.009, `offset out of range for ${id}`);
    }
});

test('party locations report member distances from fuzzed coordinates, rounded', async () => {
    const VENUE = { latitude: 40.73, longitude: -73.99 };
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'party_members') return c.url.searchParams.has('user_id') ? [{ user_id: 'alice-id' }] : [{ user_id: 'alice-id', ...live(ALICE) }, { user_id: 'bob-id', ...live(BOB) }];
        if (c.table === 'locations') return [{ id: 'l1', name: 'Cafe', ...VENUE }];
        if (c.table === 'users') return [{ id: 'alice-id', display_name: 'Alice', ...NJIT }, { id: 'bob-id', display_name: 'Bob', ...NJIT }];
        return [];
    });
    const res = await realFetch(`${party.base}/api/party/p1/locations`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const [loc] = await res.json();
    const bob = loc.distances.find((d: any) => d.user_id === 'bob-id');
    assert.equal(bob.miles, Math.round(distanceMiles(fuzzed('bob-id', BOB), VENUE) * 10) / 10);
});

test('party start midpoint comes from fuzzed coordinates, not exact member locations', async () => {
    const calls = mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ host_user_id: 'alice-id', status: 'waiting' }];
        if (c.table === 'party_members') return [{ user_id: 'alice-id', ...live(ALICE) }, { user_id: 'bob-id', ...live(BOB) }];
        if (c.table === 'users') return [{ id: 'alice-id', ...NJIT }, { id: 'bob-id', ...NJIT }];
        return [];
    });
    const post = mock.method(axios, 'post', async () => ({ data: { places: [{ id: 'ChIJx', displayName: { text: 'Cafe' }, primaryType: 'cafe', types: ['cafe'] }] } }));
    const res = await realFetch(`${party.base}/api/party/p1/start`, { method: 'POST', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const body = await res.json();
    const expected = midpoint([fuzzed('alice-id', ALICE), fuzzed('bob-id', BOB)]);
    const exact = midpoint([ALICE, BOB]);
    assert.deepEqual(body.midpoint, expected);
    assert.notDeepEqual(body.midpoint, exact);
    const stored = calls.find((c) => c.table === 'parties' && c.method === 'PATCH')!;
    assert.equal(stored.body.midpoint_lat, expected.latitude);
    assert.equal(stored.body.midpoint_lng, expected.longitude);
    assert.deepEqual((post.mock.calls[0].arguments[1] as any).locationRestriction.circle.center, gridCell(expected));
    const reflected = { latitude: 2 * body.midpoint.latitude - ALICE.latitude, longitude: 2 * body.midpoint.longitude - ALICE.longitude };
    assert.ok(distanceMiles(reflected, BOB) > 0.1, 'midpoint plus host location reveals the other member');
});

test('party start ignores a saved account location when a member has no party reading', async () => {
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ host_user_id: 'alice-id', status: 'waiting' }];
        if (c.table === 'party_members') return [{ user_id: 'alice-id', ...live(ALICE) }, { user_id: 'bob-id', live_latitude: BOB.latitude, live_longitude: BOB.longitude, live_at: '2026-01-01T00:00:00Z', location_mode: 'live' }];
        if (c.table === 'users') return [{ id: 'alice-id', ...NJIT }, { id: 'bob-id', ...NJIT }];
        return [];
    });
    mock.method(axios, 'post', async () => ({ data: { places: [{ id: 'ChIJx', displayName: { text: 'Cafe' }, primaryType: 'cafe', types: ['cafe'] }] } }));
    const res = await realFetch(`${party.base}/api/party/p1/start`, { method: 'POST', headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).midpoint, fuzzed('alice-id', ALICE));
});

test('party start with no party readings asks for locations instead of using saved ones', async () => {
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ host_user_id: 'alice-id', status: 'waiting' }];
        if (c.table === 'party_members') return [{ user_id: 'alice-id' }, { user_id: 'bob-id' }];
        if (c.table === 'users') return [{ id: 'alice-id', ...NJIT }, { id: 'bob-id', ...NJIT }];
        return [];
    });
    const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    const res = await realFetch(`${party.base}/api/party/p1/start`, { method: 'POST', headers: auth('tok-alice') });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'no_member_locations');
    assert.equal(post.mock.callCount(), 0);
});

test('crew map shows fuzzed party locations and hides members without one', async () => {
    mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'party_members') return c.url.searchParams.has('user_id') ? [{ user_id: 'alice-id' }] : [{ user_id: 'alice-id', is_online: true, ...live(ALICE) }, { user_id: 'bob-id', is_online: true }];
        if (c.table === 'users') return [{ id: 'alice-id', display_name: 'Alice', ...NJIT }, { id: 'bob-id', display_name: 'Bob', ...NJIT }];
        return [];
    });
    const res = await realFetch(`${party.base}/api/party/p1/members`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const members = await res.json();
    const alice = members.find((m: any) => m.user_id === 'alice-id');
    const bob = members.find((m: any) => m.user_id === 'bob-id');
    const f = fuzzed('alice-id', ALICE);
    assert.deepEqual([alice.display_lat, alice.display_lng], [f.latitude, f.longitude]);
    assert.deepEqual([bob.display_lat, bob.display_lng], [null, null]);
    const text = JSON.stringify(members);
    assert.ok(!/live_|custom_|latitude|longitude/.test(text), 'raw location fields leaked');
});