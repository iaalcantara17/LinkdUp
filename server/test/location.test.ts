import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import axios from 'axios';
import discoverRoutes from '../src/routes/discover';
import partyRoutes from '../src/routes/party';
import { fuzzCoords } from '../src/services/locationFuzz';
import { midpoint, distanceMiles } from '../src/services/midpoint';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-alice': 'alice-id', 'tok-bob': 'bob-id' };
const ALICE = { latitude: 40.7128, longitude: -74.006 };
const BOB = { latitude: 40.7614, longitude: -73.9776 };
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
        if (c.table === 'party_members' && c.url.searchParams.has('party_id')) return [{ party_id: 'p1', user_id: 'bob-id' }];
        if (c.table === 'users') return [{ id: 'bob-id', display_name: 'Bob', ...BOB }];
        return [];
    });
    const res = await realFetch(`${discover.base}/api/discover/parties?lat=${ALICE.latitude}&lng=${ALICE.longitude}`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const [p] = await res.json();
    assert.ok(Number.isInteger(p.miles_away), `miles_away ${p.miles_away} is not whole`);
    assert.equal(p.miles_away, Math.max(1, Math.round(distanceMiles(ALICE, fuzzed('bob-id', BOB)))));
});

test('party start midpoint comes from fuzzed coordinates, not exact member locations', async () => {
    const calls = mockSupabase(USERS, (c: Call) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'parties') return [{ host_user_id: 'alice-id', status: 'waiting' }];
        if (c.table === 'party_members') return [{ user_id: 'alice-id' }, { user_id: 'bob-id' }];
        if (c.table === 'users') return [{ id: 'alice-id', ...ALICE }, { id: 'bob-id', ...BOB }];
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
    assert.deepEqual((post.mock.calls[0].arguments[1] as any).locationRestriction.circle.center, expected);
    const reflected = { latitude: 2 * body.midpoint.latitude - ALICE.latitude, longitude: 2 * body.midpoint.longitude - ALICE.longitude };
    assert.ok(distanceMiles(reflected, BOB) > 0.1, 'midpoint plus host location reveals the other member');
});
