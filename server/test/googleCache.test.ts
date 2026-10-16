import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { mockSupabase, serve, realFetch, Call } from './supabaseMock';
import { searchNearbyVenues, getVenuesWithRotation, geocodeCity } from '../src/services/places';
import { nearbyKey, WRITE_LIMIT_PER_MIN } from '../src/services/googleCache';
import photoRoutes from '../src/routes/photo';

const HOUR = 3_600_000;
const exact = { latitude: 40.712776, longitude: -74.005974 };
const venue = {
    google_place_id: 'ChIJcached', name: 'Cached Cafe', address: '1 Main St',
    latitude: 40.71, longitude: -74.0, photo_url: null, rating: 4.5,
    user_ratings_total: 10, category: 'Cafe', price_level: 1,
};
const googlePlace = { id: 'ChIJfresh', displayName: { text: 'Fresh Cafe' }, primaryType: 'cafe', types: ['cafe'] };
const row = (payload: unknown, ageMs = 0) => [{ payload, fetched_at: new Date(Date.now() - ageMs).toISOString() }];
const isRead = (c: Call, kind: string) => c.table === 'google_cache' && c.method === 'GET' && c.url.searchParams.get('kind') === `eq.${kind}`;
const writes = (calls: Call[]) => calls.filter((c) => c.table === 'google_cache' && c.method === 'POST');

afterEach(() => mock.restoreAll());

test('nearby cache hit avoids the Google call', async () => {
    mockSupabase({}, (c) => (isRead(c, 'nearby') ? row([venue], HOUR) : []));
    const post = mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    const venues = await searchNearbyVenues(exact, 8000, 20);
    assert.equal(post.mock.callCount(), 0);
    assert.equal(venues[0].google_place_id, 'ChIJcached');
});

test('rotation cache hit avoids the Google call and still applies excludes', async () => {
    mockSupabase({}, (c) => (isRead(c, 'nearby') ? row([venue, { ...venue, google_place_id: 'ChIJother' }]) : []));
    const post = mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    const r = await getVenuesWithRotation({ center: exact, rotationSeed: 1, excludeIds: new Set(['ChIJcached']) });
    assert.equal(post.mock.callCount(), 0);
    assert.deepEqual(r.venues.map((v) => v.google_place_id), ['ChIJother']);
    assert.equal(r.newSeed, 2);
});

test('nearby miss calls Google once and stores the result', async () => {
    const calls = mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    const venues = await searchNearbyVenues(exact, 8000, 20);
    assert.equal(post.mock.callCount(), 1);
    assert.equal(venues[0].google_place_id, 'ChIJfresh');
    const [w] = writes(calls);
    assert.equal(w.body.kind, 'nearby');
    assert.equal(w.body.payload[0].google_place_id, 'ChIJfresh');
    assert.equal(w.url.searchParams.get('on_conflict'), 'kind,key');
});

test('expired nearby entry refreshes from Google', async () => {
    const calls = mockSupabase({}, (c) => (isRead(c, 'nearby') ? row([venue], 25 * HOUR) : []));
    const post = mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    const venues = await searchNearbyVenues(exact, 8000, 20);
    assert.equal(post.mock.callCount(), 1);
    assert.equal(venues[0].google_place_id, 'ChIJfresh');
    assert.equal(writes(calls).length, 1);
});

test('no exact coordinates reach the cache key or the cache table', async () => {
    const calls = mockSupabase({});
    mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    await searchNearbyVenues(exact, 8000, 20);
    await getVenuesWithRotation({ center: exact, rotationSeed: 0 });
    const cacheCalls = calls.filter((c) => c.table === 'google_cache');
    assert.ok(cacheCalls.length >= 4);
    for (const c of cacheCalls) {
        const seen = decodeURIComponent(c.url.search) + JSON.stringify(c.body ?? {});
        assert.ok(!seen.includes('40.712776') && !seen.includes('74.005974'), seen);
        assert.ok(!/user_?id/i.test(seen));
    }
    for (const w of writes(calls)) assert.match(w.body.key, /^40\.71,-74\.01\|/);
});

