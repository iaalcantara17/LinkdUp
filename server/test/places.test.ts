import './env';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import { searchNearbyVenues, getVenuesWithRotation, ROTATION_COUNT } from '../src/services/places';

const KEY = process.env.GOOGLE_MAPS_API_KEY!;
const center = { latitude: 40.7, longitude: -74 };
const newPlace = {
    id: 'ChIJnew',
    displayName: { text: 'Cafe One' },
    primaryType: 'cafe',
    types: ['cafe'],
    photos: [{ name: 'places/ChIJnew/photos/AeYphoto-1' }],
};
const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.photos',
    'places.primaryType',
    'places.types',
].join(',');

afterEach(() => mock.restoreAll());

test('new API venues get a keyless proxy photo_url', async () => {
    mock.method(axios, 'post', async () => ({ data: { places: [newPlace] } }));
    const [v] = await searchNearbyVenues(center);
    assert.equal(v.photo_url, '/api/photo?name=places%2FChIJnew%2Fphotos%2FAeYphoto-1');
    const rotated = await getVenuesWithRotation({ center });
    assert.equal(rotated.venues[0].photo_url, v.photo_url);
    assert.ok(!JSON.stringify(rotated).includes(KEY));
});

test('load-more pages from the stored midpoint through searchNearby only', async () => {
    const post = mock.method(axios, 'post', async () => ({ data: { places: [newPlace] } }));
    const get = mock.method(axios, 'get', async () => {
        throw new Error('legacy GET not allowed');
    });
    const midpoint = { latitude: 40.8, longitude: -74.1 };
    for (let seed = 0; seed < ROTATION_COUNT; seed++) {
        const r = await getVenuesWithRotation({ center: midpoint, rotationSeed: seed });
        assert.equal(r.newSeed, seed + 1);
    }
    assert.equal(get.mock.callCount(), 0);
    assert.equal(post.mock.callCount(), ROTATION_COUNT);
    for (const call of post.mock.calls) {
        const [url, body, opts] = call.arguments as any[];
        assert.equal(url, 'https://places.googleapis.com/v1/places:searchNearby');
        assert.deepEqual(body.locationRestriction.circle.center, midpoint);
        for (const t of body.includedTypes) assert.match(t, /^[a-z]+(_[a-z]+)*$/);
        assert.equal(opts.headers['X-Goog-FieldMask'], FIELD_MASK);
    }
    const done = await getVenuesWithRotation({ center: midpoint, rotationSeed: ROTATION_COUNT });
    assert.equal(done.exhausted, true);
});

test('server source has no legacy Places API calls', () => {
    const src = join(__dirname, '..', 'src');
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
    const hits = files.filter((f) =>
        /maps\.googleapis\.com\/maps\/api\/place|nearbysearch|textsearch|photo_?reference|\bpagetoken\b/.test(
            readFileSync(join(src, f), 'utf8'),
        ),
    );
    assert.deepEqual(hits, []);
});

const DAY = 24 * 60 * 60_000;

test('nearby searches stop at a daily ceiling below the Google cap and read as a quota error', async () => {
    const { NEARBY_CALLS_PER_DAY } = await import('../src/services/places');
    const { isGoogleQuotaError } = await import('../src/middleware/error');
    mock.timers.reset();
    mock.timers.enable({ apis: ['Date'], now: Date.now() + 10 * DAY });
    try {
        const post = mock.method(axios, 'post', async () => ({ data: { places: [newPlace] } }));
        assert.ok(NEARBY_CALLS_PER_DAY < 300);
        const cell = (i: number) => ({ latitude: 10 + (i % 100) * 0.01, longitude: 10 + Math.floor(i / 100) * 0.01 });
        for (let i = 0; i < NEARBY_CALLS_PER_DAY; i++) await searchNearbyVenues(cell(i));
        assert.equal(post.mock.callCount(), NEARBY_CALLS_PER_DAY);
        const err = await searchNearbyVenues(cell(NEARBY_CALLS_PER_DAY)).then(() => null, (e) => e);
        assert.equal(err?.code, 'venue_limit_reached');
        assert.equal(isGoogleQuotaError(err), true);
        assert.equal(post.mock.callCount(), NEARBY_CALLS_PER_DAY);
        assert.equal((await searchNearbyVenues(cell(NEARBY_CALLS_PER_DAY - 1))).length, 1);
        const rotated = await getVenuesWithRotation({ center: { latitude: -20, longitude: -20 } });
        assert.equal(rotated.limited, true);
        mock.timers.tick(DAY);
        await searchNearbyVenues(cell(NEARBY_CALLS_PER_DAY + 1));
        assert.equal(post.mock.callCount(), NEARBY_CALLS_PER_DAY + 1);
    } finally {
        mock.timers.reset();
    }
});
