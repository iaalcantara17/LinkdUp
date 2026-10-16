import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseLocation, choiceLabel, locationSourceLabel, startGate, watchWebPermission, permissionLabel } from '../src/services/locationChoice.ts';
import { confirm, showError, toast, respond, dismiss, getSnapshot, errorText, TOAST_MS } from '../src/components/dialogs.ts';
import { sortDeck } from '../src/services/swipeDeck.ts';

const L = { none: null, ok: { ok: true }, denied: { ok: false, reason: 'denied' }, unavailable: { ok: false, reason: 'unavailable' }, timeout: { ok: false, reason: 'timeout' } };
const LIVE = { kind: 'live' };
const CUSTOM = { kind: 'custom', label: 'Hoboken' };
const ask = (reason) => ({ kind: 'ask', reason });

test('location source state machine covers every mix of preference, live reading and custom place', () => {
    const table = [
        [false, 'none', false, ask('prompt')],
        [false, 'none', true, CUSTOM],
        [false, 'ok', false, LIVE],
        [false, 'ok', true, LIVE],
        [false, 'denied', false, ask('denied')],
        [false, 'denied', true, CUSTOM],
        [false, 'unavailable', false, ask('unavailable')],
        [false, 'unavailable', true, CUSTOM],
        [false, 'timeout', false, ask('timeout')],
        [false, 'timeout', true, CUSTOM],
        [true, 'none', false, ask('prompt')],
        [true, 'none', true, CUSTOM],
        [true, 'ok', false, LIVE],
        [true, 'ok', true, CUSTOM],
        [true, 'denied', false, ask('denied')],
        [true, 'denied', true, CUSTOM],
        [true, 'unavailable', false, ask('unavailable')],
        [true, 'unavailable', true, CUSTOM],
        [true, 'timeout', false, ask('timeout')],
        [true, 'timeout', true, CUSTOM],
    ];
    for (const [preferCustom, live, hasCustom, expected] of table) {
        const input = { preferCustom, live: L[live], custom: hasCustom ? { label: 'Hoboken' } : null };
        assert.deepEqual(chooseLocation(input), expected, JSON.stringify(input));
    }
    assert.deepEqual(
        [LIVE, CUSTOM, ask('denied')].map(choiceLabel),
        ['Live', 'Custom: Hoboken', 'Not set yet'],
    );
});

test('the server my_location view maps to live, custom or not set', () => {
    const cases = [
        [{ mode: 'live', custom_label: null, live_fresh: true }, 'Live'],
        [{ mode: 'custom', custom_label: 'Hoboken', live_fresh: true }, 'Custom: Hoboken'],
        [{ mode: 'custom', custom_label: null, live_fresh: true }, 'Live'],
        [{ mode: 'live', custom_label: 'Hoboken', live_fresh: false }, 'Custom: Hoboken'],
        [{ mode: 'live', custom_label: null, live_fresh: false }, 'Not set yet'],
        [null, 'Not set yet'],
        [undefined, 'Not set yet'],
    ];
    for (const [view, label] of cases) assert.equal(locationSourceLabel(view), label, JSON.stringify(view));
    assert.equal(startGate([{ display_lat: null }, { display_lat: 40.7 }]).canStart, true);
    assert.equal(startGate([{ display_lat: null }]).canStart, false);
});

test('the dialog manager runs a confirm, a queued error and a toast together without losing any', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const asked = confirm({ title: 'Leave party?', confirmLabel: 'Leave', destructive: true });
        const errored = showError('Vote failed', 'Try again');
        toast('Saved');
        assert.equal(getSnapshot().dialog.title, 'Leave party?');
        assert.deepEqual(getSnapshot().toasts.map((t) => t.message), ['Saved']);
        respond(1);
        assert.equal(await asked, true);
        assert.equal(getSnapshot().dialog.title, 'Vote failed');
        dismiss();
        await errored;
        assert.equal(getSnapshot().dialog, null);
        mock.timers.tick(TOAST_MS);
        assert.deepEqual(getSnapshot().toasts, []);
    } finally {
        mock.timers.reset();
    }
});