test('venues returned for a grid cell are fetched around the rounded center', async () => {
    mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    await searchNearbyVenues(exact, 8000, 20);
    const body = post.mock.calls[0].arguments[1] as any;
    assert.deepEqual(body.locationRestriction.circle.center, { latitude: 40.71, longitude: -74.01 });
});

test('geocode cache hit avoids the Google call using a normalized query', async () => {
    mockSupabase({}, (c) =>
        isRead(c, 'geocode') && c.url.searchParams.get('key') === 'eq.paris, france'
            ? row({ latitude: 48.85, longitude: 2.35, label: 'Paris, France' }, 20 * 24 * HOUR)
            : [],
    );
    const get = mock.method(axios, 'get', async () => ({ data: { status: 'OK', results: [] } }));
    const place = await geocodeCity('  PARIS ', ' France');
    assert.equal(get.mock.callCount(), 0);
    assert.equal(place?.label, 'Paris, France');
});

test('geocode miss calls Google once and stores the result', async () => {
    const calls = mockSupabase({});
    const get = mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Austin, TX, USA', geometry: { location: { lat: 30.27, lng: -97.74 } } }] },
    }));
    const place = await geocodeCity('Austin');
    assert.equal(get.mock.callCount(), 1);
    assert.equal(place?.label, 'Austin, TX, USA');
    const [w] = writes(calls);
    assert.equal(w.body.kind, 'geocode');
    assert.equal(w.body.key, 'austin');
});

test('expired geocode entry refreshes from Google', async () => {
    mockSupabase({}, (c) => (isRead(c, 'geocode') ? row({ latitude: 1, longitude: 1, label: 'Old' }, 31 * 24 * HOUR) : []));
    const get = mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'New', geometry: { location: { lat: 2, lng: 2 } } }] },
    }));
    const place = await geocodeCity('Somewhere');
    assert.equal(get.mock.callCount(), 1);
    assert.equal(place?.label, 'New');
});

const quotaError = (url: string) =>
    Object.assign(new Error('quota'), { config: { url }, response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } } });
const nearbyQuota = async () => {
    throw quotaError('https://places.googleapis.com/v1/places:searchNearby');
};

test('nearby quota error serves the stale cached result and flags it', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({}, (c) => (isRead(c, 'nearby') ? row([venue], 3 * 24 * HOUR) : []));
    mock.method(axios, 'post', nearbyQuota);
    const venues = await searchNearbyVenues(exact, 8000, 20);
    assert.equal(venues[0].google_place_id, 'ChIJcached');
    assert.equal(venues.cached, true);
});

test('nearby quota error with no cache still raises the limit error', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({});
    mock.method(axios, 'post', nearbyQuota);
    await assert.rejects(searchNearbyVenues(exact, 8000, 20), (e: any) => e?.response?.status === 429);
});

test('rotation quota error serves stale venues instead of the limit flag', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({}, (c) => (isRead(c, 'nearby') ? row([venue], 3 * 24 * HOUR) : []));
    mock.method(axios, 'post', nearbyQuota);
    const r = await getVenuesWithRotation({ center: exact, rotationSeed: 2 });
    assert.equal(r.limited, undefined);
    assert.equal(r.cached, true);
    assert.equal(r.venues[0].google_place_id, 'ChIJcached');
    assert.equal(r.newSeed, 3);
});

test('rotation quota error with no cache keeps the limit flag', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({});
    mock.method(axios, 'post', nearbyQuota);
    const r = await getVenuesWithRotation({ center: exact, rotationSeed: 2 });
    assert.equal(r.limited, true);
});

test('geocode quota error serves the stale cached place and flags it', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({}, (c) => (isRead(c, 'geocode') ? row({ latitude: 1, longitude: 2, label: 'Old Town' }, 40 * 24 * HOUR) : []));
    mock.method(axios, 'get', async () => ({ data: { status: 'OVER_QUERY_LIMIT', results: [] } }));
    const place = await geocodeCity('Old Town');
    assert.deepEqual(place, { latitude: 1, longitude: 2, label: 'Old Town', cached: true });
});

