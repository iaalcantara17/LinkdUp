import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseLocation, readWebLocation } from '../src/services/locationChoice.ts';

const HERE = { latitude: 40.7128, longitude: -74.006 };
const LIVE_OK = { ok: true };
const CUSTOM = { label: 'Hoboken, NJ' };

test('fallback order: live, then custom, then ask', () => {
    assert.deepEqual(chooseLocation({ preferCustom: false, live: LIVE_OK, custom: CUSTOM }), { kind: 'live' });
    assert.deepEqual(chooseLocation({ preferCustom: false, live: { ok: false, reason: 'denied' }, custom: CUSTOM }), { kind: 'custom', label: 'Hoboken, NJ' });
    assert.deepEqual(chooseLocation({ preferCustom: false, live: { ok: false, reason: 'timeout' }, custom: null }), { kind: 'ask', reason: 'timeout' });
});

test('a chosen custom place wins over a live reading', () => {
    assert.deepEqual(chooseLocation({ preferCustom: true, live: LIVE_OK, custom: CUSTOM }), { kind: 'custom', label: 'Hoboken, NJ' });
});

test('custom preference without a custom place falls back to live, then ask', () => {
    assert.deepEqual(chooseLocation({ preferCustom: true, live: LIVE_OK, custom: null }), { kind: 'live' });
    assert.deepEqual(chooseLocation({ preferCustom: true, live: { ok: false, reason: 'prompt' }, custom: null }), { kind: 'ask', reason: 'prompt' });
});

test('no live result yet asks with the prompt reason', () => {
    assert.deepEqual(chooseLocation({ preferCustom: false, live: null, custom: null }), { kind: 'ask', reason: 'prompt' });
});

function fakeNav({ state, position, error, never } = {}) {
    const calls = [];
    return {
        calls,
        permissions: state === undefined ? undefined : { query: async (d) => { calls.push(['query', d.name]); return { state }; } },
        geolocation: {
            getCurrentPosition(ok, fail, opts) {
                calls.push(['read', opts]);
                if (never) return;
                if (error) fail({ code: error });
                else ok({ coords: position ?? HERE });
            },
        },
    };
}

test('granted permission reads a fresh position without asking', async () => {
    const nav = fakeNav({ state: 'granted' });
    const r = await readWebLocation(nav, { prompt: false });
    assert.deepEqual(r, { ok: true, coords: HERE });
    const [, opts] = nav.calls.find((c) => c[0] === 'read');
    assert.ok(opts.timeout > 0 && opts.maximumAge <= 60_000);
});

test('prompt state waits for the member to tap before asking the browser', async () => {
    const nav = fakeNav({ state: 'prompt' });
    assert.deepEqual(await readWebLocation(nav, { prompt: false }), { ok: false, reason: 'prompt' });
    assert.equal(nav.calls.filter((c) => c[0] === 'read').length, 0);
    assert.deepEqual(await readWebLocation(nav, { prompt: true }), { ok: true, coords: HERE });
});

test('without the Permissions API the browser is not asked until the member taps', async () => {
    const nav = fakeNav({});
    assert.deepEqual(await readWebLocation(nav, { prompt: false }), { ok: false, reason: 'prompt' });
    assert.deepEqual(await readWebLocation(nav, { prompt: true }), { ok: true, coords: HERE });
});

test('denied permission is reported without asking again', async () => {
    const nav = fakeNav({ state: 'denied' });
    assert.deepEqual(await readWebLocation(nav, { prompt: true }), { ok: false, reason: 'denied' });
    assert.equal(nav.calls.filter((c) => c[0] === 'read').length, 0);
});

test('geolocation errors map to denied, unavailable and timeout', async () => {
    assert.deepEqual(await readWebLocation(fakeNav({ state: 'granted', error: 1 }), { prompt: true }), { ok: false, reason: 'denied' });
    assert.deepEqual(await readWebLocation(fakeNav({ state: 'granted', error: 2 }), { prompt: true }), { ok: false, reason: 'unavailable' });
    assert.deepEqual(await readWebLocation(fakeNav({ state: 'granted', error: 3 }), { prompt: true }), { ok: false, reason: 'timeout' });
});

test('no geolocation support is unavailable', async () => {
    assert.deepEqual(await readWebLocation({}, { prompt: true }), { ok: false, reason: 'unavailable' });
    assert.deepEqual(await readWebLocation(undefined, { prompt: true }), { ok: false, reason: 'unavailable' });
});

test('a browser that never answers times out', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const pending = readWebLocation(fakeNav({ state: 'granted', never: true }), { prompt: true, timeoutMs: 5000 });
        await new Promise((r) => setImmediate(r));
        mock.timers.tick(7000);
        assert.deepEqual(await pending, { ok: false, reason: 'timeout' });
    } finally {
        mock.timers.reset();
    }
});

test('a permission dialog left open does not count as a timeout', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        let answer;
        const nav = {
            permissions: { query: async () => ({ state: 'prompt' }) },
            geolocation: { getCurrentPosition(ok) { answer = ok; } },
        };
        let settled = false;
        const pending = readWebLocation(nav, { prompt: true, timeoutMs: 5000 }).then((r) => { settled = true; return r; });
        await new Promise((r) => setImmediate(r));
        mock.timers.tick(30_000);
        await new Promise((r) => setImmediate(r));
        assert.equal(settled, false);
        answer({ coords: HERE });
        assert.deepEqual(await pending, { ok: true, coords: HERE });
    } finally {
        mock.timers.reset();
    }
});

test('Discover no longer reads the saved profile location and the lobby shows the source card', () => {
    const discover = readFileSync(new URL('../src/screens/DiscoverScreen.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(discover, /me\?\.latitude|me\?\.longitude/);
    assert.match(discover, /getLiveLocation\(/);
    const lobby = readFileSync(new URL('../src/screens/PartyLobbyScreen.tsx', import.meta.url), 'utf8');
    assert.match(lobby, /<LocationSourceCard/);
});