function serverOrder(a, b) {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
    if (a.rating !== b.rating) {
        if (a.rating == null) return 1;
        if (b.rating == null) return -1;
        return b.rating - a.rating;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

test('deck order is round first, then priority, rating and id, for any arrival order', () => {
    const rounds = ['2026-10-16T10:00:00.000Z', '2026-10-16T10:05:00.000Z'];
    const ratings = [4.8, 4.2, null, 4.2, 3.9];
    const cards = rounds.flatMap((created_at, r) =>
        ratings.map((rating, i) => ({ id: `r${r}-c${i}`, created_at, rating, is_priority: i === 4 })),
    );
    const expected = [...cards].sort(serverOrder).map((c) => c.id);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 25; run++) {
        const shuffled = [...cards].sort(() => random() - 0.5);
        assert.deepEqual(sortDeck(shuffled).map((c) => c.id), expected);
    }
    const order = sortDeck(cards).map((c) => c.created_at);
    assert.ok(order.lastIndexOf(rounds[0]) < order.indexOf(rounds[1]));
});

test('permission changes are reported in order and stop after unsubscribe', async () => {
    const listeners = new Set();
    const status = {
        state: 'prompt',
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
    };
    const seen = [];
    const stop = watchWebPermission({ permissions: { query: async () => status } }, (s) => seen.push(s));
    await new Promise((r) => setImmediate(r));
    for (const next of ['granted', 'denied', 'prompt']) {
        status.state = next;
        for (const fn of listeners) fn();
    }
    stop();
    status.state = 'granted';
    for (const fn of listeners) fn();
    assert.deepEqual(seen, ['prompt', 'granted', 'denied', 'prompt']);
    assert.equal(listeners.size, 0);
    assert.deepEqual(seen.map(permissionLabel), ['Browser location: Not asked yet', 'Browser location: Allowed', 'Browser location: Blocked', 'Browser location: Not asked yet']);
});

function coreFlowErrorCodes() {
    const files = ['party.ts', 'vote.ts', 'match.ts', 'dates.ts', 'calendar.ts', 'auth.ts'];
    const codes = new Set(['missing_token', 'invalid_token', 'not_a_member', 'not_host', 'venue_limit_reached', 'validation_error', 'server_error']);
    for (const f of files) {
        const src = readFileSync(new URL(`../../server/src/routes/${f}`, import.meta.url), 'utf8');
        for (const m of src.matchAll(/new HttpError\((\d{3}), '([a-z_]+)'/g)) codes.add(m[2]);
    }
    return [...codes];
}

test('every error code the core flow can return reads as friendly text, never the raw code', () => {
    const codes = coreFlowErrorCodes();
    assert.ok(codes.length >= 25, `only found ${codes.length} codes`);
    for (const code of codes) {
        const shown = errorText(new Error(code), 'Something went wrong. Try again.');
        assert.ok(!shown.includes(code), `${code} reached the UI`);
        assert.ok(!/[a-z]+_[a-z]+/.test(shown), `${code} showed ${shown}`);
    }
    for (const code of ['not_host', 'not_a_member', 'party_not_found', 'party_already_started', 'party_already_closed', 'party_not_swiping', 'not_solo_party', 'invalid_credentials', 'rate_limited', 'cannot_delete_locked_date']) {
        assert.notEqual(errorText(new Error(code), 'fallback'), 'fallback', `${code} has no specific message`);
    }
    const venueLimit = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8').match(/VENUE_LIMIT_MESSAGE = '([^']+)'/)[1];
    assert.equal(errorText(new Error(venueLimit), 'fallback'), venueLimit);
    assert.equal(errorText(new Error('HTTP 502'), 'fallback'), 'fallback');
    assert.equal(errorText(new Error('Failed to fetch'), 'fallback'), "We couldn't reach the server. Check your connection and try again.");
});