test('discover load-more says the venues are cached when Google is over quota', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({ tok: 'user-1' }, (c) => (isRead(c, 'nearby') ? row([venue], 3 * 24 * HOUR) : []));
    mock.method(axios, 'post', nearbyQuota);
    const { default: discoverRoutes } = await import('../src/routes/discover');
    const { server, base } = await serve('/api/discover', discoverRoutes);
    try {
        const qs = `lat=${exact.latitude}&lng=${exact.longitude}`;
        const more = await realFetch(`${base}/api/discover/venues/more?${qs}`, { headers: { authorization: 'Bearer tok' } });
        assert.equal(more.status, 200);
        assert.equal(more.headers.get('x-venue-cache'), 'stale');
        assert.equal((await more.json()).cached, true);
        const first = await realFetch(`${base}/api/discover/venues?${qs}`, { headers: { authorization: 'Bearer tok' } });
        assert.equal(first.status, 200);
        assert.equal(first.headers.get('x-venue-cache'), 'stale');
    } finally {
        server.close();
    }
});

test('stale photo URI is used when the Google media call is over quota', async () => {
    mock.method(console, 'error', () => {});
    const urls: string[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
        urls.push(url);
        if (url.startsWith('http://localhost:54321/rest/v1/google_cache')) {
            return Response.json(init?.method === 'POST' ? [] : row({ uri: 'https://lh3.googleusercontent.com/p/old' }, 3 * 24 * HOUR));
        }
        if (url.startsWith('https://places.googleapis.com/')) return Response.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
        return new Response(Buffer.from([9, 9]), { headers: { 'content-type': 'image/jpeg' } });
    });
    const { server, base } = await serve('/api/photo', photoRoutes);
    try {
        const res = await fetch(`${base}/api/photo?name=${encodeURIComponent('places/ChIJstale/photos/AeYstale')}`);
        assert.equal(res.status, 200);
        assert.ok(urls.includes('https://lh3.googleusercontent.com/p/old'));
    } finally {
        server.close();
    }
});

test('persisted photo URI lets a fresh process skip the Google media call', async () => {
    const urls: string[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
        urls.push(url);
        if (url.startsWith('http://localhost:54321/rest/v1/google_cache')) {
            return Response.json(init?.method === 'POST' ? [] : row({ uri: 'https://lh3.googleusercontent.com/p/cached' }));
        }
        if (url.startsWith('https://lh3.googleusercontent.com/p/cached')) {
            return new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
        }
        return new Response('unexpected', { status: 500 });
    });
    const { server, base } = await serve('/api/photo', photoRoutes);
    try {
        const res = await fetch(`${base}/api/photo?name=${encodeURIComponent('places/ChIJdb/photos/AeYdb')}`);
        assert.equal(res.status, 200);
        assert.ok(!urls.some((u) => u.startsWith('https://places.googleapis.com/')), urls.join('\n'));
    } finally {
        server.close();
    }
});

for (const bad of [
    { latitude: 95, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity },
]) {
    test(`invalid coordinates ${JSON.stringify(bad)} are rejected before Google or the cache`, async () => {
        const calls = mockSupabase({});
        const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
        await assert.rejects(searchNearbyVenues(bad), { status: 400, code: 'invalid_coordinates' });
        await assert.rejects(getVenuesWithRotation({ center: bad }), { status: 400, code: 'invalid_coordinates' });
        assert.equal(post.mock.callCount(), 0);
        assert.equal(calls.length, 0);
    });
}

test('discover load-more rejects out-of-range coordinates with 400', async () => {
    mockSupabase({ tok: 'user-1' });
    const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    const { default: discoverRoutes } = await import('../src/routes/discover');
    const { server, base } = await serve('/api/discover', discoverRoutes);
    try {
        const res = await realFetch(`${base}/api/discover/venues/more?lat=95&lng=0`, { headers: { authorization: 'Bearer tok' } });
        assert.equal(res.status, 400);
        assert.equal(post.mock.callCount(), 0);
    } finally {
        server.close();
    }
});

