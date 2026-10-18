import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { mockSupabase, serve, realFetch, Call } from './supabaseMock';
import { searchNearbyVenues, getVenuesWithRotation, geocodeCity, NEARBY_MEMORY_MAX } from '../src/services/places';
import { nearbyKey, PRUNE_BATCH, WRITE_LIMIT_PER_MIN } from '../src/services/googleCache';

const HOUR = 3_600_000;
const exact = { latitude: 40.712776, longitude: -74.005974 };
const googlePlace = {
    id: 'ChIJfresh',
    displayName: { text: 'Fresh Cafe' },
    formattedAddress: '9 Secret Lane',
    location: { latitude: 40.7101, longitude: -74.0102 },
    rating: 4.7,
    userRatingCount: 321,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    photos: [{ name: 'places/ChIJfresh/photos/AeYsecretphoto' }],
    primaryType: 'cafe',
    types: ['cafe'],
};
const place = (id: string) => ({ ...googlePlace, id, displayName: { text: `Place ${id}` } });
const row = (payload: unknown, ageMs = 0) => [{ payload, fetched_at: new Date(Date.now() - ageMs).toISOString() }];
const isRead = (c: Call, kind: string) => c.table === 'google_cache' && c.method === 'GET' && c.url.searchParams.get('kind') === `eq.${kind}`;
const writes = (calls: Call[]) => calls.filter((c) => c.table === 'google_cache' && c.method === 'POST');
const noDetails = () =>
    mock.method(axios, 'get', async (url: string) => {
        throw new Error(`unexpected GET ${url}`);
    });
const quotaError = (url: string) =>
    Object.assign(new Error('quota'), { config: { url }, response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } } });
const nearbyQuota = async () => {
    throw quotaError('https://places.googleapis.com/v1/places:searchNearby');
};

afterEach(() => mock.restoreAll());

test('nearby searches call Google once and never touch Supabase', async () => {
    const calls = mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [googlePlace, place('ChIJsecond')] } }));
    noDetails();
    const venues = await searchNearbyVenues({ latitude: 50, longitude: 50 }, 8000, 20);
    await getVenuesWithRotation({ center: { latitude: 50, longitude: 50 }, rotationSeed: 0 });
    assert.equal(post.mock.callCount(), 2);
    assert.deepEqual(venues.map((v) => v.google_place_id), ['ChIJfresh', 'ChIJsecond']);
    assert.deepEqual(calls, []);
});

test('a repeat view within 15 minutes costs no Google or Supabase calls', async () => {
    mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [place('ChIJwarm1'), place('ChIJwarm2')] } }));
    noDetails();
    await searchNearbyVenues({ latitude: 51, longitude: 51 }, 8000, 20);
    mock.restoreAll();
    const calls = mockSupabase({});
    const again = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    noDetails();
    const top = await searchNearbyVenues({ latitude: 51, longitude: 51 }, 8000, 1);
    assert.deepEqual(top.map((v) => v.google_place_id), ['ChIJwarm1']);
    assert.equal(post.mock.callCount() + again.mock.callCount(), 1);
    assert.equal(calls.length, 0);
});

test('in-memory venues expire after 15 minutes', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [place('ChIJttl')] } }));
    noDetails();
    await searchNearbyVenues({ latitude: 53, longitude: 53 }, 8000, 20);
    mock.timers.tick(14 * 60_000);
    await searchNearbyVenues({ latitude: 53, longitude: 53 }, 8000, 20);
    assert.equal(post.mock.callCount(), 1);
    mock.timers.tick(2 * 60_000);
    await searchNearbyVenues({ latitude: 53, longitude: 53 }, 8000, 20);
    assert.equal(post.mock.callCount(), 2);
});

test('rotation applies excludes and advances the seed', async () => {
    mockSupabase({});
    mock.method(axios, 'post', async () => ({ data: { places: [place('ChIJx1'), place('ChIJx2')] } }));
    const r = await getVenuesWithRotation({ center: { latitude: 54, longitude: 54 }, rotationSeed: 1, excludeIds: new Set(['ChIJx1']) });
    assert.deepEqual(r.venues.map((v) => v.google_place_id), ['ChIJx2']);
    assert.equal(r.newSeed, 2);
});

