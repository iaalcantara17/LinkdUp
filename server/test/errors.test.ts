import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import axios from 'axios';
import { HttpError } from '../src/middleware/error';
import partyRoutes from '../src/routes/party';
import discoverRoutes from '../src/routes/discover';
import userRoutes from '../src/routes/user';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-host': 'host-id' };
const SECRET = 'relation "users" password=hunter2 at 10.0.0.5';
const quota = (status: number, gStatus = 'RESOURCE_EXHAUSTED') =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status, data: { error: { code: status, status: gStatus, message: 'Quota exceeded for quota metric' } } },
    });

let app: { server: Server; base: string };
before(async () => {
    const router = express.Router();
    router.get('/boom', () => { throw new Error(SECRET); });
    router.get('/boom-http', () => { throw new HttpError(500, 'insert_failed', SECRET); });
    router.get('/bad', () => { throw new HttpError(400, 'invalid_thing', 'Pick another thing'); });
    router.use('/party', partyRoutes);
    router.use('/discover', discoverRoutes);
    router.use('/user', userRoutes);
    app = await serve('/api', router);
});
after(() => app.server.close());
afterEach(() => mock.restoreAll());

const get = (path: string, init: RequestInit = {}) => realFetch(`${app.base}/api${path}`, { ...init, headers: { ...auth('tok-host'), 'content-type': 'application/json' } });

test('unhandled 500 returns a generic code and logs the detail server side', async () => {
    const logged = mock.method(console, 'error', () => {});
    const res = await get('/boom');
    const body = await res.text();
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(body), { error: 'server_error' });
    assert.ok(logged.mock.calls.some((c) => c.arguments.some((a) => String(a?.message ?? a).includes(SECRET))));
});

test('HttpError 500 hides its internal message', async () => {
    mock.method(console, 'error', () => {});
    const res = await get('/boom-http');
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'insert_failed' });
});

test('4xx HttpError still returns its message', async () => {
    mock.method(console, 'error', () => {});
    const res = await get('/bad');
    assert.deepEqual(await res.json(), { error: 'invalid_thing', message: 'Pick another thing' });
});

const partyDb = (c: Call) => {
    if (c.method !== 'GET') return [];
    if (c.table === 'parties') return [{ host_user_id: 'host-id', status: 'waiting' }];
    if (c.table === 'party_members') return [{ user_id: 'host-id' }];
    if (c.table === 'users') return [{ id: 'host-id', latitude: 40.7, longitude: -74 }];
    return [];
};

for (const [name, err] of [['429', quota(429)], ['403 RESOURCE_EXHAUSTED', quota(403)]] as const) {
    test(`party start maps a Google ${name} to venue_limit_reached`, async () => {
        mock.method(console, 'error', () => {});
        mockSupabase(USERS, partyDb);
        mock.method(axios, 'post', async () => { throw err; });
        const res = await get('/party/p1/start', { method: 'POST' });
        assert.equal(res.status, 503);
        assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
    });
}

test('discover venues maps quota to venue_limit_reached', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    mock.method(axios, 'post', async () => { throw quota(429); });
    const res = await get('/discover/venues?lat=40.7&lng=-74');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
});

test('discover load-more maps quota to venue_limit_reached instead of an empty list', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    mock.method(axios, 'post', async () => { throw quota(429); });
    const res = await get('/discover/venues/more?lat=40.7&lng=-74');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
});

test('party load-more maps quota to venue_limit_reached', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS, (c) => {
        if (c.method !== 'GET') return [];
        if (c.table === 'party_members') return [{ user_id: 'host-id' }];
        if (c.table === 'parties') return [{ midpoint_lat: 40.7, midpoint_lng: -74, venue_rotation_seed: 0 }];
        return [];
    });
    mock.method(axios, 'post', async () => { throw quota(429); });
    const res = await get('/party/p1/more-venues');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
});

test('places search maps quota to venue_limit_reached', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    mock.method(axios, 'post', async () => { throw quota(429); });
    const res = await get('/discover/places/search?q=cafe');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
});

for (const status of ['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT']) {
    test(`geocoding ${status} does not say city not found`, async () => {
        mock.method(console, 'error', () => {});
        mockSupabase(USERS);
        mock.method(axios, 'get', async () => ({ data: { status, results: [] } }));
        const res = await get('/user/location/manual', { method: 'PUT', body: JSON.stringify({ city: 'Newark' }) });
        assert.equal(res.status, 503);
        assert.deepEqual(await res.json(), { error: 'venue_limit_reached' });
    });
}

test('geocoding with zero results still says city not found', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase(USERS);
    mock.method(axios, 'get', async () => ({ data: { status: 'ZERO_RESULTS', results: [] } }));
    const res = await get('/user/location/manual', { method: 'PUT', body: JSON.stringify({ city: 'Nowhereville' }) });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'city_not_found');
});
