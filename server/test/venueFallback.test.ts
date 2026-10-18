import './env';
import { test, mock, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import axios from 'axios';
import partyRoutes from '../src/routes/party';
import discoverRoutes from '../src/routes/discover';
import { FALLBACK_PITCH } from '../src/services/aiPitch';
import { POPULAR_SPOTS } from '../src/services/fallbackVenues';
import { mockSupabase, serve, auth, realFetch, Call } from './supabaseMock';

const USERS = { 'tok-alice': 'alice-id' };
const quota = () =>
    Object.assign(new Error('Request failed with status code 429'), {
        isAxiosError: true,
        config: { url: 'https://places.googleapis.com/v1/places:searchNearby' },
        response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } },
    });
const live = { id: 'ChIJlive', displayName: { text: 'Live Cafe' }, primaryType: 'cafe', types: ['cafe'], location: { latitude: 33.01, longitude: -97.01 } };

let app: { server: Server; base: string };
before(async () => {
    const router = express.Router();
    router.use('/party', partyRoutes);
    router.use('/discover', discoverRoutes);
    app = await serve('/api', router);
});
after(() => app.server.close());
afterEach(() => {
    mock.restoreAll();
    delete process.env.ENABLE_GEMINI_PITCHES;
    delete process.env.GEMINI_API_KEY;
});

const call = (path: string, init: RequestInit = {}) => realFetch(`${app.base}/api${path}`, { ...init, headers: { ...auth('tok-alice'), 'content-type': 'application/json' } });

const partyDb = (lat: number) => (c: Call) => {
    if (c.method !== 'GET') return [];
    if (c.table === 'parties') return [{ id: 'p1', host_user_id: 'alice-id', status: 'waiting' }];
    if (c.table === 'party_members') return [{ user_id: 'alice-id', custom_latitude: lat, custom_longitude: -97, custom_label: 'Town', location_mode: 'custom' }];
    return [];
};

function assertFallbackList(venues: any[]) {
    assert.equal(venues.length, POPULAR_SPOTS.length);
    assert.ok(venues.length >= 6);
    for (const v of venues) {
        assert.equal(v.fallback, true);
        assert.match(v.google_place_id, /^demo-[a-z-]+$/);
        assert.match(v.photo_url, /^\/demo\/venue-[a-z-]+\.jpg$/);
        assert.ok(v.name && v.address && typeof v.latitude === 'number' && typeof v.longitude === 'number');
    }
}

test('discover venues on a quota error returns the popular spots flagged as fallback without more Google calls or reading stored rows', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase(USERS);
    const post = mock.method(axios, 'post', async () => { throw quota(); });
    const get = mock.method(axios, 'get', async () => { throw new Error('unexpected Google GET'); });
    const res = await call('/discover/venues?lat=31.5&lng=-97');
    assert.equal(res.status, 200);
    assertFallbackList(await res.json());
    assert.equal(post.mock.callCount(), 1);
    assert.equal(get.mock.callCount(), 0);
    assert.deepEqual(calls.filter((c) => c.table !== 'users'), []);
});

test('discover venues with Google working are not flagged as fallback', async () => {
    mockSupabase(USERS);
    mock.method(axios, 'post', async () => ({ data: { places: [live] } }));
    const res = await call('/discover/venues?lat=32.5&lng=-97');
    assert.equal(res.status, 200);
    const venues = await res.json();
    assert.deepEqual(venues.map((v: any) => v.google_place_id), ['ChIJlive']);
    assert.equal(venues[0].fallback, undefined);
});

test('party start on a quota error returns the popular spots and saves nothing to the party', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase(USERS, partyDb(34.5));
    const post = mock.method(axios, 'post', async () => { throw quota(); });
    const res = await call('/party/p1/start', { method: 'POST' });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'venue_limit_reached');
    assert.equal(body.fallback, true);
    assertFallbackList(body.venues);
    assert.equal(post.mock.callCount(), 1);
    assert.deepEqual(calls.filter((c) => c.method !== 'GET'), []);
});

test('party start with Google working saves live venues and has no fallback flag', async () => {
    const calls = mockSupabase(USERS, partyDb(35.5));
    mock.method(axios, 'post', async () => ({ data: { places: [live] } }));
    const res = await call('/party/p1/start', { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.fallback, undefined);
    const insert = calls.find((c) => c.table === 'locations' && c.method === 'POST')!;
    assert.deepEqual(insert.body.map((r: any) => r.google_place_id), ['ChIJlive']);
});

test('the pitch for a popular spot never calls Gemini even when pitches are on', async () => {
    process.env.ENABLE_GEMINI_PITCHES = 'true';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    mockSupabase(USERS);
    const post = mock.method(axios, 'post', async () => ({ data: { candidates: [{ content: { parts: [{ text: 'AI pitch' }] } }] } }));
    const res = await call(`/discover/pitch?name=${encodeURIComponent(POPULAR_SPOTS[0].name)}`);
    assert.deepEqual(await res.json(), { pitch: FALLBACK_PITCH });
    assert.equal(post.mock.callCount(), 0);
});

test('a popular spot has no Google photo link', () => {
    for (const v of POPULAR_SPOTS) assert.ok(!String(v.photo_url).includes('/api/photo'));
});