test('only typed-city geocodes reach the table, never venue data or exact user coordinates', async () => {
    const calls = mockSupabase({});
    mock.method(axios, 'post', async () => ({ data: { places: [googlePlace] } }));
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Secretville, ZZ, Google Formatted', geometry: { location: { lat: 30.27, lng: -97.74 } } }] },
    }));
    await searchNearbyVenues(exact, 8000, 20);
    await getVenuesWithRotation({ center: exact, rotationSeed: 0 });
    await geocodeCity('Secretville');
    const cacheCalls = calls.filter((c) => c.table === 'google_cache');
    assert.equal(writes(calls).length, 1);
    for (const c of cacheCalls) {
        const seen = decodeURIComponent(c.url.search) + JSON.stringify(c.body ?? {});
        for (const secret of ['Fresh Cafe', '9 Secret Lane', '4.7', '321', 'AeYsecretphoto', 'PRICE_LEVEL', 'ChIJ', '40.712776', '74.005974', 'Google Formatted', 'nearby']) {
            assert.ok(!seen.includes(secret), `${secret} leaked: ${seen}`);
        }
        assert.ok(!/user_?id/i.test(seen));
    }
    const [w] = writes(calls);
    assert.equal(w.body.kind, 'geocode');
    assert.deepEqual(Object.keys(w.body.payload).sort(), ['label', 'latitude', 'longitude']);
});

test('venues returned for a grid cell are fetched around the rounded center', async () => {
    mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [] } }));
    await searchNearbyVenues({ latitude: 55.123456, longitude: 55.987654 }, 8000, 20);
    const body = post.mock.calls[0].arguments[1] as any;
    assert.deepEqual(body.locationRestriction.circle.center, { latitude: 55.12, longitude: 55.99 });
});

test('geocode miss returns the Google label but stores only coordinates and the typed label', async () => {
    const calls = mockSupabase({});
    const get = mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Austin, TX, USA', geometry: { location: { lat: 30.27, lng: -97.74 } } }] },
    }));
    const found = await geocodeCity('  Austin ,  TX ');
    assert.equal(get.mock.callCount(), 1);
    assert.equal(found?.label, 'Austin, TX, USA');
    const [w] = writes(calls);
    assert.equal(w.body.kind, 'geocode');
    assert.equal(w.body.key, 'austin, tx');
    assert.deepEqual(w.body.payload, { latitude: 30.27, longitude: -97.74, label: 'Austin, TX' });
});

test('geocode hits within 24 hours skip Google and expire after', async () => {
    mockSupabase({}, (c) =>
        isRead(c, 'geocode') && c.url.searchParams.get('key') === 'eq.paris, france'
            ? row({ latitude: 48.85, longitude: 2.35, label: 'Paris, France' }, 23 * HOUR)
            : [],
    );
    const get = mock.method(axios, 'get', async () => ({ data: { status: 'OK', results: [] } }));
    assert.equal((await geocodeCity('  PARIS ', ' France'))?.label, 'Paris, France');
    assert.equal(get.mock.callCount(), 0);
    mock.restoreAll();
    mockSupabase({}, (c) => (isRead(c, 'geocode') ? row({ latitude: 1, longitude: 1, label: 'Old' }, 25 * HOUR) : []));
    const refresh = mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'New', geometry: { location: { lat: 2, lng: 2 } } }] },
    }));
    assert.equal((await geocodeCity('Somewhere'))?.label, 'New');
    assert.equal(refresh.mock.callCount(), 1);
});

test('expired geocodes are not served on a quota error', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({}, (c) => (isRead(c, 'geocode') ? row({ latitude: 1, longitude: 2, label: 'Old Town' }, 25 * HOUR) : []));
    mock.method(axios, 'get', async () => ({ data: { status: 'OVER_QUERY_LIMIT', results: [] } }));
    await assert.rejects(geocodeCity('Old Town'), { code: 'venue_limit_reached' });
});

test('quota error with nothing in memory is the limit error and reads nothing from Supabase', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase({});
    mock.method(axios, 'post', nearbyQuota);
    await assert.rejects(searchNearbyVenues({ latitude: 57, longitude: 57 }, 8000, 20), (e: any) => e?.response?.status === 429);
    assert.equal((await getVenuesWithRotation({ center: { latitude: 57, longitude: 57 }, rotationSeed: 1 })).limited, true);
    assert.deepEqual(calls, []);
});

