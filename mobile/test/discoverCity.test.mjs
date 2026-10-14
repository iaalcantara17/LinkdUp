import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discoverOrigin } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const LIVE = { latitude: 40.73, longitude: -74.17 };
const CITY = { latitude: 40.71, longitude: -74.0, label: 'New York, NY' };

test('live location wins, then a picked city, otherwise ask', () => {
    assert.deepEqual(discoverOrigin({ ok: true, coords: LIVE }, CITY), { coords: LIVE, live: true });
    assert.deepEqual(discoverOrigin({ ok: false, reason: 'denied' }, CITY), { coords: { latitude: 40.71, longitude: -74.0 }, live: false });
    assert.equal(discoverOrigin({ ok: false, reason: 'prompt' }, null), null);
});

test('discover offers Pick a city with the same place search as the lobby', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /Pick a city/);
    assert.match(discover, /<PlaceSearch/);
    assert.match(discover, /if \(origin\.live\) api\.updateLocation/);
    assert.match(read('components/LocationSourceCard.tsx'), /<PlaceSearch/);
});
