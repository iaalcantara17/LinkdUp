import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import axios from 'axios';
import partyRoutes, { PARTY_LOCATION_LIMIT } from '../src/routes/party';
import userRoutes, { PLACE_SEARCH_LIMIT } from '../src/routes/user';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-alice': 'alice-id', 'tok-mallory': 'mallory-id' };
const NOW_ISO = () => new Date().toISOString();

const db = (c: Call) => {
    const uid = c.url.searchParams.get('user_id');
    if (c.table === 'party_members' && c.method === 'GET') {
        if (uid === 'eq.mallory-id') return [];
        if (uid === 'eq.alice-id') return [{ user_id: 'alice-id', location_mode: 'custom', custom_label: 'Hoboken, NJ', live_at: NOW_ISO(), live_latitude: 40.1, live_longitude: -74.2, custom_latitude: 40.74, custom_longitude: -74.03 }];
        return [{ user_id: 'alice-id', joined_at: 'x', is_online: true, location_mode: 'custom', custom_label: 'Hoboken, NJ', live_at: NOW_ISO(), live_latitude: 40.1, live_longitude: -74.2, custom_latitude: 40.74, custom_longitude: -74.03 }];
    }
    if (c.table === 'party_members' && c.method === 'PATCH') {
        return [{ location_mode: c.body.location_mode, custom_label: c.body.custom_label ?? null, live_at: c.body.live_at ?? null }];
    }
    if (c.table === 'parties') return [{ id: 'p1', status: 'waiting' }];
    return [];
};

let party: { server: Server; base: string };
let user: { server: Server; base: string };
before(async () => {
    party = await serve('/api/party', partyRoutes);
    user = await serve('/api/user', userRoutes);
});
after(() => {
    party.server.close();
    user.server.close();
});
afterEach(() => mock.restoreAll());

const put = (body: unknown, token = 'tok-alice') =>
    realFetch(`${party.base}/api/party/p1/location`, {
        method: 'PUT',
        headers: { ...auth(token), 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });

const memberWrites = (calls: Call[]) => calls.filter((c) => c.table === 'party_members' && c.method === 'PATCH');
const profileWrites = (calls: Call[]) => calls.filter((c) => c.table === 'users' && c.method === 'PATCH' && 'latitude' in (c.body ?? {}));

test('live reading is stored on the party row and refreshes the account location', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await put({ mode: 'live', latitude: 40.1, longitude: -74.2 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { mode: 'live', custom_label: null, live_fresh: true });
    const [w] = memberWrites(calls);
    assert.equal(w.url.searchParams.get('party_id'), 'eq.p1');
    assert.equal(w.url.searchParams.get('user_id'), 'eq.alice-id');
    assert.equal(w.body.live_latitude, 40.1);
    assert.equal(w.body.live_longitude, -74.2);
    assert.equal(w.body.location_mode, 'live');
    assert.ok(Date.now() - Date.parse(w.body.live_at) < 5000);
    const [p] = profileWrites(calls);
    assert.equal(p.url.searchParams.get('id'), 'eq.alice-id');
    assert.equal(p.body.latitude, 40.1);
});

test('custom place uses the same party row and leaves the account location alone', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await put({ mode: 'custom', latitude: 40.74, longitude: -74.03, label: '  Hoboken, NJ ' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { mode: 'custom', custom_label: 'Hoboken, NJ', live_fresh: false });
    const [w] = memberWrites(calls);
    assert.deepEqual(
        { lat: w.body.custom_latitude, lng: w.body.custom_longitude, label: w.body.custom_label, mode: w.body.location_mode },
        { lat: 40.74, lng: -74.03, label: 'Hoboken, NJ', mode: 'custom' },
    );
    assert.equal(profileWrites(calls).length, 0);
});

for (const [name, body] of [
    ['latitude above 90', { mode: 'live', latitude: 91, longitude: 0 }],
    ['longitude below -180', { mode: 'live', latitude: 0, longitude: -181 }],
    ['string coordinates', { mode: 'live', latitude: '40', longitude: '-74' }],
    ['null coordinates', { mode: 'live', latitude: null, longitude: null }],
    ['missing mode', { latitude: 40, longitude: -74 }],
    ['unknown mode', { mode: 'gps', latitude: 40, longitude: -74 }],
    ['custom without label', { mode: 'custom', latitude: 40, longitude: -74 }],
    ['custom with blank label', { mode: 'custom', latitude: 40, longitude: -74, label: '   ' }],
    ['custom with long label', { mode: 'custom', latitude: 40, longitude: -74, label: 'x'.repeat(121) }],
    ['extra fields', { mode: 'live', latitude: 40, longitude: -74, user_id: 'mallory-id' }],
] as const) {
    test(`rejects ${name}`, async () => {
        const calls = mockSupabase(USERS, db);
        const res = await put(body);
        assert.equal(res.status, 400);
        assert.equal(memberWrites(calls).length, 0);
    });
}

test('non-members cannot set a location', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await put({ mode: 'live', latitude: 40, longitude: -74 }, 'tok-mallory');
    assert.equal(res.status, 403);
    assert.equal(memberWrites(calls).length, 0);
});