test('discover routes fall back or return venue_limit_reached when Google is over quota and nothing is in memory', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({ tok: 'user-1' });
    mock.method(axios, 'post', nearbyQuota);
    const { default: discoverRoutes } = await import('../src/routes/discover');
    const { server, base } = await serve('/api/discover', discoverRoutes);
    try {
        const qs = 'lat=41.5&lng=-73.5';
        const first = await realFetch(`${base}/api/discover/venues?${qs}`, { headers: { authorization: 'Bearer tok' } });
        assert.equal(first.status, 200);
        assert.ok((await first.json()).every((v: any) => v.fallback === true));
        const more = await realFetch(`${base}/api/discover/venues/more?${qs}`, { headers: { authorization: 'Bearer tok' } });
        assert.equal(more.status, 503);
        assert.deepEqual(await more.json(), { error: 'venue_limit_reached' });
        assert.equal(more.headers.get('x-venue-cache'), null);
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

test('the stored geocode label is trimmed to 120 characters without splitting an emoji', async () => {
    const calls = mockSupabase({});
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'X', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    await geocodeCity(`${'a'.repeat(119)}😀bc`);
    assert.equal(writes(calls)[0].body.payload.label, `${'a'.repeat(119)}😀`);
});

test('writes prune a bounded batch of rows older than 24 hours, oldest first', async () => {
    const oldest = new Date(Date.now() - 50 * HOUR).toISOString();
    const boundary = new Date(Date.now() - 30 * HOUR).toISOString();
    const calls = mockSupabase({}, (c) =>
        c.table === 'google_cache' && c.method === 'GET' && !c.url.searchParams.has('kind')
            ? [{ fetched_at: oldest }, { fetched_at: boundary }]
            : [],
    );
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Prune', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    const started = Date.now();
    await geocodeCity('Prune Town');
    const scan = calls.find((c) => c.table === 'google_cache' && c.method === 'GET' && !c.url.searchParams.has('kind'))!;
    assert.ok(scan, 'no prune scan');
    assert.equal(scan.url.searchParams.get('limit'), String(PRUNE_BATCH));
    assert.equal(scan.url.searchParams.get('order'), 'fetched_at.asc');
    const cutoff = Date.parse(scan.url.searchParams.get('fetched_at')!.replace(/^lt\./, ''));
    assert.ok(Math.abs(started - 24 * HOUR - cutoff) < 5_000);
    const del = calls.find((c) => c.table === 'google_cache' && c.method === 'DELETE')!;
    assert.ok(del, 'no prune delete');
    assert.deepEqual(del.url.searchParams.getAll('fetched_at').sort(), [`lt.${new Date(cutoff).toISOString()}`, `lte.${boundary}`].sort());
});

test('writes with nothing expired do not delete anything', async () => {
    const calls = mockSupabase({});
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Prune', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    await geocodeCity('No Prune Town');
    assert.ok(calls.some((c) => c.table === 'google_cache' && c.method === 'GET' && !c.url.searchParams.has('kind')));
    assert.ok(!calls.some((c) => c.method === 'DELETE'));
});

test('a failing prune never breaks the request', async () => {
    mock.method(console, 'error', () => {});
    mockSupabase({}, (c) =>
        c.table === 'google_cache' && c.method === 'GET' && !c.url.searchParams.has('kind')
            ? Response.json({ message: 'boom' }, { status: 500 })
            : [],
    );
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Prune', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    assert.equal((await geocodeCity('Prune Fail Town'))?.label, 'Prune');
});

test('in-memory venue lists are bounded', async () => {
    mockSupabase({});
    const post = mock.method(axios, 'post', async () => ({ data: { places: [place('ChIJbound')] } }));
    noDetails();
    for (let i = 0; i <= NEARBY_MEMORY_MAX; i++) await searchNearbyVenues({ latitude: -60, longitude: i / 10 }, 8000, 20);
    const before = post.mock.callCount();
    await searchNearbyVenues({ latitude: -60, longitude: NEARBY_MEMORY_MAX / 10 }, 8000, 20);
    assert.equal(post.mock.callCount(), before);
    await searchNearbyVenues({ latitude: -60, longitude: 0 }, 8000, 20);
    assert.equal(post.mock.callCount(), before + 1);
});

test('cache writes are capped per minute', async () => {
    mock.method(console, 'error', () => {});
    const calls = mockSupabase({});
    mock.method(axios, 'get', async () => ({
        data: { status: 'OK', results: [{ formatted_address: 'Town', geometry: { location: { lat: 1, lng: 1 } } }] },
    }));
    for (let i = 0; i < WRITE_LIMIT_PER_MIN + 5; i++) await geocodeCity(`Town ${i}`);
    const geocodeWrites = () => writes(calls).filter((w) => w.body.kind === 'geocode').length;
    assert.ok(geocodeWrites() <= WRITE_LIMIT_PER_MIN);
    assert.ok(geocodeWrites() >= WRITE_LIMIT_PER_MIN - 10);
});
