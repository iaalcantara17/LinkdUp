import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watchWebPermission, permissionLabel } from '../src/services/locationChoice.ts';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

function fakeStatus(state) {
    const listeners = new Set();
    return {
        state,
        addEventListener: (type, fn) => type === 'change' && listeners.add(fn),
        removeEventListener: (type, fn) => listeners.delete(fn),
        flip(next) { this.state = next; for (const fn of listeners) fn(); },
        listeners,
    };
}

test('reports the current permission and every change from the browser site settings', async () => {
    const status = fakeStatus('granted');
    const seen = [];
    const stop = watchWebPermission({ permissions: { query: async () => status } }, (s) => seen.push(s));
    await tick();
    status.flip('denied');
    status.flip('granted');
    assert.deepEqual(seen, ['granted', 'denied', 'granted']);
    stop();
    status.flip('prompt');
    assert.deepEqual(seen, ['granted', 'denied', 'granted']);
    assert.equal(status.listeners.size, 0);
});

test('stopping before the query answers never subscribes', async () => {
    const status = fakeStatus('prompt');
    const seen = [];
    watchWebPermission({ permissions: { query: async () => status } }, (s) => seen.push(s))();
    await tick();
    assert.deepEqual(seen, []);
    assert.equal(status.listeners.size, 0);
});

test('no Permissions API or a failed query is unknown', async () => {
    const seen = [];
    watchWebPermission({}, (s) => seen.push(s));
    watchWebPermission(undefined, (s) => seen.push(s));
    watchWebPermission({ permissions: { query: async () => { throw new Error('nope'); } } }, (s) => seen.push(s));
    await tick();
    assert.deepEqual(seen, ['unknown', 'unknown', 'unknown']);
});

test('permission state reads in plain words', () => {
    assert.equal(permissionLabel('granted'), 'Browser location: Allowed');
    assert.equal(permissionLabel('denied'), 'Browser location: Blocked');
    assert.equal(permissionLabel('prompt'), 'Browser location: Not asked yet');
    assert.equal(permissionLabel('unknown'), null);
});

test('Discover and the lobby card follow permission changes and show the state', () => {
    for (const file of ['screens/DiscoverScreen.tsx', 'components/LocationSourceCard.tsx']) {
        const src = read(file);
        assert.match(src, /useLocationPermission\(\)/, file);
        assert.match(src, /permissionLabel\(permission\)/, file);
    }
    assert.match(read('components/LocationSourceCard.tsx'), /permission !== 'denied'/);
});

test('a late permission event never wipes the message for a failed request, and never saves live before the saved choice is known', () => {
    const discover = read('screens/DiscoverScreen.tsx');
    assert.match(discover, /if \(picked\.current\) \{\s*if \(permission === 'granted'\) setLocationIssue\(null\);/);
    assert.match(discover, /if \(prompt\) \{\s*locatingRef\.current = false;\s*setLocating\(false\);/);
    assert.match(discover, /disabled=\{cityOpen \|\| locating\}/);
    const card = read('components/LocationSourceCard.tsx');
    assert.match(card, /if \(permission !== 'granted'\) return setLiveIssue/);
    assert.match(card, /setError\(null\);\s*setLiveIssue\(null\);\s*if \(myLocation && myLocation\.mode !== 'custom'\) takeLive\(false\);/);
});