test('party details include my location source without exposing coordinates', async () => {
    const calls = mockSupabase(USERS, db);
    const res = await realFetch(`${party.base}/api/party/p1`, { headers: auth('tok-alice') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.my_location, { mode: 'custom', custom_label: 'Hoboken, NJ', live_fresh: true });
    const text = JSON.stringify(body);
    assert.ok(!text.includes('40.74') && !text.includes('40.1'));
    assert.ok(!/live_(lat|lon|at)|custom_(lat|lon)|location_mode/.test(text));
    const memberReads = calls.filter((c) => c.table === 'party_members' && c.method === 'GET' && !c.url.searchParams.has('user_id'));
    assert.equal(memberReads.length, 1);
    assert.equal(calls.filter((c) => c.table === 'party_members' && c.method === 'GET').length, 2);
});

const search = (q: string) => realFetch(`${user.base}/api/user/location/search?q=${encodeURIComponent(q)}`, { headers: auth('tok-alice') });

test('place search returns coordinates and a readable label without saving anything', async () => {
    const calls = mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Hoboken, NJ, USA', geometry: { location: { lat: 40.744, lng: -74.032 } } }] },
    }));
    const res = await search('Hoboken');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { latitude: 40.744, longitude: -74.032, label: 'Hoboken, NJ, USA' });
    assert.equal(profileWrites(calls).length, 0);
});

test('place search falls back to the typed text when Google gives no address', async () => {
    mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: '', geometry: { location: { lat: 40.744, lng: -74.032 } } }] },
    }));
    const res = await search('Hoboken');
    assert.equal((await res.json()).label, 'Hoboken');
});

test('place search with no match says so', async () => {
    mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({ data: { status: 'ZERO_RESULTS', results: [] } }));
    const res = await search('Nowhereville');
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'place_not_found');
});

test('place search over quota is a paused message, not not-found', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({ data: { status: 'OVER_QUERY_LIMIT', results: [] } }));
    const res = await search('Hoboken');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
});

test('place search rejects a one-letter query without calling Google', async () => {
    mockSupabase(USERS);
    const get = mock.method(axios, 'get', async () => ({ data: {} }));
    const res = await search('a');
    assert.equal(res.status, 400);
    assert.equal(get.mock.callCount(), 0);
});

test('place search is rate limited', async () => {
    mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({ data: { status: 'ZERO_RESULTS', results: [] } }));
    let last: Response | undefined;
    for (let i = 0; i <= PLACE_SEARCH_LIMIT; i++) {
        last = await search('Hoboken');
        await last.arrayBuffer();
    }
    assert.equal(last!.status, 429);
});

test('location writes are rate limited', async () => {
    mockSupabase(USERS, db);
    let last: Response | undefined;
    for (let i = 0; i <= PARTY_LOCATION_LIMIT; i++) {
        last = await put({ mode: 'live', latitude: 40, longitude: -74 });
        await last.arrayBuffer();
    }
    assert.equal(last!.status, 429);
});