test('nearby keys reject malformed types, radius and page', () => {
    const c = { latitude: 1, longitude: 2 };
    assert.throws(() => nearbyKey(c, 8000, ['cafe;drop'], 0));
    assert.throws(() => nearbyKey(c, 8000, [], 0));
    assert.throws(() => nearbyKey(c, 8500, ['cafe'], 0));
    assert.throws(() => nearbyKey(c, 999_000, ['cafe'], 0));
    assert.throws(() => nearbyKey(c, 8000, ['cafe'], -1));
    assert.throws(() => nearbyKey(c, 8000, ['cafe'], 1.5));
    assert.equal(nearbyKey(c, 8000, ['cafe', 'bar'], 3), '1.00,2.00|r8000|cafe,bar|p3');
});

test('overlong geocode query is rejected without calling Google', async () => {
    mockSupabase({});
    const get = mock.method(axios, 'get', async () => ({ data: { status: 'OK', results: [] } }));
    await assert.rejects(geocodeCity('x'.repeat(201)), { status: 400, code: 'invalid_query' });
    assert.equal(get.mock.callCount(), 0);
});

test('long photo names are stored under a short fixed-length key', async () => {
    const posts: any[] = [];
    mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
        if (url.startsWith('http://localhost:54321/')) {
            if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
            return Response.json([]);
        }
        if (url.startsWith('https://places.googleapis.com/')) return Response.json({ photoUri: 'https://lh3.googleusercontent.com/p/x' });
        return new Response(Buffer.from([1]), { headers: { 'content-type': 'image/jpeg' } });
    });
    const { server, base } = await serve('/api/photo', photoRoutes);
    try {
        const name = `places/ChIJlong/photos/${'A'.repeat(1000)}`;
        assert.equal((await fetch(`${base}/api/photo?name=${encodeURIComponent(name)}`)).status, 200);
        assert.equal(posts.length, 1);
        assert.match(posts[0].key, /^[0-9a-f]{64}$/);
    } finally {
        server.close();
    }
});

test('oversized payloads are served but not written to the cache', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase({});
    const huge = Array.from({ length: 20 }, (_, i) => ({ ...googlePlace, id: `ChIJ${i}`, displayName: { text: 'x'.repeat(5000) } }));
    mock.method(axios, 'post', async () => ({ data: { places: huge } }));
    const venues = await searchNearbyVenues({ latitude: 10, longitude: 10 }, 8000, 20);
    assert.equal(venues.length, 20);
    assert.equal(writes(calls).length, 0);
});

test('multibyte payloads over the byte cap are not written', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase({});
    const wide = Array.from({ length: 20 }, (_, i) => ({ ...googlePlace, id: `ChIJw${i}`, displayName: { text: 'é'.repeat(2000) } }));
    mock.method(axios, 'post', async () => ({ data: { places: wide } }));
    await searchNearbyVenues({ latitude: 11, longitude: 11 }, 8000, 20);
    assert.equal(writes(calls).length, 0);
});

test('empty nearby results are not cached', async () => {
    const calls = mockSupabase({});
    mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    assert.deepEqual(await searchNearbyVenues({ latitude: 12, longitude: 12 }, 8000, 20), []);
    assert.equal(writes(calls).length, 0);
});

test('cache writes are capped per minute', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase({});
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Town', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    for (let i = 0; i < WRITE_LIMIT_PER_MIN + 5; i++) await geocodeCity(`Town ${i}`);
    assert.ok(writes(calls).length <= WRITE_LIMIT_PER_MIN);
    assert.ok(writes(calls).length >= WRITE_LIMIT_PER_MIN - 10);
    mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    await searchNearbyVenues({ latitude: 13, longitude: 13 }, 8000, 20);
    assert.equal(writes(calls).filter((w) => w.body.kind === 'nearby').length, 1);
});
