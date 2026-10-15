import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discoverStep } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const LIVE = { latitude: 40.73, longitude: -74.17 };
const CITY = { latitude: 40.71, longitude: -74.0, label: 'New York, NY' };
const CITY_ORIGIN = { coords: { latitude: 40.71, longitude: -74.0 }, live: false };

test('live location wins, then a picked city, otherwise ask', () => {
    assert.deepEqual(discoverStep({ ok: true, coords: LIVE }, CITY, false), { origin: { coords: LIVE, live: true }, issue: null });
    assert.deepEqual(discoverStep({ ok: false, reason: 'prompt' }, CITY, false), { origin: CITY_ORIGIN, issue: null });
    assert.deepEqual(discoverStep({ ok: false, reason: 'prompt' }, null, false), { origin: null, issue: 'prompt' });
});

test('asking for live location with a city picked reports why it failed and keeps the city', () => {
    for (const reason of ['denied', 'unavailable', 'timeout']) {
        assert.deepEqual(discoverStep({ ok: false, reason }, CITY, true), { origin: CITY_ORIGIN, issue: reason });
    }
});

test('Use my live location instead asks for live location and shows the failure next to the city', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /discoverStep\(reading, picked\.current, prompt\)/);
    assert.match(discover, /pickedLabel && locationIssue/);
    assert.match(discover, /accessibilityRole="alert"/);
});

test('discover offers Pick a city with the same place search as the lobby', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /Pick a city/);
    assert.match(discover, /<PlaceSearch/);
    assert.match(discover, /if \(origin\.live\) api\.updateLocation/);
    assert.match(read('components/LocationSourceCard.tsx'), /<PlaceSearch/);
});

test('a picked city is used right away and live location can be restored', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /picked\.current && !prompt/);
    assert.match(discover, /Use my live location instead/);
});
