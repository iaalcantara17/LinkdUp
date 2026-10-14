import './env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLocation, LIVE_MAX_AGE_MS } from '../src/services/memberLocation';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const fresh = new Date(NOW - 60_000).toISOString();
const stale = new Date(NOW - LIVE_MAX_AGE_MS - 1).toISOString();
const LIVE = { live_latitude: 40.0, live_longitude: -75.0 };
const CUSTOM = { custom_latitude: 41.0, custom_longitude: -73.0, custom_label: 'Hoboken, NJ' };

test('live readings expire after three hours', () => {
    assert.equal(LIVE_MAX_AGE_MS, 3 * 60 * 60 * 1000);
});

test('a fresh live reading is used by default', () => {
    assert.deepEqual(effectiveLocation({ ...LIVE, live_at: fresh, location_mode: 'live' }, NOW), { latitude: 40, longitude: -75 });
});

test('custom mode wins over a fresh live reading', () => {
    assert.deepEqual(effectiveLocation({ ...LIVE, live_at: fresh, ...CUSTOM, location_mode: 'custom' }, NOW), { latitude: 41, longitude: -73 });
});

test('a stale live reading falls back to the custom place', () => {
    assert.deepEqual(effectiveLocation({ ...LIVE, live_at: stale, ...CUSTOM, location_mode: 'live' }, NOW), { latitude: 41, longitude: -73 });
});

test('custom mode without a custom place falls back to a fresh live reading', () => {
    assert.deepEqual(effectiveLocation({ ...LIVE, live_at: fresh, location_mode: 'custom' }, NOW), { latitude: 40, longitude: -75 });
});

test('stale live with no custom place gives nothing', () => {
    assert.equal(effectiveLocation({ ...LIVE, live_at: stale, location_mode: 'live' }, NOW), null);
});

test('callers can allow older live readings', () => {
    assert.deepEqual(effectiveLocation({ ...LIVE, live_at: stale, location_mode: 'live' }, NOW, Infinity), { latitude: 40, longitude: -75 });
});

test('missing or broken values give nothing', () => {
    assert.equal(effectiveLocation({}, NOW), null);
    assert.equal(effectiveLocation(null, NOW), null);
    assert.equal(effectiveLocation({ live_latitude: NaN, live_longitude: -75, live_at: fresh }, NOW), null);
    assert.equal(effectiveLocation({ live_latitude: 40, live_longitude: -75, live_at: 'not a date' }, NOW), null);
    assert.equal(effectiveLocation({ live_latitude: 40, live_longitude: -75 }, NOW), null);
    assert.equal(effectiveLocation({ custom_latitude: 41, custom_longitude: null, location_mode: 'custom' }, NOW), null);
});
